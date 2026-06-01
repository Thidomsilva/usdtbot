"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type QuoteAsset = "USD" | "BRL" | "EUR" | "XAU";
type DirectionMode = "all" | "buy_discount" | "sell_premium";

type DepegRow = {
  id: string;
  label: string;
  symbol: string;
  quote_asset: QuoteAsset;
  status: "ok" | "unavailable";
  analyzed_on: string;
  peg_reference: string;
  market_price: number | null;
  market_price_brl: number | null;
  bid_price: number | null;
  ask_price: number | null;
  orderbook_spread_pct: number | null;
  ideal_price: number | null;
  ideal_price_brl: number | null;
  depeg_pct: number | null;
  asymmetry_pct: number | null;
  direction: "above_peg" | "below_peg";
  severity: "low" | "medium" | "high";
  signal: "watch" | "opportunity" | "stress";
  notes: string;
};

type DepegResponse = {
  timestamp: string;
  source: string;
  threshold_pct: number;
  usd_brl: number | null;
  monitored_rows: DepegRow[];
  opportunities: DepegRow[];
  summary: {
    monitored_pairs: number;
    above_threshold: number;
    max_asymmetry_pct: number;
    best_opportunity: {
      id: string;
      label: string;
      depeg_pct: number;
      asymmetry_pct: number;
      direction: "above_peg" | "below_peg";
      signal: "watch" | "opportunity" | "stress";
      net_margin_pct: number | null;
    } | null;
  };
  warning?: string;
  error?: string;
};

type DepegHistoryPoint = {
  key: string;
  timestamp: string;
  id: string;
  label: string;
  symbol: string;
  quote_asset: QuoteAsset;
  market_price: number;
  ideal_price: number;
  depeg_pct: number;
  asymmetry_pct: number;
  direction: "above_peg" | "below_peg";
  severity: "low" | "medium" | "high";
  analyzed_on: string;
};

type StablecoinCategory = "USD" | "EUR" | "BRL" | "XAU";

type StablecoinContract = {
  network: string;
  contract: string;
};

type StablecoinCatalogItem = {
  token: string;
  issuer: string;
  parity: string;
  category: StablecoinCategory;
  contracts: StablecoinContract[];
  docsUrl: string;
  warning?: string;
};

const REFRESH_SECONDS = 5;
const MAX_HISTORY_POINTS = 240;

const DEFAULT_MONITORED_ASSETS: Array<
  Pick<DepegRow, "id" | "label" | "symbol" | "quote_asset" | "peg_reference"> & {
    ideal_price: number;
    analyzed_on: string;
  }
