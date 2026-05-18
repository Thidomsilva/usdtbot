import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 9_000;
const CACHE_TTL_MS = 20_000;

type FxBase = "EUR" | "BRL";

type PairConfig = {
  id: string;
  label: string;
  symbol: string;
  quoteAsset: "USDT" | "BRLA";
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
  idealType: "usd_peg" | "fx";
  fxBase?: FxBase;
  priceMode?: "market" | "defillama_ratio";
  displayBrl?: boolean;
  disableAggregatorFallback?: boolean;
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
  quote_asset: "USDT" | "BRLA";
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

const OFFICIAL_TRANSFERO_BRZ_KEY = "polygon:0x4ed141110f6eeeaba9a1df36d8c26f684d2475dc";
const OFFICIAL_BRLA_KEY = "polygon:0xe6a537a407488807f0bbeb0038b79004f19dddfb";

const PAIRS: PairConfig[] = [
  {
    id: "fdusd-usdt",
    label: "FDUSD x USDT",
    symbol: "FDUSDUSDT",
    quoteAsset: "USDT",
    pegReference: "USD (1:1)",
    gateSymbol: "FDUSD_USDT",
    kucoinSymbol: "FDUSD-USDT",
    okxInstId: "FDUSD-USDT",
    coinexMarket: "FDUSDUSDT",
    bybitSymbol: "FDUSDUSDT",
    htxSymbol: "fdusdusdt",
    krakenSymbol: "FDUSDUSDT",
    coinbaseSymbol: "FDUSD-USD",
    coingeckoId: "first-digital-usd",
    coinmarketcapSlug: "first-digital-usd",
    idealType: "usd_peg",
  },
  {
    id: "tusd-usdt",
    label: "TUSD x USDT",
    symbol: "TUSDUSDT",
    quoteAsset: "USDT",
    pegReference: "USD (1:1)",
    gateSymbol: "TUSD_USDT",
    kucoinSymbol: "TUSD-USDT",
    okxInstId: "TUSD-USDT",
    coinexMarket: "TUSDUSDT",
    bybitSymbol: "TUSDUSDT",
    htxSymbol: "tusdusdt",
    krakenSymbol: "TUSDUSDT",
    coinbaseSymbol: "TUSD-USD",
    coingeckoId: "true-usd",
    coinmarketcapSlug: "true-usd",
    idealType: "usd_peg",
  },
  {
    id: "dai-usdt",
    label: "DAI x USDT",
    symbol: "DAIUSDT",
    quoteAsset: "USDT",
    pegReference: "USD (1:1)",
    gateSymbol: "DAI_USDT",
    kucoinSymbol: "DAI-USDT",
    okxInstId: "DAI-USDT",
    coinexMarket: "DAIUSDT",
    bybitSymbol: "DAIUSDT",
    htxSymbol: "daiusdt",
    krakenSymbol: "DAIUSDT",
    coinbaseSymbol: "DAI-USD",
    coingeckoId: "dai",
    coinmarketcapSlug: "multi-collateral-dai",
    idealType: "usd_peg",
  },
  {
    id: "eurc-usdt",
    label: "EURC x USDT",
    symbol: "EURCUSDT",
    quoteAsset: "USDT",
    pegReference: "EUR/USD via Frankfurter",
    gateSymbol: "EURC_USDT",
    kucoinSymbol: "EURC-USDT",
    okxInstId: "EURC-USDT",
    coinexMarket: "EURCUSDT",
    bybitSymbol: "EURCUSDT",
    htxSymbol: "eurcusdt",
    krakenSymbol: "EURCUSDT",
    coinbaseSymbol: "EURC-USD",
    coingeckoId: "euro-coin",
    coinmarketcapSlug: "euro-coin",
    idealType: "fx",
    fxBase: "EUR",
  },
  {
    id: "eurs-usdt",
    label: "EURS x USDT",
    symbol: "EURSUSDT",
    quoteAsset: "USDT",
    pegReference: "EUR/USD via Frankfurter",
    gateSymbol: "EURS_USDT",
    kucoinSymbol: "EURS-USDT",
    okxInstId: "EURS-USDT",
    coinexMarket: "EURSUSDT",
    bybitSymbol: "EURSUSDT",
    htxSymbol: "eursusdt",
    krakenSymbol: "EURSUSDT",
    coinbaseSymbol: "EURS-USD",
    coingeckoId: "stasis-eurs",
    coinmarketcapSlug: "stasis-eurs",
    idealType: "fx",
    fxBase: "EUR",
  },
  {
    id: "brz-usdt",
    label: "BRZ x USDT",
    symbol: "BRZUSDT",
    quoteAsset: "USDT",
    pegReference: "BRL/USD via Frankfurter",
    gateSymbol: "BRZ_USDT",
    kucoinSymbol: "BRZ-USDT",
    okxInstId: "BRZ-USDT",
    coinexMarket: "BRZUSDT",
    bybitSymbol: "BRZUSDT",
    htxSymbol: "brzusdt",
    krakenSymbol: "BRZUSDT",
    coinbaseSymbol: "BRZ-USD",
    coingeckoId: "brz",
    coinmarketcapSlug: "brz",
    idealType: "fx",
    fxBase: "BRL",
  },
  {
    id: "brz-brla",
    label: "BRZ x BRLA",
    symbol: "BRZBRLA",
    quoteAsset: "BRLA",
    pegReference: "BRLA (1:1, contratos oficiais)",
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
    idealType: "usd_peg",
    priceMode: "defillama_ratio",
    displayBrl: false,
    disableAggregatorFallback: true,
  },
  {
    id: "brl1-usdt",
    label: "BRL1 x USDT",
    symbol: "BRL1USDT",
    quoteAsset: "USDT",
    pegReference: "BRL/USD via Frankfurter",
    gateSymbol: "BRL1_USDT",
    kucoinSymbol: "BRL1-USDT",
    okxInstId: "BRL1-USDT",
    coinexMarket: "BRL1USDT",
    bybitSymbol: "BRL1USDT",
    htxSymbol: "brl1usdt",
    krakenSymbol: "BRL1USDT",
    coinbaseSymbol: "BRL1-USD",
    coingeckoId: "brl1",
    coinmarketcapSlug: "brl1",
    idealType: "fx",
    fxBase: "BRL",
  },
];

function fallbackRows(reason: string): DepegRow[] {
  return PAIRS.map((pair) => {
    const isUsdPeg = pair.idealType === "usd_peg";
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
      ideal_price: isUsdPeg ? 1 : null,
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

async function fetchTickerDefiLlamaRatio(baseKey: string, quoteKey: string, source: string): Promise<TickerResult | null> {
  const data = await fetchJson(`https://coins.llama.fi/prices/current/${baseKey},${quoteKey}`);
  const baseUsd = toNum(data?.coins?.[baseKey]?.price);
  const quoteUsd = toNum(data?.coins?.[quoteKey]?.price);

  if (baseUsd <= 0 || quoteUsd <= 0) {
    return null;
  }

  const mid = baseUsd / quoteUsd;
  if (mid <= 0) {
    return null;
  }

  const bid = mid * 0.9999;
  const ask = mid * 1.0001;

  return { bid, ask, mid, source };
}

async function fetchTickerWithFallback(pair: PairConfig): Promise<{ ticker: TickerResult | null; reason: string | null }> {
  const errors: string[] = [];

  if (pair.priceMode === "defillama_ratio") {
    try {
      const ticker = await fetchTickerDefiLlamaRatio(
        OFFICIAL_TRANSFERO_BRZ_KEY,
        OFFICIAL_BRLA_KEY,
        "DefiLlama on-chain ratio (Transfero oficial na Polygon)"
      );
      if (ticker) return { ticker, reason: null };
      errors.push("Sem preco oficial disponivel no DefiLlama para BRZ/BRLA");
    } catch (err) {
      errors.push(normalizeError(err));
    }
  }

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

async function fetchUsdToBrl(): Promise<number> {
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

function estimatedFeePct(quoteAsset: DepegRow["quote_asset"]): number {
  return quoteAsset === "BRLA" ? 0.1 : 0.15;
}

function netMarginPct(row: Pick<DepegRow, "depeg_pct" | "orderbook_spread_pct" | "quote_asset">): number | null {
  if (row.depeg_pct === null || row.orderbook_spread_pct === null) return null;
  return Math.abs(row.depeg_pct) - row.orderbook_spread_pct - estimatedFeePct(row.quote_asset);
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

    const rawRows = await Promise.all(
      PAIRS.map(async (pair) => {
        const pegReference = pair.pegReference;
        const idealPrice =
          pair.idealType === "usd_peg"
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
              analyzed_on: "Binance/Gate/KuCoin/OKX/CoinEx/Bybit/HTX/Kraken/Coinbase/CoinGecko/CoinMarketCap/DefiLlama",
              peg_reference: pegReference,
              market_price: null,
              market_price_brl: null,
              bid_price: null,
              ask_price: null,
              orderbook_spread_pct: null,
              ideal_price: idealPrice > 0 ? Number(idealPrice.toFixed(6)) : null,
              ideal_price_brl:
                pair.displayBrl === false || idealPrice <= 0 || usdBrl <= 0 ? null : Number((idealPrice * usdBrl).toFixed(6)),
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

          const notes =
            direction === "below_peg"
              ? "Ativo negociando abaixo da paridade teorica."
              : "Ativo negociando acima da paridade teorica.";

          return {
            id: pair.id,
            label: pair.label,
            symbol: pair.symbol,
            quote_asset: pair.quoteAsset,
            status: "ok",
            analyzed_on: ticker.source,
            peg_reference: pegReference,
            market_price: Number(ticker.mid.toFixed(6)),
            market_price_brl:
              pair.displayBrl === false || usdBrl <= 0 ? null : Number((ticker.mid * usdBrl).toFixed(6)),
            bid_price: Number(ticker.bid.toFixed(6)),
            ask_price: Number(ticker.ask.toFixed(6)),
            orderbook_spread_pct: Number(orderbookSpreadPct.toFixed(4)),
            ideal_price: Number(idealPrice.toFixed(6)),
            ideal_price_brl:
              pair.displayBrl === false || usdBrl <= 0 ? null : Number((idealPrice * usdBrl).toFixed(6)),
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
            analyzed_on: "Binance/Gate/KuCoin/OKX/CoinEx/Bybit/HTX/Kraken/Coinbase/CoinGecko/CoinMarketCap/DefiLlama",
            peg_reference: pegReference,
            market_price: null,
            market_price_brl: null,
            bid_price: null,
            ask_price: null,
            orderbook_spread_pct: null,
            ideal_price: idealPrice > 0 ? Number(idealPrice.toFixed(6)) : null,
            ideal_price_brl: idealPrice > 0 && usdBrl > 0 ? Number((idealPrice * usdBrl).toFixed(6)) : null,
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
      source: "binance/gate/kucoin/okx/coinex/bybit/htx/kraken/coinbase/coingecko/coinmarketcap + frankfurter-fx + defillama-official",
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
          : "Sinal indicativo. Valide liquidez real, slippage e custo operacional antes de executar.",
    };

    cache.set(cacheKey, {
      expiresAt: now + CACHE_TTL_MS,
      payload,
    });

    return NextResponse.json(payload, { status: 200 });
  } catch (err) {
    const payload: DepegResponse = {
      timestamp: new Date().toISOString(),
      source: "binance/gate/kucoin/okx/coinex/bybit/htx/kraken/coinbase/coingecko/coinmarketcap + frankfurter-fx + defillama-official",
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
