import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 9_000;
const CACHE_TTL_MS = 2_000; // Cache curto para reduzir defasagem entre tela e mercado

type FxBase = "EUR" | "BRL";
type AssetSymbol = "USDT" | "USDC" | "DAI" | "BRLA" | "BRL1" | "BRZ";
type QuoteAsset = "USDT" | "USDC" | "DAI" | "BRLA" | "BRL1" | "BRZ";
type IdealType = "usd_peg" | "fx" | "cross_peg";

type PairConfig = {
  id: string;
  label: string;
  symbol: string;
  baseAsset: AssetSymbol;
  quoteAsset: QuoteAsset;
  pegReference: string;
  gateSymbol: string;
  kucoinSymbol: string;
  okxInstId: string;
  coinexMarket: string;
  bybitSymbol: string;
  htxSymbol: string;
  krakenSymbol: string;
  coinbaseSymbol: string;
  coingeckoId: string;
  coinmarketcapSlug: string;
  idealType: IdealType;
  fxBase?: FxBase;
  priceMode?: "market" | "defillama_ratio";
  displayBrl?: boolean;
  disableAggregatorFallback?: boolean;
  defilamaSymbol?: string; // ID alternativo para DefiLlama (ex: ethereum:0x...)
};

type TickerResult = {
  bid: number;
  ask: number;
  mid: number;
  source: string;
};

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
    best_opportunity:
      | (Pick<DepegRow, "id" | "label" | "depeg_pct" | "asymmetry_pct" | "direction" | "signal"> & {
          net_margin_pct: number | null;
        })
      | null;
  };
  warning?: string;
  error?: string;
};

type CacheEntry = {
  expiresAt: number;
  payload: DepegResponse;
};

const cache = new Map<string, CacheEntry>();

const ASSET_METADATA: Record<AssetSymbol, { coingeckoId: string; coinmarketcapSlug: string }> = {
  USDT: { coingeckoId: "tether", coinmarketcapSlug: "tether" },
  USDC: { coingeckoId: "usd-coin", coinmarketcapSlug: "usd-coin" },
  DAI: { coingeckoId: "dai", coinmarketcapSlug: "multi-collateral-dai" },
  BRLA: { coingeckoId: "brla-digital-brla", coinmarketcapSlug: "brla-digital-brl" },
  BRL1: { coingeckoId: "brl1", coinmarketcapSlug: "brl1" },
  BRZ: { coingeckoId: "brz", coinmarketcapSlug: "brz" },
};

