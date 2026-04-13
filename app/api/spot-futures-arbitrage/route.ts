import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 15_000;

const SYMBOLS = ["BTC", "ETH", "SOL", "XRP", "BNB", "DOGE", "ADA", "AVAX", "LINK", "TON", "TRX"];

type Venue = "binance" | "bybit" | "okx" | "bitget" | "gate" | "mexc";

type VenueFees = {
  spot_taker_pct: number;
  futures_taker_pct: number;
};

type QuoteRow = {
  spot_bid: number;
  spot_ask: number;
  futures_bid: number;
  futures_ask: number;
  funding_pct_8h: number;
};

type VenueConfig = {
  id: Venue;
  label: string;
  fetcher: (symbol: string) => Promise<QuoteRow | null>;
};

type SpotFuturesRow = {
  symbol: string;
  venue: Venue;
  venue_label: string;
  spot_bid: number;
  spot_ask: number;
  futures_bid: number;
  futures_ask: number;
  funding_rate_pct_8h: number;
  basis_pct: number;
  gross_entry_pct: number;
  fee_roundtrip_pct: number;
  slippage_buffer_pct: number;
  net_est_pct_8h: number;
};

type SpotFuturesResponse = {
  timestamp: string;
  opportunities: SpotFuturesRow[];
  summary: {
    symbols_monitored: number;
    venues: string[];
    profitable_count: number;
    best_opportunity: SpotFuturesRow | null;
    slippage_buffer_pct: number;
  };
  warning?: string;
  error?: string;
};

type CacheEntry = {
  expiresAt: number;
  payload: SpotFuturesResponse;
};

const cache = new Map<string, CacheEntry>();

function safeNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parsePositiveNumber(value: string | null, fallback: number): number {
  const num = safeNumber(value);
  if (num <= 0) return fallback;
  return num;
}

function normalizeError(err: unknown): string {
  const msg = String(err ?? "Erro desconhecido");
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
      "user-agent": "usdtbot-spot-futures/1.0",
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  return res.json();
}

