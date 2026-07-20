import { createPublicClient, formatUnits, http, parseUnits, type Address, zeroAddress } from "viem";
import { polygon } from "viem/chains";

export type OnChainStableToken = "BRLA" | "BRL1" | "BRZ";

export type OnChainMatrixRow = {
  pair: string;
  sourceToken: OnChainStableToken;
  targetToken: OnChainStableToken;
  protocol: string;
  poolAddress: Address;
  feeTier: number;
  directRate: number;
  spotRate: number;
  deviationPct: number;
  slippagePct: number;
  tvlBrl: number;
  simulatedLotBrl: number;
  alertSide: "buy" | "sell" | "watch";
  status: "ok" | "unavailable";
  updatedAt: string;
  notes?: string;
};

export type OnChainMatrixResponse = {
  timestamp: string;
  rpcUrl: string;
  simulatedLotBrl: number;
  thresholdPct: number;
  rows: OnChainMatrixRow[];
  summary: {
    pairsMonitored: number;
    poolsFound: number;
    alerts: number;
    bestOpportunity: OnChainMatrixRow | null;
  };
  warning?: string;
  error?: string;
};

const TOKEN_META: Record<OnChainStableToken, { address: Address; decimals: number; symbol: OnChainStableToken }> = {
  BRLA: {
    address: "0xe6a537a407488807f0bbeb0038b79004f19dddfb",
    decimals: 18,
    symbol: "BRLA",
  },
  BRL1: {
    address: "0x5c067c80c00ecd2345b05e83a3e758ef799c40b5",
    decimals: 18,
    symbol: "BRL1",
  },
  BRZ: {
    address: "0x4ed141110f6d2506c98d1f86ca92d2b1577c9275",
    decimals: 18,
    symbol: "BRZ",
  },
};

const FACTORY_ABI = [
  {
    type: "function",
    name: "getPool",
    stateMutability: "view",
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "fee", type: "uint24" },
    ],
    outputs: [{ name: "pool", type: "address" }],
  },
] as const;

const QUOTER_ABI = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "fee", type: "uint24" },
      { name: "amountIn", type: "uint256" },
      { name: "sqrtPriceLimitX96", type: "uint160" },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

const POOL_ABI = [
  {
    type: "function",
    name: "slot0",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "liquidity",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "liquidity", type: "uint128" }],
  },
  {
    type: "function",
    name: "token0",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "token0", type: "address" }],
  },
  {
    type: "function",
    name: "token1",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "token1", type: "address" }],
  },
] as const;

const ERC20_ABI = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "decimals", type: "uint8" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
] as const;

type ProtocolConfig = {
  key: string;
  label: string;
  factory: Address;
  quoter: Address;
  feeTiers: number[];
};

const DEFAULT_PROTOCOLS: ProtocolConfig[] = [
  {
    key: "uniswap-v3",
    label: "Polygon / Uniswap V3",
    factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    feeTiers: [100, 500, 3000, 10000],
  },
];

function safeNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeAddress(value: string | undefined): Address | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("0x") || trimmed.length !== 42) return null;
  return trimmed as Address;
}

function loadProtocols(): ProtocolConfig[] {
  const protocols = [...DEFAULT_PROTOCOLS];
  const extra = process.env.USDT_INFINITY_ONCHAIN_PROTOCOLS_JSON;
  if (!extra) return protocols;

  try {
    const parsed = JSON.parse(extra) as Array<{
      key?: string;
      label?: string;
      factory?: string;
      quoter?: string;
      feeTiers?: number[];
    }>;
    for (const entry of parsed) {
      const factory = safeAddress(entry.factory);
      const quoter = safeAddress(entry.quoter);
      const feeTiers = Array.isArray(entry.feeTiers) ? entry.feeTiers.filter((fee) => Number.isFinite(fee) && fee > 0) : [];
      if (!factory || !quoter || feeTiers.length === 0) continue;
      protocols.push({
        key: entry.key?.trim() || `custom-${protocols.length + 1}`,
        label: entry.label?.trim() || "Custom protocol",
        factory,
        quoter,
        feeTiers,
      });
    }
  } catch {
    // Ignore malformed config and fall back to the default scanner.
  }

  return protocols;
}

function getClient() {
  const rpcUrl = process.env.POLYGON_RPC_URL || "https://polygon-rpc.com";
  return {
    rpcUrl,
    client: createPublicClient({
      chain: polygon,
      transport: http(rpcUrl, {
        timeout: 8_000,
      }),
    }),
  };
}