> = [
  {
    id: "brz",
    label: "BRZ",
    symbol: "BRZ/BRL",
    quote_asset: "BRL",
    peg_reference: "BRL stablecoin (1:1)",
    ideal_price: 1,
    analyzed_on: "CoinMarketCap",
  },
  {
    id: "brla",
    label: "BRLA",
    symbol: "BRLA/BRL",
    quote_asset: "BRL",
    peg_reference: "BRL stablecoin (1:1)",
    ideal_price: 1,
    analyzed_on: "DefiLlama",
  },
  {
    id: "usds",
    label: "USDS",
    symbol: "USDS/USD",
    quote_asset: "USD",
    peg_reference: "USD stablecoin (1:1)",
    ideal_price: 1,
    analyzed_on: "CoinMarketCap",
  },
  {
    id: "pyusd",
    label: "PYUSD",
    symbol: "PYUSD/USD",
    quote_asset: "USD",
    peg_reference: "USD stablecoin (1:1)",
    ideal_price: 1,
    analyzed_on: "CoinMarketCap",
  },
  {
    id: "fdusd",
    label: "FDUSD",
    symbol: "FDUSD/USD",
    quote_asset: "USD",
    peg_reference: "USD stablecoin (1:1)",
    ideal_price: 1,
    analyzed_on: "CoinMarketCap",
  },
  {
    id: "gusd",
    label: "GUSD",
    symbol: "GUSD/USD",
    quote_asset: "USD",
    peg_reference: "USD stablecoin (1:1)",
    ideal_price: 1,
    analyzed_on: "CoinMarketCap",
  },
  {
    id: "usdp",
    label: "USDP",
    symbol: "USDP/USD",
    quote_asset: "USD",
    peg_reference: "USD stablecoin (1:1)",
    ideal_price: 1,
    analyzed_on: "CoinMarketCap",
  },
  {
    id: "rlusd",
    label: "RLUSD",
    symbol: "RLUSD/USD",
    quote_asset: "USD",
    peg_reference: "USD stablecoin (1:1)",
    ideal_price: 1,
    analyzed_on: "CoinMarketCap",
  },
  {
    id: "usdr",
    label: "USDR",
    symbol: "USDR/USD",
    quote_asset: "USD",
    peg_reference: "USD stablecoin (1:1)",
    ideal_price: 1,
    analyzed_on: "CoinMarketCap",
  },
  {
    id: "eurc",
    label: "EURC",
    symbol: "EURC/EUR",
    quote_asset: "EUR",
    peg_reference: "EUR stablecoin (1:1)",
    ideal_price: 1,
    analyzed_on: "CoinMarketCap",
  },
  {
    id: "eurr",
    label: "EURR",
    symbol: "EURR/EUR",
    quote_asset: "EUR",
    peg_reference: "EUR stablecoin (1:1)",
    ideal_price: 1,
    analyzed_on: "CoinMarketCap",
  },
  {
    id: "wbrl",
    label: "WBRL",
    symbol: "WBRL/BRL",
    quote_asset: "BRL",
    peg_reference: "BRL stablecoin (1:1)",
    ideal_price: 1,
    analyzed_on: "CoinMarketCap",
  },
  {
    id: "paxg",
    label: "PAXG",
    symbol: "PAXG/XAU",
    quote_asset: "XAU",
    peg_reference: "Gold token (1 troy oz)",
    ideal_price: 1,
    analyzed_on: "CoinMarketCap",
  },
  {
    id: "xaut",
    label: "XAUT",
    symbol: "XAUT/XAU",
    quote_asset: "XAU",
    peg_reference: "Gold token (1 troy oz)",
    ideal_price: 1,
    analyzed_on: "CoinMarketCap",
  },
  {
    id: "usdt",
    label: "USDT",
    symbol: "USDT/USD",
    quote_asset: "USD",
    peg_reference: "USD stablecoin (1:1)",
    ideal_price: 1,
    analyzed_on: "CoinMarketCap",
  },
  {
    id: "brl1",
    label: "BRL1",
    symbol: "BRL1/BRL",
    quote_asset: "BRL",
    peg_reference: "BRL stablecoin (1:1)",
    ideal_price: 1,
    analyzed_on: "CoinMarketCap",
  },
  {
    id: "dai",
    label: "DAI",
    symbol: "DAI/USD",
    quote_asset: "USD",
    peg_reference: "USD stablecoin (1:1)",
    ideal_price: 1,
    analyzed_on: "CoinMarketCap",
  },
  {
    id: "usdc",
    label: "USDC",
    symbol: "USDC/USD",
    quote_asset: "USD",
    peg_reference: "USD stablecoin (1:1)",
    ideal_price: 1,
    analyzed_on: "CoinMarketCap",
  },
];

const MONITORED_ASSET_ORDER = DEFAULT_MONITORED_ASSETS.map((asset) => asset.id);