async function fetchBinanceSymbol(symbol: string): Promise<QuoteRow | null> {
  const pair = `${symbol}USDT`;
  const [spotBook, futuresBook, funding] = await Promise.all([
    fetchJson(`https://api.binance.com/api/v3/ticker/bookTicker?symbol=${pair}`),
    fetchJson(`https://fapi.binance.com/fapi/v1/ticker/bookTicker?symbol=${pair}`),
    fetchJson(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${pair}`),
  ]);

  const spotBid = safeNumber(spotBook.bidPrice);
  const spotAsk = safeNumber(spotBook.askPrice);
  const futBid = safeNumber(futuresBook.bidPrice);
  const futAsk = safeNumber(futuresBook.askPrice);
  const fundingPct8h = safeNumber(funding.lastFundingRate) * 100;

  if (spotBid <= 0 || spotAsk <= 0 || futBid <= 0 || futAsk <= 0) {
    return null;
  }

  return {
    spot_bid: spotBid,
    spot_ask: spotAsk,
    futures_bid: futBid,
    futures_ask: futAsk,
    funding_pct_8h: fundingPct8h,
  };
}

async function fetchBybitSymbol(symbol: string): Promise<QuoteRow | null> {
  const pair = `${symbol}USDT`;
  const [spotTickers, futuresTickers] = await Promise.all([
    fetchJson(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${pair}`),
    fetchJson(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${pair}`),
  ]);

  const spot = Array.isArray(spotTickers?.result?.list) ? spotTickers.result.list[0] ?? {} : {};
  const fut = Array.isArray(futuresTickers?.result?.list) ? futuresTickers.result.list[0] ?? {} : {};

  const spotBid = safeNumber(spot.bid1Price);
  const spotAsk = safeNumber(spot.ask1Price);
  const futBid = safeNumber(fut.bid1Price);
  const futAsk = safeNumber(fut.ask1Price);
  const fundingPct8h = safeNumber(fut.fundingRate) * 100;

  if (spotBid <= 0 || spotAsk <= 0 || futBid <= 0 || futAsk <= 0) {
    return null;
  }

  return {
    spot_bid: spotBid,
    spot_ask: spotAsk,
    futures_bid: futBid,
    futures_ask: futAsk,
    funding_pct_8h: fundingPct8h,
  };
}

async function fetchOkxSymbol(symbol: string): Promise<QuoteRow | null> {
  const pair = `${symbol}-USDT`;
  const [spotBook, futuresBook, funding] = await Promise.all([
    fetchJson(`https://www.okx.com/api/v5/market/books?instId=${pair}&sz=1`),
    fetchJson(`https://www.okx.com/api/v5/market/books?instId=${pair}-SWAP&sz=1`),
    fetchJson(`https://www.okx.com/api/v5/public/funding-rate?instId=${pair}-SWAP`),
  ]);

  const s0 = Array.isArray(spotBook?.data) ? spotBook.data[0] ?? {} : {};
  const f0 = Array.isArray(futuresBook?.data) ? futuresBook.data[0] ?? {} : {};
  const fr0 = Array.isArray(funding?.data) ? funding.data[0] ?? {} : {};

  const spotBid = safeNumber(Array.isArray(s0.bids) ? s0.bids[0]?.[0] : 0);
  const spotAsk = safeNumber(Array.isArray(s0.asks) ? s0.asks[0]?.[0] : 0);
  const futBid = safeNumber(Array.isArray(f0.bids) ? f0.bids[0]?.[0] : 0);
  const futAsk = safeNumber(Array.isArray(f0.asks) ? f0.asks[0]?.[0] : 0);
  const fundingPct8h = safeNumber(fr0.fundingRate) * 100;

  if (spotBid <= 0 || spotAsk <= 0 || futBid <= 0 || futAsk <= 0) {
    return null;
  }

  return {
    spot_bid: spotBid,
    spot_ask: spotAsk,
    futures_bid: futBid,
    futures_ask: futAsk,
    funding_pct_8h: fundingPct8h,
  };
}

async function fetchBitgetSymbol(symbol: string): Promise<QuoteRow | null> {
  const pair = `${symbol}USDT`;
  const [spotBook, futuresBook, funding] = await Promise.all([
    fetchJson(`https://api.bitget.com/api/v2/spot/market/orderbook?symbol=${pair}&type=step0&limit=1`),
    fetchJson(`https://api.bitget.com/api/v2/mix/market/orderbook?symbol=${symbol}USDT&productType=USDT-FUTURES&limit=1`),
    fetchJson(`https://api.bitget.com/api/v2/mix/market/current-fund-rate?symbol=${symbol}USDT&productType=USDT-FUTURES`),
  ]);

  const s0 = Array.isArray(spotBook?.data?.bids) ? spotBook.data : {};
  const f0 = futuresBook?.data ?? {};
  const fr0 = funding?.data?.[0] ?? funding?.data ?? {};

  const spotBid = safeNumber(Array.isArray(s0.bids) ? s0.bids[0]?.[0] : 0);
  const spotAsk = safeNumber(Array.isArray(s0.asks) ? s0.asks[0]?.[0] : 0);
  const futBid = safeNumber(Array.isArray(f0.bids) ? f0.bids[0]?.[0] : 0);
  const futAsk = safeNumber(Array.isArray(f0.asks) ? f0.asks[0]?.[0] : 0);
  const fundingPct8h = safeNumber(fr0.fundingRate) * 100;

  if (spotBid <= 0 || spotAsk <= 0 || futBid <= 0 || futAsk <= 0) {
    return null;
  }

  return {
    spot_bid: spotBid,
    spot_ask: spotAsk,
    futures_bid: futBid,
    futures_ask: futAsk,
    funding_pct_8h: fundingPct8h,
  };
}

async function fetchGateSymbol(symbol: string): Promise<QuoteRow | null> {
  const pair = `${symbol}_USDT`;
  const [spotBook, futuresBook, funding] = await Promise.all([
    fetchJson(`https://api.gateio.ws/api/v4/spot/order_book?currency_pair=${pair}&limit=1`),
    fetchJson(`https://api.gateio.ws/api/v4/futures/usdt/order_book?contract=${pair}&limit=1`),
    fetchJson(`https://api.gateio.ws/api/v4/futures/usdt/contracts/${pair}`),
  ]);

  const spotBid = safeNumber(Array.isArray(spotBook?.bids) ? spotBook.bids[0]?.[0] : 0);
  const spotAsk = safeNumber(Array.isArray(spotBook?.asks) ? spotBook.asks[0]?.[0] : 0);
  const futBid = safeNumber(Array.isArray(futuresBook?.bids) ? futuresBook.bids[0]?.p : 0);
  const futAsk = safeNumber(Array.isArray(futuresBook?.asks) ? futuresBook.asks[0]?.p : 0);
  const fundingPct8h = safeNumber(funding?.funding_rate) * 100;

  if (spotBid <= 0 || spotAsk <= 0 || futBid <= 0 || futAsk <= 0) {
    return null;
  }

  return {
    spot_bid: spotBid,
    spot_ask: spotAsk,
    futures_bid: futBid,
    futures_ask: futAsk,
    funding_pct_8h: fundingPct8h,
  };
}

async function fetchMexcSymbol(symbol: string): Promise<QuoteRow | null> {
  const pair = `${symbol}USDT`;
  const [spotBook, futuresBook, funding] = await Promise.all([
    fetchJson(`https://api.mexc.com/api/v3/depth?symbol=${pair}&limit=1`),
    fetchJson(`https://contract.mexc.com/api/v1/contract/depth/${pair}?limit=1`),
    fetchJson(`https://contract.mexc.com/api/v1/contract/funding_rate/${pair}`),
  ]);

  const spotBid = safeNumber(Array.isArray(spotBook?.bids) ? spotBook.bids[0]?.[0] : 0);
  const spotAsk = safeNumber(Array.isArray(spotBook?.asks) ? spotBook.asks[0]?.[0] : 0);

  const fdata = futuresBook?.data ?? {};
  const futBid = safeNumber(Array.isArray(fdata.bids) ? fdata.bids[0]?.[0] ?? fdata.bids[0]?.price : 0);
  const futAsk = safeNumber(Array.isArray(fdata.asks) ? fdata.asks[0]?.[0] ?? fdata.asks[0]?.price : 0);
  const fr = funding?.data ?? {};
  const fundingPct8h = safeNumber(fr.fundingRate ?? fr.funding_rate) * 100;

  if (spotBid <= 0 || spotAsk <= 0 || futBid <= 0 || futAsk <= 0) {
    return null;
  }

  return {
    spot_bid: spotBid,
    spot_ask: spotAsk,
    futures_bid: futBid,
    futures_ask: futAsk,
    funding_pct_8h: fundingPct8h,
  };
}

function buildOpportunity(
  symbol: string,
  venue: Venue,
  venueLabel: string,
  fees: VenueFees,
  row: QuoteRow,
  slippageBufferPct: number
): SpotFuturesRow {
  const basisPct = ((row.futures_bid - row.spot_ask) / row.spot_ask) * 100;
  const grossEntryPct = basisPct;

  // Roundtrip aproximado: abrir e fechar spot + abrir e fechar future.
  const feeRoundtripPct = 2 * (fees.spot_taker_pct + fees.futures_taker_pct);

  // Estrategia cash-and-carry (buy spot + short future): basis + funding - custos.
  const netEstPct8h = grossEntryPct + row.funding_pct_8h - feeRoundtripPct - slippageBufferPct;

  return {
    symbol,
    venue,
    venue_label: venueLabel,
    spot_bid: Number(row.spot_bid.toFixed(6)),
    spot_ask: Number(row.spot_ask.toFixed(6)),
    futures_bid: Number(row.futures_bid.toFixed(6)),
    futures_ask: Number(row.futures_ask.toFixed(6)),
    funding_rate_pct_8h: Number(row.funding_pct_8h.toFixed(6)),
    basis_pct: Number(basisPct.toFixed(6)),
    gross_entry_pct: Number(grossEntryPct.toFixed(6)),
    fee_roundtrip_pct: Number(feeRoundtripPct.toFixed(6)),
    slippage_buffer_pct: Number(slippageBufferPct.toFixed(6)),
    net_est_pct_8h: Number(netEstPct8h.toFixed(6)),
  };
}

export async function GET(request: NextRequest) {
  const slippageBufferPct = parsePositiveNumber(request.nextUrl.searchParams.get("slippage_buffer_pct"), 0.1);
  const cacheKey = `slippage:${slippageBufferPct.toFixed(4)}`;
  const now = Date.now();
  const cacheHit = cache.get(cacheKey);

  if (cacheHit && cacheHit.expiresAt > now) {
    return NextResponse.json(cacheHit.payload, { status: 200 });
  }

  const feesByVenue: Record<Venue, VenueFees> = {
    binance: { spot_taker_pct: 0.1, futures_taker_pct: 0.05 },
    bybit: { spot_taker_pct: 0.1, futures_taker_pct: 0.055 },
    okx: { spot_taker_pct: 0.1, futures_taker_pct: 0.05 },
    bitget: { spot_taker_pct: 0.1, futures_taker_pct: 0.06 },
    gate: { spot_taker_pct: 0.2, futures_taker_pct: 0.05 },
    mexc: { spot_taker_pct: 0.1, futures_taker_pct: 0.04 },
  };

  const venues: VenueConfig[] = [
    { id: "binance", label: "Binance", fetcher: fetchBinanceSymbol },
    { id: "bybit", label: "Bybit", fetcher: fetchBybitSymbol },
    { id: "okx", label: "OKX", fetcher: fetchOkxSymbol },
    { id: "bitget", label: "Bitget", fetcher: fetchBitgetSymbol },
    { id: "gate", label: "Gate.io", fetcher: fetchGateSymbol },
    { id: "mexc", label: "MEXC", fetcher: fetchMexcSymbol },
  ];

  const opportunities: SpotFuturesRow[] = [];
  const warningByVenue = new Map<string, Set<string>>();

  await Promise.all(
    SYMBOLS.map(async (symbol) => {
      const jobs: Array<Promise<void>> = venues.map(async (venue) => {
        try {
          const row = await venue.fetcher(symbol);
          if (!row) return;
          opportunities.push(buildOpportunity(symbol, venue.id, venue.label, feesByVenue[venue.id], row, slippageBufferPct));
        } catch (err) {
          const key = venue.label;
          const msg = normalizeError(err);
          const current = warningByVenue.get(key) ?? new Set<string>();
          current.add(msg);
          warningByVenue.set(key, current);
        }
      });

      await Promise.all(jobs);
    })
  );

  const sorted = opportunities.sort((a, b) => b.net_est_pct_8h - a.net_est_pct_8h);
  const profitableCount = sorted.filter((o) => o.net_est_pct_8h > 0).length;

  const payload: SpotFuturesResponse = {
    timestamp: new Date().toISOString(),
    opportunities: sorted,
    summary: {
      symbols_monitored: SYMBOLS.length,
      venues: venues.map((v) => v.id),
      profitable_count: profitableCount,
      best_opportunity: sorted[0] ?? null,
      slippage_buffer_pct: slippageBufferPct,
    },
  };

  if (warningByVenue.size > 0) {
    payload.warning = [...warningByVenue.entries()]
      .map(([venue, msgs]) => `${venue}: ${[...msgs].join(", ")}`)
      .slice(0, 6)
      .join(" | ");
  }

  cache.set(cacheKey, {
    expiresAt: now + CACHE_TTL_MS,
    payload,
  });

  return NextResponse.json(payload, { status: 200 });
}