function getSpotRateFromSqrtPrice(
  sqrtPriceX96: bigint,
  tokenIn: OnChainStableToken,
  tokenOut: OnChainStableToken,
  token0: Address,
  token1: Address,
  token0Decimals: number,
  token1Decimals: number
): number {
  const ratio = Number(sqrtPriceX96) / 2 ** 96;
  if (!Number.isFinite(ratio) || ratio <= 0) return 0;

  const rawPrice1Per0 = ratio * ratio * 10 ** (token0Decimals - token1Decimals);
  if (!Number.isFinite(rawPrice1Per0) || rawPrice1Per0 <= 0) return 0;

  const inputIsToken0 = TOKEN_META[tokenIn].address.toLowerCase() === token0.toLowerCase();
  const outputIsToken1 = TOKEN_META[tokenOut].address.toLowerCase() === token1.toLowerCase();
  if (inputIsToken0 && outputIsToken1) return rawPrice1Per0;
  return 1 / rawPrice1Per0;
}

function formatPairLabel(sourceToken: OnChainStableToken, targetToken: OnChainStableToken): string {
  return `${sourceToken} → ${targetToken}`;
}

async function fetchTokenDecimals(
  client: ReturnType<typeof createPublicClient>,
  token: OnChainStableToken
): Promise<number> {
  try {
    const decimals = await client.readContract({
      address: TOKEN_META[token].address,
      abi: ERC20_ABI,
      functionName: "decimals",
    });
    return safeNumber(decimals) || TOKEN_META[token].decimals;
  } catch {
    return TOKEN_META[token].decimals;
  }
}

async function discoverPoolAddress(
  client: ReturnType<typeof createPublicClient>,
  protocol: ProtocolConfig,
  tokenIn: OnChainStableToken,
  tokenOut: OnChainStableToken,
  feeTier: number
): Promise<Address | null> {
  try {
    const pool = await client.readContract({
      address: protocol.factory,
      abi: FACTORY_ABI,
      functionName: "getPool",
      args: [TOKEN_META[tokenIn].address, TOKEN_META[tokenOut].address, feeTier],
    });
    return pool && pool !== zeroAddress ? pool : null;
  } catch {
    return null;
  }
}

async function inspectPool(
  client: ReturnType<typeof createPublicClient>,
  protocol: ProtocolConfig,
  tokenIn: OnChainStableToken,
  tokenOut: OnChainStableToken,
  feeTier: number,
  poolAddress: Address,
  simulatedLotBrl: number
): Promise<OnChainMatrixRow> {
  const [slot0, token0, token1, tokenInDecimals, tokenOutDecimals, tokenInBalance, tokenOutBalance] = await Promise.all([
    client.readContract({ address: poolAddress, abi: POOL_ABI, functionName: "slot0" }),
    client.readContract({ address: poolAddress, abi: POOL_ABI, functionName: "token0" }),
    client.readContract({ address: poolAddress, abi: POOL_ABI, functionName: "token1" }),
    fetchTokenDecimals(client, tokenIn),
    fetchTokenDecimals(client, tokenOut),
    client.readContract({
      address: TOKEN_META[tokenIn].address,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [poolAddress],
    }),
    client.readContract({
      address: TOKEN_META[tokenOut].address,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [poolAddress],
    }),
  ]);

  const amountIn = parseUnits(simulatedLotBrl.toFixed(Math.min(tokenInDecimals, 6)), tokenInDecimals);
  let amountOut: bigint | null = null;
  try {
    const quote = await client.readContract({
      address: protocol.quoter,
      abi: QUOTER_ABI,
      functionName: "quoteExactInputSingle",
      args: [TOKEN_META[tokenIn].address, TOKEN_META[tokenOut].address, feeTier, amountIn, BigInt(0)],
    });
    amountOut = Array.isArray(quote) ? (quote[0] as bigint) : (quote as bigint);
  } catch {
    amountOut = null;
  }

  const directRate = amountOut !== null ? Number(formatUnits(amountOut, tokenOutDecimals)) / Number(formatUnits(amountIn, tokenInDecimals)) : 0;
  const spotRate = getSpotRateFromSqrtPrice(
    slot0[0] as bigint,
    tokenIn,
    tokenOut,
    token0 as Address,
    token1 as Address,
    tokenInDecimals,
    tokenOutDecimals
  );

  const deviationPct = directRate > 0 ? (directRate - 1) * 100 : 0;
  const slippagePct = directRate > 0 && spotRate > 0 ? ((directRate - spotRate) / spotRate) * 100 : 0;

  const tokenInBalanceBrl = Number(formatUnits(tokenInBalance as bigint, tokenInDecimals));
  const tokenOutBalanceBrl = Number(formatUnits(tokenOutBalance as bigint, tokenOutDecimals));
  const tvlBrl = Number((tokenInBalanceBrl + tokenOutBalanceBrl).toFixed(2));

  const alertSide: OnChainMatrixRow["alertSide"] = deviationPct <= -0.5 ? "buy" : deviationPct >= 0.5 ? "sell" : "watch";

  return {
    pair: formatPairLabel(tokenIn, tokenOut),
    sourceToken: tokenIn,
    targetToken: tokenOut,
    protocol: `${protocol.label} · fee ${feeTier / 10000}%`,
    poolAddress,
    feeTier,
    directRate: Number(directRate.toFixed(6)),
    spotRate: Number(spotRate.toFixed(6)),
    deviationPct: Number(deviationPct.toFixed(4)),
    slippagePct: Number(slippagePct.toFixed(4)),
    tvlBrl,
    simulatedLotBrl,
    alertSide,
    status: amountOut !== null ? "ok" : "unavailable",
    updatedAt: new Date().toISOString(),
    notes:
      amountOut !== null
        ? "Pool ativa com liquidez on-chain em Polygon."
        : "Pool encontrada, mas o quoter nao retornou a simulacao deste lote.",
  };
}