const STABLECOIN_CATALOG: StablecoinCatalogItem[] = [
  {
    token: "USDT",
    issuer: "Tether",
    parity: "USD",
    category: "USD",
    contracts: [
      { network: "Ethereum (ERC-20)", contract: "0xdac17f958d2ee523a2206206994597c13d831ec7" },
      { network: "TRON (TRC-20)", contract: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t" },
      { network: "BNB Chain (BEP-20)", contract: "0x55d398326f99059ff775485246999027b3197955" },
      { network: "Polygon", contract: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f" },
      { network: "Arbitrum", contract: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9" },
      { network: "Avalanche", contract: "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7" },
      { network: "Solana (SPL)", contract: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB" },
    ],
    docsUrl: "https://tether.to/en/api-documentation/",
  },
  {
    token: "USDC",
    issuer: "Circle",
    parity: "USD",
    category: "USD",
    contracts: [
      { network: "Ethereum (ERC-20)", contract: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" },
      { network: "Solana (SPL)", contract: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
      { network: "BNB Chain (BEP-20)", contract: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d" },
      { network: "Polygon", contract: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359" },
      { network: "Arbitrum", contract: "0xaf88d065e77c8cc2239327c5edb3a432268e5831" },
      { network: "Base", contract: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" },
      { network: "Avalanche", contract: "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e" },
    ],
    docsUrl: "https://developers.circle.com/",
  },
  {
    token: "DAI",
    issuer: "Sky (MakerDAO)",
    parity: "USD",
    category: "USD",
    contracts: [{ network: "Ethereum (ERC-20)", contract: "0x6b175474e89094c44da98b954eedeac495271d0f" }],
    docsUrl: "https://docs.makerdao.com/",
  },
  {
    token: "USDS",
    issuer: "Sky (ex-MakerDAO)",
    parity: "USD",
    category: "USD",
    contracts: [
      { network: "Ethereum (ERC-20)", contract: "0xdc035d45d973e3ec169d2276ddab16f1e407384f" },
      { network: "Solana (SPL)", contract: "USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA" },
    ],
    docsUrl: "https://developers.skyeco.com/",
  },
  {
    token: "PYUSD",
    issuer: "PayPal / Paxos",
    parity: "USD",
    category: "USD",
    contracts: [
      { network: "Ethereum (ERC-20)", contract: "0x6c3ea9036406852006290770bedfcaba0e23a0e8" },
      { network: "Solana (SPL)", contract: "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo" },
    ],
    docsUrl: "https://developer.paypal.com/docs/checkout/stablecoins/",
  },
  {
    token: "FDUSD",
    issuer: "First Digital Labs",
    parity: "USD",
    category: "USD",
    contracts: [
      { network: "Ethereum (ERC-20)", contract: "0xc5f0f7b66764f6ec8c8dff7ba683102295e16409" },
      { network: "BNB Chain (BEP-20)", contract: "0xc5f0f7b66764f6ec8c8dff7ba683102295e16409" },
      { network: "Arbitrum", contract: "0x93c9932e4afa59201f0b5e63f7d816516f1669fe" },
      { network: "Solana (SPL)", contract: "9zNQRsGLjNKwCUU5Gq5LR8beUCPzQMVMqKAi3SSZh54u" },
    ],
    docsUrl: "https://firstdigitallabs.com/developers",
  },
  {
    token: "GUSD",
    issuer: "Gemini",
    parity: "USD",
    category: "USD",
    contracts: [{ network: "Ethereum (ERC-20)", contract: "0x056fd409e1d7a124bd7017459dfea2f387b6d5cd" }],
    docsUrl: "https://developer.gemini.com/",
  },
  {
    token: "USDP",
    issuer: "Paxos",
    parity: "USD",
    category: "USD",
    contracts: [{ network: "Ethereum (ERC-20)", contract: "0x8e870d67f660d95d5be530380d0ec0bd388289e1" }],
    docsUrl: "https://docs.paxos.com/",
  },
  {
    token: "RLUSD",
    issuer: "Ripple",
    parity: "USD",
    category: "USD",
    contracts: [
      { network: "Ethereum (ERC-20)", contract: "0x8292bb45bf1ee4d140127049757c2e0ff06317ed" },
      { network: "XRP Ledger", contract: "Verificar em xrpl.org" },
    ],
    docsUrl: "https://docs.ripple.com/",
  },
  {
    token: "USDR",
    issuer: "StablR",
    parity: "USD",
    category: "USD",
    contracts: [{ network: "Ethereum (ERC-20)", contract: "0x7b43e3875440b44613dc3bc08e7763e6da63c8f8" }],
    docsUrl: "https://www.stablr.com/usdr",
    warning: "Exploit reportado em 05/2026",
  },
  {
    token: "EURC",
    issuer: "Circle",
    parity: "EUR",
    category: "EUR",
    contracts: [
      { network: "Ethereum (ERC-20)", contract: "0x1abaea1f7c830bd89acc67ec4af516284b1bc33c" },
      { network: "Solana (SPL)", contract: "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr" },
    ],
    docsUrl: "https://developers.circle.com/",
  },
  {
    token: "EURR",
    issuer: "StablR",
    parity: "EUR",
    category: "EUR",
    contracts: [{ network: "Ethereum (ERC-20)", contract: "0x50753cfaf86c094925bf976f218d043f8791e408" }],
    docsUrl: "https://www.stablr.com/eurr",
    warning: "Exploit reportado em 05/2026",
  },
  {
    token: "BRZ",
    issuer: "Transfero",
    parity: "BRL",
    category: "BRL",
    contracts: [
      { network: "Ethereum (ERC-20)", contract: "0x01d33fd36ec67c6ada32cf36b31e88ee190b1839" },
      { network: "Polygon", contract: "0x4ed141110f6d2506c98d1f86ca92d2b1577c9275" },
      { network: "BNB Chain (BEP-20)", contract: "0x71be881e9c5d4465b3fff61e89c6f3651e69b5bb" },
      { network: "Arbitrum", contract: "0xa8940698fda5a07abaef4a5ccdf2f1bb525b47a2" },
      { network: "Avalanche", contract: "0x491a4eb4f1fc3bff8e1d2fc856a6a46663ad556f" },
    ],
    docsUrl: "https://transfero.com/developers/",
  },
  {
    token: "BRL1",
    issuer: "Bitso / Mercado Bitcoin / Foxbit / Cainvest",
    parity: "BRL",
    category: "BRL",
    contracts: [{ network: "Polygon", contract: "0x5c067c80c00ecd2345b05e83a3e758ef799c40b5" }],
    docsUrl: "https://brl1.io/en/",
  },
  {
    token: "BRLA",
    issuer: "Avenia (ex-BRLA Digital)",
    parity: "BRL",
    category: "BRL",
    contracts: [
      { network: "Polygon", contract: "0xe6a537a407488807f0bbeb0038b79004f19dddfb" },
      { network: "Ethereum (ERC-20)", contract: "Verificar em avenia.io" },
      { network: "Base", contract: "Verificar em avenia.io" },
      { network: "Gnosis", contract: "Verificar em avenia.io" },
    ],
    docsUrl: "https://avenia.io/brla",
  },
  {
    token: "WBRL",
    issuer: "Ripio (wFiat)",
    parity: "BRL",
    category: "BRL",
    contracts: [
      { network: "Ethereum (ERC-20)", contract: "0xd76...4390e0 (verificar em etherscan.io)" },
      { network: "Base", contract: "Mesmo endereco (verificar em basescan.org)" },
      { network: "BNB Chain (BEP-20)", contract: "Mesmo endereco (verificar em bscscan.com)" },
      { network: "Polygon", contract: "Mesmo endereco (verificar em polygonscan.com)" },
      { network: "Gnosis", contract: "Mesmo endereco (verificar em gnosisscan.io)" },
    ],
    docsUrl: "https://www.ripio.com/en/cryptos/local-stablecoins",
  },
  {
    token: "PAXG",
    issuer: "Paxos",
    parity: "1 troy oz ouro",
    category: "XAU",
    contracts: [{ network: "Ethereum (ERC-20)", contract: "0x45804880de22913dafe09f4980848ece6ecbaf78" }],
    docsUrl: "https://docs.paxos.com/",
  },
  {
    token: "XAUT",
    issuer: "Tether Gold",
    parity: "1 troy oz ouro",
    category: "XAU",
    contracts: [
      { network: "Ethereum (ERC-20)", contract: "0x68749665ff8d2d112fa859aa293f07a622782f38" },
      { network: "TRON (TRC-20)", contract: "Verificar em tether.to/gold" },
    ],
    docsUrl: "https://tether.to/en/api-documentation/",
  },
];

function pct(value: number | null): string {
  if (value === null) return "--";
  return `${value >= 0 ? "+" : ""}${value.toFixed(4)}%`;
}

function price(value: number | null, quoteAsset: QuoteAsset): string {
  if (value === null) return "--";
  return `${quoteAsset} ${value.toFixed(6)}`;
}

function brl(value: number | null): string {
  if (value === null) return "--";
  return `R$ ${value.toFixed(6)}`;
}

function severityColor(level: DepegRow["severity"]): string {
  if (level === "high") return "#ef4444";
  if (level === "medium") return "#f59e0b";
  return "#22c55e";
}

function directionLabel(direction: DepegRow["direction"]): string {
  return direction === "below_peg" ? "Abaixo do peg" : "Acima do peg";
}

function unavailableSignal(notes: string): string {
  const normalized = notes.toLowerCase();
  if (normalized.includes("timeout")) return "Timeout";
  if (normalized.includes("bloqueado") || normalized.includes("regiao")) return "Bloqueio regional";
  return "Sem cotacao";
}

function actionSignal(row: DepegRow, activeThresholdPct: number): { label: string; color: string } {
  if (row.depeg_pct === null || row.asymmetry_pct === null) {
    return { label: "SEM DADO", color: "var(--muted)" };
  }

  if (row.asymmetry_pct < activeThresholdPct) {
    return { label: "NORMAL", color: "#22c55e" };
  }

  if (row.depeg_pct < 0) {
    return { label: "DESCONTO", color: "#f59e0b" };
  }

  return { label: "PREMIO", color: "#ef4444" };
}

function buildUnavailableRow(asset: (typeof DEFAULT_MONITORED_ASSETS)[number]): DepegRow {
  return {
    id: asset.id,
    label: asset.label,
    symbol: asset.symbol,
    quote_asset: asset.quote_asset,
    status: "unavailable",
    analyzed_on: asset.analyzed_on,
    peg_reference: asset.peg_reference,
    market_price: null,
    market_price_brl: null,
    bid_price: null,
    ask_price: null,
    orderbook_spread_pct: null,
    ideal_price: asset.ideal_price,
    ideal_price_brl: asset.quote_asset === "BRL" ? 1 : null,
    depeg_pct: null,
    asymmetry_pct: null,
    direction: "below_peg",
    severity: "low",
    signal: "watch",
    notes: "Ativo monitorado, sem dados retornados neste ciclo.",
  };
}

export default function DepegArbitragePage() {
  const [data, setData] = useState<DepegResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(REFRESH_SECONDS);
  const [thresholdInput, setThresholdInput] = useState("0.35");
  const [directionMode, setDirectionMode] = useState<DirectionMode>("all");
  const [history, setHistory] = useState<DepegHistoryPoint[]>([]);
  const [catalogFilter, setCatalogFilter] = useState<"ALL" | StablecoinCategory>("ALL");

  const thresholdNum = useMemo(() => {
    const parsed = Number(thresholdInput.replace(",", "."));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0.35;
  }, [thresholdInput]);

  async function load() {
    try {
      const qs = new URLSearchParams({ min_depeg_pct: String(thresholdNum), direction_mode: directionMode });
      const res = await fetch(`/api/depeg-arbitrage?${qs.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as DepegResponse;
      setData(json);
    } catch (err) {
      const fallbackRows: DepegRow[] = DEFAULT_MONITORED_ASSETS.map(buildUnavailableRow);

      setData({
        timestamp: new Date().toISOString(),
        source: "frontend-fallback",
        threshold_pct: thresholdNum,
        usd_brl: null,
        monitored_rows: fallbackRows,
        opportunities: [],
        summary: {
          monitored_pairs: fallbackRows.length,
          above_threshold: 0,
          max_asymmetry_pct: 0,
          best_opportunity: null,
        },
        error: `Falha ao carregar API de de-peg: ${String(err)}`,
        warning: "Exibindo ativos monitorados sem cotacao neste ciclo.",
      });
    } finally {
      setLoading(false);
      setCountdown(REFRESH_SECONDS);
    }
  }

  useEffect(() => {
    load();
    const refreshTimer = setInterval(load, REFRESH_SECONDS * 1000);
    const countdownTimer = setInterval(() => setCountdown((c) => (c > 0 ? c - 1 : 0)), 1000);

    return () => {
      clearInterval(refreshTimer);
      clearInterval(countdownTimer);
    };
  }, [thresholdNum, directionMode]);

  const rowsToRender = useMemo(() => {
    if (!data) return [] as DepegRow[];

    const apiRows = Array.isArray(data.monitored_rows) && data.monitored_rows.length > 0
      ? data.monitored_rows
      : Array.isArray(data.opportunities) && data.opportunities.length > 0
        ? data.opportunities
        : [];

    const apiRowsById = new Map(apiRows.map((row) => [row.id, row]));

    // Sempre renderiza a lista monitorada nessa ordem fixa.
    return MONITORED_ASSET_ORDER.map((assetId) => {
      const apiRow = apiRowsById.get(assetId);
      if (apiRow) return apiRow;

      const fallbackAsset = DEFAULT_MONITORED_ASSETS.find((asset) => asset.id === assetId);
      return fallbackAsset ? buildUnavailableRow(fallbackAsset) : null;
    }).filter((row): row is DepegRow => row !== null);
  }, [data]);

  useEffect(() => {
    if (!data?.timestamp) return;

    const newPoints: DepegHistoryPoint[] = rowsToRender
      .filter(
        (row): row is DepegRow & { market_price: number; ideal_price: number; depeg_pct: number; asymmetry_pct: number } =>
          row.status === "ok" &&
          row.market_price !== null &&
          row.ideal_price !== null &&
          row.depeg_pct !== null &&
          row.asymmetry_pct !== null
      )
      .map((row) => ({
        key: `${row.id}:${data.timestamp}`,
        timestamp: data.timestamp,
        id: row.id,
        label: row.label,
        symbol: row.symbol,
        quote_asset: row.quote_asset,
        market_price: row.market_price,
        ideal_price: row.ideal_price,
        depeg_pct: row.depeg_pct,
        asymmetry_pct: row.asymmetry_pct,
        direction: row.direction,
        severity: row.severity,
        analyzed_on: row.analyzed_on,
      }));

    if (newPoints.length === 0) return;

    setHistory((prev) => {
      const map = new Map<string, DepegHistoryPoint>();
      for (const point of [...newPoints, ...prev]) {
        if (!map.has(point.key)) {
          map.set(point.key, point);
        }
      }

      return [...map.values()]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, MAX_HISTORY_POINTS);
    });
  }, [data?.timestamp, rowsToRender]);

  const filteredRows = useMemo(() => {
    return rowsToRender.filter((row) => {
      if (directionMode === "all") return true;
      if (directionMode === "buy_discount") {
        return row.status === "ok" && row.depeg_pct !== null && row.depeg_pct < 0;
      }
      return row.status === "ok" && row.depeg_pct !== null && row.depeg_pct > 0;
    });
  }, [directionMode, rowsToRender]);

  const rankedRows = filteredRows;

  const activeThresholdPct = data?.threshold_pct ?? thresholdNum;

  const historyRows = useMemo(() => {
    return history
      .filter((point) => point.asymmetry_pct >= activeThresholdPct)
      .sort((a, b) => {
        const byTime = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        if (byTime !== 0) return byTime;
        return b.asymmetry_pct - a.asymmetry_pct;
      })
      .slice(0, 80);
  }, [history, activeThresholdPct]);

  const monitoredCount = data ? Math.max(data.summary.monitored_pairs, rowsToRender.length) : 0;

  const filteredCatalog = useMemo(() => {
    return STABLECOIN_CATALOG.filter((item) => catalogFilter === "ALL" || item.category === catalogFilter);
  }, [catalogFilter]);

  return (
    <main className="page-shell" style={{ minHeight: "100vh", padding: 24 }}>
      <div className="page-container" style={{ maxWidth: 1180, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", gap: 10, fontSize: 13, marginBottom: 8, flexWrap: "wrap" }}>
              <Link href="/" style={{ textDecoration: "none", color: "var(--muted)" }}>USDT/BRL</Link>
              <Link href="/fan-tokens" style={{ textDecoration: "none", color: "var(--muted)" }}>Arbitragem Geral</Link>
              <Link href="/spot-futures" style={{ textDecoration: "none", color: "var(--muted)" }}>Spot x Futuro</Link>
            </div>
            <h1 style={{ margin: 0, fontSize: 34, letterSpacing: "-0.8px", fontWeight: 800 }}>Monitor de De-peg por Ativo</h1>
            <p style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: 15 }}>
              Monitoramento individual de cada stablecoin, sem cruzamento entre pares, contra seu peg teorico.
            </p>
          </div>
          <button
            onClick={() => {
              setLoading(true);
              load();
            }}
            disabled={loading}
            style={{
              border: "1px solid var(--card-border)",
              borderRadius: 12,
              padding: "10px 14px",
              background: "linear-gradient(135deg, var(--card), rgba(255,255,255,0.12))",
              color: "var(--text)",
              cursor: "pointer",
            }}
          >
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
        </header>

        <section
          style={{
            marginTop: 18,
            background: "var(--card)",
            border: "1px solid var(--card-border)",
            borderRadius: 16,
            padding: 16,
            display: "grid",
            gap: 12,
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>Limiar minimo de de-peg (%)</span>
              <input
                value={thresholdInput}
                onChange={(e) => setThresholdInput(e.target.value)}
                inputMode="decimal"
                style={{
                  border: "1px solid var(--card-border)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  background: "rgba(255,255,255,0.04)",
                  color: "var(--text)",
                }}
              />
            </label>
            <div style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>Direcao</span>
              <div style={{ display: "inline-flex", border: "1px solid var(--card-border)", borderRadius: 10, overflow: "hidden", width: "fit-content" }}>
                {[
                  { value: "all", label: "Todas" },
                  { value: "buy_discount", label: "Abaixo do peg" },
                  { value: "sell_premium", label: "Acima do peg" },
                ].map((mode) => {
                  const active = directionMode === mode.value;
                  return (
                    <button
                      key={mode.value}
                      onClick={() => setDirectionMode(mode.value as DirectionMode)}
                      style={{
                        border: "none",
                        borderRight: mode.value === "sell_premium" ? "none" : "1px solid var(--card-border)",
                        padding: "10px 12px",
                        background: active ? "rgba(14, 165, 233, 0.18)" : "rgba(255,255,255,0.04)",
                        color: active ? "var(--text)" : "var(--muted)",
                        fontWeight: active ? 700 : 500,
                        cursor: "pointer",
                      }}
                    >
                      {mode.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div style={{ fontSize: 13, color: "var(--muted)", display: "flex", gap: 8, flexWrap: "wrap" }}>
            {data
              ? `${monitoredCount} ativos monitorados · ${data.summary.above_threshold} acima do limiar · max de-peg ${data.summary.max_asymmetry_pct.toFixed(4)}%`
              : "Carregando monitoramento de de-peg..."}
            <span>· proxima atualizacao em {countdown}s</span>
          </div>

          {data?.usd_brl && (
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              Referencia cambial: 1 USD = R$ {data.usd_brl.toFixed(4)}
            </div>
          )}

          {data && data.summary.above_threshold === 0 && (
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              Sem de-peg acima do limiar no momento, mas os precos continuam sendo monitorados para todos os ativos.
            </div>
          )}

          {data?.warning && <div style={{ fontSize: 12, color: "#f59e0b" }}>Aviso: {data.warning}</div>}
          {data?.error && <div style={{ fontSize: 12, color: "#ef4444" }}>Erro: {data.error}</div>}
        </section>

        <section
          style={{
            marginTop: 12,
            background: "var(--card)",
            border: "1px solid var(--card-border)",
            borderRadius: 16,
            padding: 12,
            overflowX: "auto",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--card-border)", color: "var(--muted)", fontSize: 12 }}>
                <th style={{ padding: "10px 8px" }}>Ativo</th>
                <th style={{ padding: "10px 8px" }}>Status</th>
                <th style={{ padding: "10px 8px" }}>Fonte</th>
                <th style={{ padding: "10px 8px" }}>Preco atual</th>
                <th style={{ padding: "10px 8px" }}>Preco atual (BRL)</th>
                <th style={{ padding: "10px 8px" }}>Peg ideal</th>
                <th style={{ padding: "10px 8px" }}>Peg ideal (BRL)</th>
                <th style={{ padding: "10px 8px" }}>De-peg</th>
                <th style={{ padding: "10px 8px" }}>Assimetria</th>
                <th style={{ padding: "10px 8px" }}>Direcao</th>
                <th style={{ padding: "10px 8px" }}>Sinal</th>
                <th style={{ padding: "10px 8px" }}>Observacao</th>
              </tr>
            </thead>
            <tbody>
              {rankedRows.map((row) => {
                const signal = actionSignal(row, activeThresholdPct);

                return (
                  <tr
                    key={row.id}
                    style={{
                      borderBottom: "1px solid var(--card-border)",
                      fontSize: 13,
                      background:
                        row.status === "ok" && row.asymmetry_pct !== null && row.asymmetry_pct >= activeThresholdPct
                          ? "rgba(245, 158, 11, 0.08)"
                          : "transparent",
                    }}
                  >
                    <td style={{ padding: "10px 8px" }}>
                      <div style={{ fontWeight: 700 }}>{row.label}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>{row.symbol}</div>
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      <span
                        style={{
                          border: `1px solid ${row.status === "ok" ? "#22c55e" : "#ef4444"}`,
                          color: row.status === "ok" ? "#22c55e" : "#ef4444",
                          borderRadius: 999,
                          padding: "2px 10px",
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        {row.status === "ok" ? "ATIVO" : "INDISPONIVEL"}
                      </span>
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      <div>{row.analyzed_on}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>{row.peg_reference}</div>
                    </td>
                    <td style={{ padding: "10px 8px" }}>{price(row.market_price, row.quote_asset)}</td>
                    <td style={{ padding: "10px 8px", color: "var(--muted)", fontSize: 12 }}>{brl(row.market_price_brl)}</td>
                    <td style={{ padding: "10px 8px" }}>{price(row.ideal_price, row.quote_asset)}</td>
                    <td style={{ padding: "10px 8px", color: "var(--muted)", fontSize: 12 }}>{brl(row.ideal_price_brl)}</td>
                    <td
                      style={{
                        padding: "10px 8px",
                        color: row.depeg_pct === null ? "var(--muted)" : row.depeg_pct >= 0 ? "#22c55e" : "#ef4444",
                        fontWeight: 700,
                      }}
                    >
                      {pct(row.depeg_pct)}
                    </td>
                    <td
                      style={{
                        padding: "10px 8px",
                        color: row.asymmetry_pct === null ? "var(--muted)" : severityColor(row.severity),
                        fontWeight: 700,
                      }}
                    >
                      {row.asymmetry_pct === null ? "--" : `${row.asymmetry_pct.toFixed(4)}%`}
                    </td>
                    <td style={{ padding: "10px 8px", fontSize: 12 }}>{row.depeg_pct === null ? "--" : directionLabel(row.direction)}</td>
                    <td style={{ padding: "10px 8px" }}>
                      {row.status === "ok" ? (
                        <span
                          style={{
                            border: `1px solid ${signal.color}`,
                            color: signal.color,
                            borderRadius: 999,
                            padding: "2px 10px",
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {signal.label}
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: "var(--muted)" }} title={row.notes}>
                          {unavailableSignal(row.notes)}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "10px 8px", color: "var(--muted)", fontSize: 12 }}>{row.notes}</td>
                  </tr>
                );
              })}
              {(!data || rankedRows.length === 0) && (
                <tr>
                  <td colSpan={12} style={{ padding: "14px 8px", color: "var(--muted)", fontSize: 13 }}>
                    Nenhum ativo disponivel neste momento.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section
          style={{
            marginTop: 12,
            background: "var(--card)",
            border: "1px solid var(--card-border)",
            borderRadius: 16,
            padding: 12,
            overflowX: "auto",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Historico de De-pegs (acima do limiar)</h2>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Mostrando ate 80 eventos locais recentes</div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--card-border)", color: "var(--muted)", fontSize: 12 }}>
                <th style={{ padding: "10px 8px" }}>Horario</th>
                <th style={{ padding: "10px 8px" }}>Ativo</th>
                <th style={{ padding: "10px 8px" }}>Preco</th>
                <th style={{ padding: "10px 8px" }}>Peg</th>
                <th style={{ padding: "10px 8px" }}>De-peg</th>
                <th style={{ padding: "10px 8px" }}>Assimetria</th>
                <th style={{ padding: "10px 8px" }}>Direcao</th>
                <th style={{ padding: "10px 8px" }}>Fonte</th>
              </tr>
            </thead>
            <tbody>
              {historyRows.map((point) => (
                <tr key={point.key} style={{ borderBottom: "1px solid var(--card-border)", fontSize: 13 }}>
                  <td style={{ padding: "10px 8px", whiteSpace: "nowrap" }}>
                    {new Date(point.timestamp).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </td>
                  <td style={{ padding: "10px 8px" }}>
                    <div style={{ fontWeight: 700 }}>{point.label}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>{point.symbol}</div>
                  </td>
                  <td style={{ padding: "10px 8px" }}>{price(point.market_price, point.quote_asset)}</td>
                  <td style={{ padding: "10px 8px" }}>{price(point.ideal_price, point.quote_asset)}</td>
                  <td
                    style={{
                      padding: "10px 8px",
                      color: point.depeg_pct >= 0 ? "#22c55e" : "#ef4444",
                      fontWeight: 700,
                    }}
                  >
                    {pct(point.depeg_pct)}
                  </td>
                  <td style={{ padding: "10px 8px", color: severityColor(point.severity), fontWeight: 700 }}>
                    {point.asymmetry_pct.toFixed(4)}%
                  </td>
                  <td style={{ padding: "10px 8px" }}>{directionLabel(point.direction)}</td>
                  <td style={{ padding: "10px 8px", color: "var(--muted)", fontSize: 12 }}>{point.analyzed_on}</td>
                </tr>
              ))}
              {historyRows.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: "14px 8px", color: "var(--muted)", fontSize: 13 }}>
                    Ainda nao houve evento de de-peg acima do limiar atual nesta sessao.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section
          style={{
            marginTop: 12,
            background: "var(--card)",
            border: "1px solid var(--card-border)",
            borderRadius: 16,
            padding: 12,
            overflowX: "auto",
          }}
        >
          <div style={{ display: "grid", gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Tabela completa de stablecoins</h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                { value: "ALL", label: "Todos" },
                { value: "USD", label: "USD" },
                { value: "EUR", label: "EUR" },
                { value: "BRL", label: "BRL" },
                { value: "XAU", label: "Ouro" },
              ].map((option) => {
                const active = catalogFilter === option.value;
                return (
                  <button
                    key={option.value}
                    onClick={() => setCatalogFilter(option.value as "ALL" | StablecoinCategory)}
                    style={{
                      border: "1px solid var(--card-border)",
                      borderRadius: 999,
                      padding: "6px 12px",
                      background: active ? "rgba(14, 165, 233, 0.18)" : "rgba(255,255,255,0.04)",
                      color: active ? "var(--text)" : "var(--muted)",
                      fontWeight: active ? 700 : 500,
                      cursor: "pointer",
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>{filteredCatalog.length} tokens exibidos</div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100, marginTop: 10 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--card-border)", color: "var(--muted)", fontSize: 12 }}>
                <th style={{ padding: "10px 8px" }}>Token</th>
                <th style={{ padding: "10px 8px" }}>Emissor</th>
                <th style={{ padding: "10px 8px" }}>Paridade</th>
                <th style={{ padding: "10px 8px" }}>Rede + Contrato oficial</th>
                <th style={{ padding: "10px 8px" }}>API / Docs oficiais</th>
              </tr>
            </thead>
            <tbody>
              {filteredCatalog.map((item) => (
                <tr key={item.token} style={{ borderBottom: "1px solid var(--card-border)", fontSize: 13, verticalAlign: "top" }}>
                  <td style={{ padding: "10px 8px" }}>
                    <div style={{ fontWeight: 800 }}>{item.token}</div>
                    {item.warning && (
                      <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 4 }}>{item.warning}</div>
                    )}
                  </td>
                  <td style={{ padding: "10px 8px" }}>{item.issuer}</td>
                  <td style={{ padding: "10px 8px" }}>{item.parity}</td>
                  <td style={{ padding: "10px 8px" }}>
                    <div style={{ display: "grid", gap: 6 }}>
                      {item.contracts.map((entry) => (
                        <div key={`${item.token}-${entry.network}`}>
                          <div style={{ fontSize: 12, color: "var(--muted)" }}>{entry.network}</div>
                          <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, overflowWrap: "anywhere" }}>
                            {entry.contract}
                          </div>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: "10px 8px" }}>
                    <a
                      href={item.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#38bdf8", textDecoration: "none" }}
                    >
                      {item.docsUrl}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