const PAIRS: PairConfig[] = [
  {
    id: "usdt-usdc",
    label: "USDT x USDC",
    symbol: "USDTUSDC",
    baseAsset: "USDT",
    quoteAsset: "USDC",
    pegReference: "USD stablecoin (1:1)",
    gateSymbol: "USDT_USDC",
    kucoinSymbol: "USDT-USDC",
    okxInstId: "USDT-USDC",
    coinexMarket: "USDTUSDC",
    bybitSymbol: "USDTUSDC",
    htxSymbol: "usdtusdc",
    krakenSymbol: "USDTUSDC",
    coinbaseSymbol: "USDT-USDC",
    coingeckoId: "tether",
    coinmarketcapSlug: "tether",
    idealType: "cross_peg",
  },
  {
    id: "usdt-dai",
    label: "USDT x DAI",
    symbol: "USDTDAI",
    baseAsset: "USDT",
    quoteAsset: "DAI",
    pegReference: "USD stablecoin (1:1)",
    gateSymbol: "USDT_DAI",
    kucoinSymbol: "USDT-DAI",
    okxInstId: "USDT-DAI",
    coinexMarket: "USDTDAI",
    bybitSymbol: "USDTDAI",
    htxSymbol: "usdtdai",
    krakenSymbol: "USDTDAI",
    coinbaseSymbol: "USDT-DAI",
    coingeckoId: "tether",
    coinmarketcapSlug: "tether",
    idealType: "cross_peg",
  },
  {
    id: "usdc-usdt",
    label: "USDC x USDT",
    symbol: "USDCUSDT",
    baseAsset: "USDC",
    quoteAsset: "USDT",
    pegReference: "USD stablecoin (1:1)",
    gateSymbol: "USDC_USDT",
    kucoinSymbol: "USDC-USDT",
    okxInstId: "USDC-USDT",
    coinexMarket: "USDCUSDT",
    bybitSymbol: "USDCUSDT",
    htxSymbol: "usdcusdt",
    krakenSymbol: "USDCUSDT",
    coinbaseSymbol: "USDC-USDT",
    coingeckoId: "usd-coin",
    coinmarketcapSlug: "usd-coin",
    idealType: "cross_peg",
  },
  {
    id: "usdc-dai",
    label: "USDC x DAI",
    symbol: "USDCDAI",
    baseAsset: "USDC",
    quoteAsset: "DAI",
    pegReference: "USD stablecoin (1:1)",
    gateSymbol: "USDC_DAI",
    kucoinSymbol: "USDC-DAI",
    okxInstId: "USDC-DAI",
    coinexMarket: "USDCDAI",
    bybitSymbol: "USDCDAI",
    htxSymbol: "usdcdai",
    krakenSymbol: "USDCDAI",
    coinbaseSymbol: "USDC-DAI",
    coingeckoId: "usd-coin",
    coinmarketcapSlug: "usd-coin",
    idealType: "cross_peg",
  },
  {
    id: "dai-usdt",
    label: "DAI x USDT",
    symbol: "DAIUSDT",
    baseAsset: "DAI",
    quoteAsset: "USDT",
    pegReference: "USD stablecoin (1:1)",
    gateSymbol: "DAI_USDT",
    kucoinSymbol: "DAI-USDT",
    okxInstId: "DAI-USDT",
    coinexMarket: "DAIUSDT",
    bybitSymbol: "DAIUSDT",
    htxSymbol: "daiusdt",
    krakenSymbol: "DAIUSDT",
    coinbaseSymbol: "DAI-USDT",
    coingeckoId: "dai",
    coinmarketcapSlug: "multi-collateral-dai",
    idealType: "cross_peg",
  },
  {
    id: "dai-usdc",
    label: "DAI x USDC",
    symbol: "DAIUSDC",
    baseAsset: "DAI",
    quoteAsset: "USDC",
    pegReference: "USD stablecoin (1:1)",
    gateSymbol: "DAI_USDC",
    kucoinSymbol: "DAI-USDC",
    okxInstId: "DAI-USDC",
    coinexMarket: "DAIUSDC",
    bybitSymbol: "DAIUSDC",
    htxSymbol: "daiusdc",
    krakenSymbol: "DAIUSDC",
    coinbaseSymbol: "DAI-USDC",
    coingeckoId: "dai",
    coinmarketcapSlug: "multi-collateral-dai",
    idealType: "cross_peg",
  },
  {
    id: "brla-brl1",
    label: "BRLA x BRL1",
    symbol: "BRLABRL1",
    baseAsset: "BRLA",
    quoteAsset: "BRL1",
    pegReference: "BRL stablecoin (1:1)",
    gateSymbol: "BRLA_BRL1",
    kucoinSymbol: "BRLA-BRL1",
    okxInstId: "BRLA-BRL1",
    coinexMarket: "BRLABRL1",
    bybitSymbol: "BRLABRL1",
    htxSymbol: "brlabrl1",
    krakenSymbol: "BRLABRL1",
    coinbaseSymbol: "BRLA-BRL1",
    coingeckoId: "brla-digital-brla",
    coinmarketcapSlug: "brla-digital-brl",
    idealType: "cross_peg",
    defilamaSymbol: "polygon:0xe6a537a407488807f0bbeb0038b79004f19dddfb,polygon:0x5c067c80c00ecd2345b05e83a3e758ef799c40b5",
  },
  {
    id: "brla-brz",
    label: "BRLA x BRZ",
    symbol: "BRLABRZ",
    baseAsset: "BRLA",
    quoteAsset: "BRZ",
    pegReference: "BRL stablecoin (1:1)",
    gateSymbol: "BRLA_BRZ",
    kucoinSymbol: "BRLA-BRZ",
    okxInstId: "BRLA-BRZ",
    coinexMarket: "BRLABRZ",
    bybitSymbol: "BRLABRZ",
    htxSymbol: "brlabrz",
    krakenSymbol: "BRLABRZ",
    coinbaseSymbol: "BRLA-BRZ",
    coingeckoId: "brla-digital-brla",
    coinmarketcapSlug: "brla-digital-brl",
    idealType: "cross_peg",
    defilamaSymbol: "polygon:0xe6a537a407488807f0bbeb0038b79004f19dddfb,polygon:0x4ed141110f6eeeaba9a1df36d8c26f684d2475dc",
  },
  {
    id: "brz-brla",
    label: "BRZ x BRLA",
    symbol: "BRZBRLA",
    baseAsset: "BRZ",
    quoteAsset: "BRLA",
    pegReference: "BRL stablecoin (1:1)",
    gateSymbol: "BRZ_BRLA",
    kucoinSymbol: "BRZ-BRLA",
    okxInstId: "BRZ-BRLA",
    coinexMarket: "BRZBRLA",
    bybitSymbol: "BRZBRLA",
    htxSymbol: "brzbrla",
    krakenSymbol: "BRZBRLA",
    coinbaseSymbol: "BRZ-BRLA",
    coingeckoId: "brz",
    coinmarketcapSlug: "brz",
    idealType: "cross_peg",
    defilamaSymbol: "polygon:0x4ed141110f6eeeaba9a1df36d8c26f684d2475dc,polygon:0xe6a537a407488807f0bbeb0038b79004f19dddfb",
  },
  {
    id: "brz-brl1",
    label: "BRZ x BRL1",
    symbol: "BRZBRL1",
    baseAsset: "BRZ",
    quoteAsset: "BRL1",
    pegReference: "BRL stablecoin (1:1)",
    gateSymbol: "BRZ_BRL1",
    kucoinSymbol: "BRZ-BRL1",
    okxInstId: "BRZ-BRL1",
    coinexMarket: "BRZBRL1",
    bybitSymbol: "BRZBRL1",
    htxSymbol: "brzbrl1",
    krakenSymbol: "BRZBRL1",
    coinbaseSymbol: "BRZ-BRL1",
    coingeckoId: "brz",
    coinmarketcapSlug: "brz",
    idealType: "cross_peg",
    defilamaSymbol: "polygon:0x4ed141110f6eeeaba9a1df36d8c26f684d2475dc,polygon:0x5c067c80c00ecd2345b05e83a3e758ef799c40b5",
  },
  {
    id: "brl1-brz",
    label: "BRL1 x BRZ",
    symbol: "BRL1BRZ",
    baseAsset: "BRL1",
    quoteAsset: "BRZ",
    pegReference: "BRL stablecoin (1:1)",
    gateSymbol: "BRL1_BRZ",
    kucoinSymbol: "BRL1-BRZ",
    okxInstId: "BRL1-BRZ",
    coinexMarket: "BRL1BRZ",
    bybitSymbol: "BRL1BRZ",
    htxSymbol: "brl1brz",
    krakenSymbol: "BRL1BRZ",
    coinbaseSymbol: "BRL1-BRZ",
    coingeckoId: "brl1",
    coinmarketcapSlug: "brl1",
    idealType: "cross_peg",
    defilamaSymbol: "polygon:0x5c067c80c00ecd2345b05e83a3e758ef799c40b5,polygon:0x4ed141110f6eeeaba9a1df36d8c26f684d2475dc",
  },
  {
    id: "brl1-brla",
    label: "BRL1 x BRLA",
    symbol: "BRL1BRLA",
    baseAsset: "BRL1",
    quoteAsset: "BRLA",
    pegReference: "BRL stablecoin (1:1)",
    gateSymbol: "BRL1_BRLA",
    kucoinSymbol: "BRL1-BRLA",
    okxInstId: "BRL1-BRLA",
    coinexMarket: "BRL1BRLA",
    bybitSymbol: "BRL1BRLA",
    htxSymbol: "brl1brla",
    krakenSymbol: "BRL1BRLA",
    coinbaseSymbol: "BRL1-BRLA",
    coingeckoId: "brl1",
    coinmarketcapSlug: "brl1",
    idealType: "cross_peg",
    defilamaSymbol: "polygon:0x5c067c80c00ecd2345b05e83a3e758ef799c40b5,polygon:0xe6a537a407488807f0bbeb0038b79004f19dddfb",
  },
];