export async function scanPolygonBrlStableMatrix(params: {
  simulatedLotBrl: number;
  thresholdPct: number;
}): Promise<OnChainMatrixResponse> {
  const { simulatedLotBrl, thresholdPct } = params;
  const { client, rpcUrl } = getClient();
  const protocols = loadProtocols();
  const tokens: OnChainStableToken[] = ["BRLA", "BRL1", "BRZ"];
  const rows: OnChainMatrixRow[] = [];
  let poolsFound = 0;

  for (const protocol of protocols) {
    for (const sourceToken of tokens) {
      for (const targetToken of tokens) {
        if (sourceToken === targetToken) continue;

        const feeTier = protocol.feeTiers[0] ?? 3000;
        const poolAddress = await discoverPoolAddress(client, protocol, sourceToken, targetToken, feeTier);
        if (!poolAddress) {
          rows.push({
            pair: formatPairLabel(sourceToken, targetToken),
            sourceToken,
            targetToken,
            protocol: `${protocol.label} · sem pool`,
            poolAddress: zeroAddress,
            feeTier,
            directRate: 0,
            spotRate: 0,
            deviationPct: 0,
            slippagePct: 0,
            tvlBrl: 0,
            simulatedLotBrl,
            alertSide: "watch",
            status: "unavailable",
            updatedAt: new Date().toISOString(),
            notes: "Pool nao encontrada via factory para a fee tier configurada.",
          });
          continue;
        }

        poolsFound += 1;
        try {
          const row = await inspectPool(client, protocol, sourceToken, targetToken, feeTier, poolAddress, simulatedLotBrl);
          if (Math.abs(row.deviationPct) < thresholdPct) {
            row.alertSide = "watch";
          }
          rows.push(row);
        } catch (err) {
          rows.push({
            pair: formatPairLabel(sourceToken, targetToken),
            sourceToken,
            targetToken,
            protocol: `${protocol.label} · pool ${poolAddress}`,
            poolAddress,
            feeTier,
            directRate: 0,
            spotRate: 0,
            deviationPct: 0,
            slippagePct: 0,
            tvlBrl: 0,
            simulatedLotBrl,
            alertSide: "watch",
            status: "unavailable",
            updatedAt: new Date().toISOString(),
            notes: String(err ?? "Falha ao inspecionar pool"),
          });
        }
      }
    }
  }

  const sortedRows = rows.sort((a, b) => Math.abs(b.deviationPct) - Math.abs(a.deviationPct));
  const alertRows = sortedRows.filter((row) => row.status === "ok" && Math.abs(row.deviationPct) >= thresholdPct);

  return {
    timestamp: new Date().toISOString(),
    rpcUrl,
    simulatedLotBrl,
    thresholdPct,
    rows: sortedRows,
    summary: {
      pairsMonitored: tokens.length * (tokens.length - 1),
      poolsFound,
      alerts: alertRows.length,
      bestOpportunity: sortedRows.find((row) => row.status === "ok") ?? null,
    },
    warning: protocols.length > 1 ? "Protocolos extras dependem de factory/quoter compativeis com o scanner." : undefined,
  };
}