function fallbackRows(reason: string): DepegRow[] {
  return PAIRS.map((pair) => {
    const hasFixedParity = pair.idealType === "usd_peg" || pair.idealType === "cross_peg";
    return {
      id: pair.id,
      label: pair.label,
      symbol: pair.symbol,
      quote_asset: pair.quoteAsset,
      status: "unavailable",
      analyzed_on: "Binance Spot BookTicker",
      peg_reference: pair.pegReference,
      market_price: null,
      market_price_brl: null,
      bid_price: null,
      ask_price: null,
      orderbook_spread_pct: null,
      ideal_price: hasFixedParity ? 1 : null,
      ideal_price_brl: null,
      depeg_pct: null,
      asymmetry_pct: null,
      direction: "below_peg",
      severity: "low",
      signal: "watch",
      notes: reason,
    };
  });
}

function toNum(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parsePositive(value: string | null, fallback: number): number {
  const parsed = toNum(value);
  if (parsed < 0) return fallback;
  return parsed;
}

function normalizeError(err: unknown): string {
  const msg = String(err ?? "Erro desconhecido");
  const lower = msg.toLowerCase();
  if (lower.includes("market") && lower.includes("not found")) return "Mercado nao listado";
  if (lower.includes("instrument") && lower.includes("doesn't exist")) return "Mercado nao listado";
  if (lower.includes("invalid symbol")) return "Mercado nao listado";
  if (msg.toLowerCase().includes("restricted location")) return "Indisponivel na regiao atual";
  if (msg.toLowerCase().includes("eligibility")) return "Indisponivel na regiao atual";
  if (msg.includes("HTTP 451")) return "Indisponivel na regiao atual";
  if (msg.includes("HTTP 403")) return "Bloqueado para esta regiao";
  if (msg.toLowerCase().includes("timeout")) return "Timeout na consulta";
  return msg;
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      accept: "application/json",
      "user-agent": "usdtbot-depeg/1.0",
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  return res.json();
}

async function fetchTickerBinance(symbol: string): Promise<TickerResult | null> {
  const data = await fetchJson(`https://api.binance.com/api/v3/ticker/bookTicker?symbol=${symbol}`);

  const apiMsg = String(data?.msg ?? "");
  if (apiMsg) {
    throw new Error(apiMsg);
  }

  const bid = toNum(data?.bidPrice);
  const ask = toNum(data?.askPrice);
  const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : 0;

  if (bid <= 0 || ask <= 0 || mid <= 0) {
    return null;
  }

  return { bid, ask, mid, source: "Binance Spot BookTicker" };
}

async function fetchTickerGate(currencyPair: string): Promise<TickerResult | null> {
  const data = await fetchJson(`https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${currencyPair}`);
  const first = Array.isArray(data) ? data[0] : null;
  const bid = toNum(first?.highest_bid);
  const ask = toNum(first?.lowest_ask);
  const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : 0;

  if (bid <= 0 || ask <= 0 || mid <= 0) {
    return null;
  }

  return { bid, ask, mid, source: "Gate Spot Ticker" };
}

async function fetchTickerKucoin(symbol: string): Promise<TickerResult | null> {
  const data = await fetchJson(`https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=${symbol}`);
  const payload = data?.data;
  const bid = toNum(payload?.bestBid);
  const ask = toNum(payload?.bestAsk);
  const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : 0;

  if (bid <= 0 || ask <= 0 || mid <= 0) {
    return null;
  }

  return { bid, ask, mid, source: "KuCoin Spot Level1" };
}

async function fetchTickerOkx(instId: string): Promise<TickerResult | null> {
  const data = await fetchJson(`https://www.okx.com/api/v5/market/ticker?instId=${instId}`);
  const code = String(data?.code ?? "");
  if (code && code !== "0") {
    throw new Error(String(data?.msg ?? "Erro na consulta da OKX"));
  }

  const first = Array.isArray(data?.data) ? data.data[0] : null;
  const bid = toNum(first?.bidPx);
  const ask = toNum(first?.askPx);
  const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : 0;

  if (bid <= 0 || ask <= 0 || mid <= 0) {
    return null;
  }

  return { bid, ask, mid, source: "OKX Spot Ticker" };
}

async function fetchTickerCoinex(market: string): Promise<TickerResult | null> {
  const data = await fetchJson(`https://api.coinex.com/v2/spot/ticker?market=${market}`);
  const code = toNum(data?.code);
  if (code !== 0) {
    throw new Error(String(data?.message ?? "Erro na consulta da CoinEx"));
  }

  const first = Array.isArray(data?.data) ? data.data[0] : null;
  const bid = toNum(first?.bid);
  const ask = toNum(first?.ask);
  const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : 0;

  if (bid <= 0 || ask <= 0 || mid <= 0) {
    return null;
  }

  return { bid, ask, mid, source: "CoinEx Spot Ticker" };
}

async function fetchTickerBybit(symbol: string): Promise<TickerResult | null> {
  const data = await fetchJson(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${symbol}`);
  const first = Array.isArray(data?.result?.list) ? data.result.list[0] : null;
  const bid = toNum(first?.bid1Price);
  const ask = toNum(first?.ask1Price);
  const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : 0;

  if (bid <= 0 || ask <= 0 || mid <= 0) {
    return null;
  }

  return { bid, ask, mid, source: "Bybit Spot Ticker" };
}

async function fetchTickerHtx(symbol: string): Promise<TickerResult | null> {
  const data = await fetchJson(`https://api.huobi.pro/market/detail?symbol=${symbol}`);
  const tick = data?.tick;
  if (!tick) {
    throw new Error("HTX ticker nao encontrado");
  }

  const bid = toNum(tick?.bid?.[0]);
  const ask = toNum(tick?.ask?.[0]);
  const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : 0;

  if (bid <= 0 || ask <= 0 || mid <= 0) {
    return null;
  }

  return { bid, ask, mid, source: "HTX Spot Ticker" };
}

async function fetchTickerKraken(symbol: string): Promise<TickerResult | null> {
  const data = await fetchJson(`https://api.kraken.com/0/public/Ticker?pair=${symbol}`);
  if (data?.error && data.error.length > 0) {
    throw new Error(String(data.error[0]));
  }

  const key = Object.keys(data?.result ?? {})[0];
  if (!key) {
    return null;
  }

  const ticker = data.result[key];
  const bid = toNum(ticker?.b?.[0]);
  const ask = toNum(ticker?.a?.[0]);
  const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : 0;

  if (bid <= 0 || ask <= 0 || mid <= 0) {
    return null;
  }

  return { bid, ask, mid, source: "Kraken Spot Ticker" };
}

async function fetchTickerCoinbase(symbol: string): Promise<TickerResult | null> {
  const data = await fetchJson(`https://api.exchange.coinbase.com/products/${symbol}/ticker`);
  const bid = toNum(data?.bid);
  const ask = toNum(data?.ask);
  const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : 0;

  if (bid <= 0 || ask <= 0 || mid <= 0) {
    return null;
  }

  return { bid, ask, mid, source: "Coinbase Spot Ticker" };
}

async function fetchTickerCoinGecko(coingeckoId: string): Promise<TickerResult | null> {
  const data = await fetchJson(`https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoId}&vs_currencies=usd&include_market_cap=false&include_24hr_vol=false`);
  const tokenData = data?.[coingeckoId];
  const price = toNum(tokenData?.usd);

  if (price <= 0) {
    return null;
  }

  // CoinGecko não fornece bid/ask, usamos o preço como mid
  const bid = price * 0.9999;
  const ask = price * 1.0001;

  return { bid, ask, mid: price, source: "CoinGecko" };
}

async function fetchTickerCoinMarketCap(slug: string): Promise<TickerResult | null> {
  try {
    const data = await fetchJson(`https://api.coinmarketcap.com/data-api/v3/cryptocurrency/detail?slug=${slug}`);
    const tokenData = data?.data?.statistics?.price;
    const price = toNum(tokenData);

    if (price <= 0) {
      return null;
    }

    const bid = price * 0.9999;
    const ask = price * 1.0001;

    return { bid, ask, mid: price, source: "CoinMarketCap" };
  } catch {
    return null;
  }
}

async function fetchTickerDefiLlama(coingeckoId: string, defilamaSymbol?: string): Promise<TickerResult | null> {
  try {
    // Tenta primeiro com o símbolo customizado se fornecido (ex: ethereum:0x...)
    if (defilamaSymbol) {
      const data = await fetchJson(
        `https://coins.llama.fi/prices/current/${defilamaSymbol}`
      );
      
      const coins = data?.coins || {};
      const tokenData = coins[defilamaSymbol];
      
      if (tokenData) {
        const price = toNum(tokenData.price);
        if (price > 0) {
          const bid = price * 0.9999;
          const ask = price * 1.0001;
          return { bid, ask, mid: price, source: "DefiLlama" };
        }
      }
    }

    // Tenta com o CoinGecko ID
    const data = await fetchJson(
      `https://coins.llama.fi/prices/current/coingecko:${coingeckoId}`
    );
    
    const coins = data?.coins || {};
    const key = `coingecko:${coingeckoId}`;
    const tokenData = coins[key];
    
    if (!tokenData) {
      return null;
    }
    
    const price = toNum(tokenData.price);
    
    if (price <= 0) {
      return null;
    }

    // DefiLlama nao fornece bid/ask, usamos o preco como mid
    const bid = price * 0.9999;
    const ask = price * 1.0001;

    return { bid, ask, mid: price, source: "DefiLlama" };
  } catch {
    return null;
  }
}

async function fetchAggregatorRatio(pair: PairConfig): Promise<TickerResult | null> {
  const baseMeta = ASSET_METADATA[pair.baseAsset];
  const quoteMeta = ASSET_METADATA[pair.quoteAsset];

  try {
    const [baseTicker, quoteTicker] = await Promise.all([
      fetchTickerCoinGecko(baseMeta.coingeckoId),
      fetchTickerCoinGecko(quoteMeta.coingeckoId),
    ]);

    if (baseTicker && quoteTicker && baseTicker.mid > 0 && quoteTicker.mid > 0) {
      const mid = baseTicker.mid / quoteTicker.mid;
      return {
        bid: mid * 0.9999,
        ask: mid * 1.0001,
        mid,
        source: "CoinGecko ratio",
      };
    }
  } catch {
    // Continua para o fallback seguinte.
  }

  try {
    const [baseTicker, quoteTicker] = await Promise.all([
      fetchTickerCoinMarketCap(baseMeta.coinmarketcapSlug),
      fetchTickerCoinMarketCap(quoteMeta.coinmarketcapSlug),
    ]);

    if (baseTicker && quoteTicker && baseTicker.mid > 0 && quoteTicker.mid > 0) {
      const mid = baseTicker.mid / quoteTicker.mid;
      return {
        bid: mid * 0.9999,
        ask: mid * 1.0001,
        mid,
        source: "CoinMarketCap ratio",
      };
    }
  } catch {
    // Continua para o fallback seguinte.
  }

  try {
    const defilamaAddrs = pair.defilamaSymbol?.split(",").map(s => s.trim()) || [];
    const baseDefillama = defilamaAddrs[0] || undefined;
    const quoteDefillama = defilamaAddrs[1] || undefined;

    const [baseTicker, quoteTicker] = await Promise.all([
      fetchTickerDefiLlama(baseMeta.coingeckoId, baseDefillama),
      fetchTickerDefiLlama(quoteMeta.coingeckoId, quoteDefillama),
    ]);

    if (baseTicker && quoteTicker && baseTicker.mid > 0 && quoteTicker.mid > 0) {
      const mid = baseTicker.mid / quoteTicker.mid;
      return {
        bid: mid * 0.9999,
        ask: mid * 1.0001,
        mid,
        source: "DefiLlama ratio",
      };
    }
  } catch {
    // Sem razao disponivel nos agregadores.
  }

  return null;
}

async function fetchTickerWithFallback(pair: PairConfig): Promise<{ ticker: TickerResult | null; reason: string | null }> {
  const errors: string[] = [];

  try {
    const ticker = await fetchTickerBinance(pair.symbol);
    if (ticker) return { ticker, reason: null };
    errors.push("Sem bid/ask valido na Binance");
  } catch (err) {
    errors.push(normalizeError(err));
  }

  try {
    const ticker = await fetchTickerGate(pair.gateSymbol);
    if (ticker) return { ticker, reason: null };
    errors.push("Sem bid/ask valido na Gate");
  } catch (err) {
    errors.push(normalizeError(err));
  }

  try {
    const ticker = await fetchTickerKucoin(pair.kucoinSymbol);
    if (ticker) return { ticker, reason: null };
    errors.push("Sem bid/ask valido na KuCoin");
  } catch (err) {
    errors.push(normalizeError(err));
  }

  try {
    const ticker = await fetchTickerOkx(pair.okxInstId);
    if (ticker) return { ticker, reason: null };
    errors.push("Sem bid/ask valido na OKX");
  } catch (err) {
    errors.push(normalizeError(err));
  }

  try {
    const ticker = await fetchTickerCoinex(pair.coinexMarket);
    if (ticker) return { ticker, reason: null };
    errors.push("Sem bid/ask valido na CoinEx");
  } catch (err) {
    errors.push(normalizeError(err));
  }

  try {
    const ticker = await fetchTickerBybit(pair.bybitSymbol);
    if (ticker) return { ticker, reason: null };
    errors.push("Sem bid/ask valido na Bybit");
  } catch (err) {
    errors.push(normalizeError(err));
  }

  try {
    const ticker = await fetchTickerHtx(pair.htxSymbol);
    if (ticker) return { ticker, reason: null };
    errors.push("Sem bid/ask valido na HTX");
  } catch (err) {
    errors.push(normalizeError(err));
  }

  try {
    const ticker = await fetchTickerKraken(pair.krakenSymbol);
    if (ticker) return { ticker, reason: null };
    errors.push("Sem bid/ask valido na Kraken");
  } catch (err) {
    errors.push(normalizeError(err));
  }

  try {
    const ticker = await fetchTickerCoinbase(pair.coinbaseSymbol);
    if (ticker) return { ticker, reason: null };
    errors.push("Sem bid/ask valido na Coinbase");
  } catch (err) {
    errors.push(normalizeError(err));
  }

  if (pair.disableAggregatorFallback) {
    const reason = [...new Set(errors)].join(" | ");
    return { ticker: null, reason: reason || null };
  }

  if (pair.idealType === "cross_peg") {
    try {
      const ticker = await fetchAggregatorRatio(pair);
      if (ticker) {
        return {
          ticker,
          reason: [...new Set(errors)].join(" | ") || null,
        };
      }
      errors.push("Sem razao disponivel nos agregadores para o par monitorado");
    } catch (err) {
      errors.push(normalizeError(err));
    }

    const reason = [...new Set(errors)].join(" | ");
    return {
      ticker: null,
      reason:
        reason ||
        "Sem fonte executavel de orderbook e sem preco indicativo de ratio no momento",
    };
  }

  try {
    const ticker = await fetchTickerCoinGecko(pair.coingeckoId);
    if (ticker) return { ticker, reason: null };
    errors.push("Sem preco disponivel na CoinGecko");
  } catch (err) {
    errors.push(normalizeError(err));
  }

  try {
    const ticker = await fetchTickerCoinMarketCap(pair.coinmarketcapSlug);
    if (ticker) return { ticker, reason: null };
    errors.push("Sem preco disponivel na CoinMarketCap");
  } catch (err) {
    errors.push(normalizeError(err));
  }

  try {
    const defilamaAddrs = pair.defilamaSymbol?.split(",").map(s => s.trim()) || [];
    const baseDefillama = defilamaAddrs[0] || undefined;
    const ticker = await fetchTickerDefiLlama(pair.coingeckoId, baseDefillama);
    if (ticker) return { ticker, reason: null };
    errors.push("Sem preco disponivel na DefiLlama");
  } catch (err) {
    errors.push(normalizeError(err));
  }

  const reason = [...new Set(errors)].join(" | ");
  return { ticker: null, reason: reason || null };
}

async function fetchFxToUsd(base: FxBase): Promise<number> {
  const payload = await fetchJson(`https://api.frankfurter.app/latest?from=${base}&to=USD`);
  const rate = toNum(payload?.rates?.USD);
  if (rate <= 0) {
    throw new Error(`FX ${base}/USD indisponivel`);
  }
  return rate;
}

async function fetchBinanceUsdtBrl(): Promise<number> {
  // Tenta obter USDT/BRL diretamente da Binance (mais atualizado que taxa de câmbio)
  const hosts = ["api.binance.com", "api1.binance.com", "api2.binance.com", "api3.binance.com"];
  
  for (const host of hosts) {
    try {
      const payload = await fetchJson(`https://${host}/api/v3/ticker/24hr?symbol=USDTBRL`);
      const price = toNum(payload?.lastPrice);
      if (price > 0) {
        return price;
      }
    } catch {
      // Tenta proximo host
    }
  }
  
  // Fallback para CryptoCompare se Binance direto nao funcionar
  try {
    const fallback = await fetchJson("https://min-api.cryptocompare.com/data/price?fsym=USDT&tsyms=BRL&e=Binance");
    const price = toNum(fallback?.BRL);
    if (price > 0) {
      return price;
    }
  } catch {
    // Continua para Frankfurter
  }
  
  throw new Error("Binance USDT/BRL indisponivel");
}

async function fetchUsdToBrl(): Promise<number> {
  // Tenta Binance primeiro (mais atualizado)
  try {
    return await fetchBinanceUsdtBrl();
  } catch {
    // Fallback para Frankfurter
  }
  
  const payload = await fetchJson("https://api.frankfurter.app/latest?from=USD&to=BRL");
  const rate = toNum(payload?.rates?.BRL);
  if (rate <= 0) {
    throw new Error("FX USD/BRL indisponivel");
  }
  return rate;
}

function classify(asymmetryPct: number): { severity: DepegRow["severity"]; signal: DepegRow["signal"] } {
  if (asymmetryPct >= 4) return { severity: "high", signal: "stress" };
  if (asymmetryPct >= 1.5) return { severity: "medium", signal: "opportunity" };
  return { severity: "low", signal: "watch" };
}

function isBrlStableQuote(quoteAsset: QuoteAsset): boolean {
  return quoteAsset === "BRLA" || quoteAsset === "BRL1" || quoteAsset === "BRZ";
}

function toBrlDisplay(value: number, quoteAsset: QuoteAsset, usdBrl: number): number | null {
  if (value <= 0) return null;
  if (isBrlStableQuote(quoteAsset)) return Number(value.toFixed(6));
  if (usdBrl <= 0) return null;
  return Number((value * usdBrl).toFixed(6));
}

function estimatedFeePct(quoteAsset: DepegRow["quote_asset"]): number {
  return isBrlStableQuote(quoteAsset) ? 0.1 : 0.15;
}

function netMarginPct(row: Pick<DepegRow, "depeg_pct" | "orderbook_spread_pct" | "quote_asset">): number | null {
  if (row.depeg_pct === null || row.orderbook_spread_pct === null) return null;
  return Math.abs(row.depeg_pct) - row.orderbook_spread_pct - estimatedFeePct(row.quote_asset);
}

function hasExecutableOrderbookSource(source: string): boolean {
  return (
    source.includes("Binance Spot BookTicker") ||
    source.includes("Gate Spot Ticker") ||
    source.includes("KuCoin Spot Level1") ||
    source.includes("OKX Spot Ticker") ||
    source.includes("CoinEx Spot Ticker") ||
    source.includes("Bybit Spot Ticker") ||
    source.includes("HTX Spot Ticker") ||
    source.includes("Kraken Spot Ticker") ||
    source.includes("Coinbase Spot Ticker")
  );
}

export async function GET(request: NextRequest) {
  const thresholdPct = parsePositive(request.nextUrl.searchParams.get("min_depeg_pct"), 0.35);
  const now = Date.now();
  const cacheKey = thresholdPct.toFixed(4);
  const cacheHit = cache.get(cacheKey);

  if (cacheHit && cacheHit.expiresAt > now) {
    return NextResponse.json(cacheHit.payload, { status: 200 });
  }

  try {
    const fxNeeds = new Set<FxBase>();
    for (const pair of PAIRS) {
      if (pair.idealType === "fx" && pair.fxBase) {
        fxNeeds.add(pair.fxBase);
      }
    }

    const fxResults = await Promise.allSettled(
      [...fxNeeds].map(async (base) => {
        const value = await fetchFxToUsd(base);
        return [base, value] as const;
      })
    );

    const fxMap = new Map<FxBase, number>();
    for (const result of fxResults) {
      if (result.status === "fulfilled") {
        fxMap.set(result.value[0], result.value[1]);
      }
    }

    let usdBrl = 0;
    const needsUsdBrl = PAIRS.some((pair) => !isBrlStableQuote(pair.quoteAsset));
    if (needsUsdBrl) {
      const brlUsd = fxMap.get("BRL") ?? 0;
      if (brlUsd > 0) {
        usdBrl = 1 / brlUsd;
      }
      if (usdBrl <= 0) {
        try {
          usdBrl = await fetchUsdToBrl();
        } catch {
          usdBrl = 0;
        }
      }
    }

    const rawRows = await Promise.all(
      PAIRS.map(async (pair) => {
        const pegReference = pair.pegReference;
        const idealPrice =
          pair.idealType === "usd_peg" || pair.idealType === "cross_peg"
            ? 1
            : pair.fxBase
              ? toNum(fxMap.get(pair.fxBase))
              : 0;

        try {
          const { ticker, reason } = await fetchTickerWithFallback(pair);
          if (!ticker || idealPrice <= 0) {
            return {
              id: pair.id,
              label: pair.label,
              symbol: pair.symbol,
              quote_asset: pair.quoteAsset,
              status: "unavailable",
              analyzed_on: "Binance/Gate/KuCoin/OKX/CoinEx/Bybit/HTX/Kraken/Coinbase",
              peg_reference: pegReference,
              market_price: null,
              market_price_brl: null,
              bid_price: null,
              ask_price: null,
              orderbook_spread_pct: null,
              ideal_price: idealPrice > 0 ? Number(idealPrice.toFixed(6)) : null,
              ideal_price_brl: pair.displayBrl === false ? null : toBrlDisplay(idealPrice, pair.quoteAsset, usdBrl),
              depeg_pct: null,
              asymmetry_pct: null,
              direction: "below_peg",
              severity: "low",
              signal: "watch",
              notes: reason
                ? `Par monitorado, mas sem cotacao disponivel neste ciclo (${reason}).`
                : "Par monitorado, mas sem cotacao disponivel neste ciclo.",
            } as DepegRow;
          }

          const depegPct = ((ticker.mid - idealPrice) / idealPrice) * 100;
          const asymmetryPct = Math.abs(depegPct);
          const direction: DepegRow["direction"] = depegPct >= 0 ? "above_peg" : "below_peg";
          const orderbookSpreadPct = ((ticker.ask - ticker.bid) / ticker.mid) * 100;
          const { severity, signal } = classify(asymmetryPct);

          const executableSource = hasExecutableOrderbookSource(ticker.source);
          const notes = executableSource
            ? direction === "below_peg"
              ? "Ativo negociando abaixo da paridade teorica."
              : "Ativo negociando acima da paridade teorica."
            : "Fonte indicativa (ratio), pode divergir da execucao real no mesmo momento.";

          return {
            id: pair.id,
            label: pair.label,
            symbol: pair.symbol,
            quote_asset: pair.quoteAsset,
            status: "ok",
            analyzed_on: ticker.source,
            peg_reference: pegReference,
            market_price: Number(ticker.mid.toFixed(6)),
            market_price_brl: pair.displayBrl === false ? null : toBrlDisplay(ticker.mid, pair.quoteAsset, usdBrl),
            bid_price: executableSource ? Number(ticker.bid.toFixed(6)) : null,
            ask_price: executableSource ? Number(ticker.ask.toFixed(6)) : null,
            orderbook_spread_pct: executableSource ? Number(orderbookSpreadPct.toFixed(4)) : null,
            ideal_price: Number(idealPrice.toFixed(6)),
            ideal_price_brl: pair.displayBrl === false ? null : toBrlDisplay(idealPrice, pair.quoteAsset, usdBrl),
            depeg_pct: Number(depegPct.toFixed(4)),
            asymmetry_pct: Number(asymmetryPct.toFixed(4)),
            direction,
            severity,
            signal,
            notes,
          } as DepegRow;
        } catch (err) {
          const reason = normalizeError(err);
          return {
            id: pair.id,
            label: pair.label,
            symbol: pair.symbol,
            quote_asset: pair.quoteAsset,
            status: "unavailable",
            analyzed_on: "Binance/Gate/KuCoin/OKX/CoinEx/Bybit/HTX/Kraken/Coinbase",
            peg_reference: pegReference,
            market_price: null,
            market_price_brl: null,
            bid_price: null,
            ask_price: null,
            orderbook_spread_pct: null,
            ideal_price: idealPrice > 0 ? Number(idealPrice.toFixed(6)) : null,
            ideal_price_brl: pair.displayBrl === false ? null : toBrlDisplay(idealPrice, pair.quoteAsset, usdBrl),
            depeg_pct: null,
            asymmetry_pct: null,
            direction: "below_peg",
            severity: "low",
            signal: "watch",
            notes: `Par monitorado, mas a consulta da cotacao falhou neste ciclo (${reason})`,
          } as DepegRow;
        }
      })
    );

    const opportunities = rawRows
      .filter((row): row is DepegRow => row !== null)
      .sort((a, b) => {
        const aVal = a.asymmetry_pct ?? Number.NEGATIVE_INFINITY;
        const bVal = b.asymmetry_pct ?? Number.NEGATIVE_INFINITY;
        return bVal - aVal;
      });

    const aboveThreshold = opportunities
      .filter(
        (row): row is DepegRow & { status: "ok"; asymmetry_pct: number } =>
          row.status === "ok" &&
          hasExecutableOrderbookSource(row.analyzed_on) &&
          row.asymmetry_pct !== null &&
          row.asymmetry_pct >= thresholdPct &&
          row.depeg_pct !== null &&
          row.depeg_pct < 0
      )
      .sort((a, b) => {
        const aNet = netMarginPct(a);
        const bNet = netMarginPct(b);
        if (aNet === null && bNet === null) return b.asymmetry_pct - a.asymmetry_pct;
        if (aNet === null) return 1;
        if (bNet === null) return -1;
        if (bNet !== aNet) return bNet - aNet;
        return b.asymmetry_pct - a.asymmetry_pct;
      });

    const best = aboveThreshold[0] ?? null;
    const bestNetMargin = best ? netMarginPct(best) : null;

    const payload: DepegResponse = {
      timestamp: new Date().toISOString(),
      source: "binance/gate/kucoin/okx/coinex/bybit/htx/kraken/coinbase + frankfurter-fx",
      threshold_pct: Number(thresholdPct.toFixed(4)),
      usd_brl: usdBrl > 0 ? Number(usdBrl.toFixed(6)) : null,
      monitored_rows: opportunities,
      opportunities: aboveThreshold,
      summary: {
        monitored_pairs: PAIRS.length,
        above_threshold: aboveThreshold.length,
        max_asymmetry_pct: Number((best?.asymmetry_pct ?? 0).toFixed(4)),
        best_opportunity: best
          ? {
              id: best.id,
              label: best.label,
              depeg_pct: best.depeg_pct,
              asymmetry_pct: best.asymmetry_pct,
              direction: best.direction,
              signal: best.signal,
              net_margin_pct: bestNetMargin !== null ? Number(bestNetMargin.toFixed(4)) : null,
            }
          : null,
      },
      warning:
        aboveThreshold.length === 0
          ? "Sem oportunidade de compra em desconto acima do limiar no momento. Exibindo os valores atuais de todos os pares monitorados."
          : "Sinal baseado em fontes executaveis (orderbook). Valide liquidez real, slippage e custo operacional antes de executar.",
    };

    cache.set(cacheKey, {
      expiresAt: now + CACHE_TTL_MS,
      payload,
    });

    return NextResponse.json(payload, { status: 200 });
  } catch (err) {
    const payload: DepegResponse = {
      timestamp: new Date().toISOString(),
      source: "binance/gate/kucoin/okx/coinex/bybit/htx/kraken/coinbase + frankfurter-fx",
      threshold_pct: Number(thresholdPct.toFixed(4)),
      usd_brl: null,
      monitored_rows: fallbackRows("Par monitorado, mas a atualizacao geral da API falhou neste ciclo."),
      opportunities: [],
      summary: {
        monitored_pairs: PAIRS.length,
        above_threshold: 0,
        max_asymmetry_pct: 0,
        best_opportunity: null,
      },
      error: normalizeError(err),
      warning: "Nao foi possivel atualizar os dados de de-peg agora. Tente novamente em instantes.",
    };

    return NextResponse.json(payload, { status: 200 });
  }
}
