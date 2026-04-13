import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 15_000;

const SYMBOLS = ["BTC", "ETH", "SOL", "XRP", "BNB", "DOGE", "ADA", "AVAX", "LINK", "TON", "TRX"];

type Venue = "binance" | "bybit";

type VenueFees = {
  spot_taker_pct: number;
  futures_taker_pct: number;
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

async function fetchBinanceSymbol(symbol: string): Promise<{ spot_bid: number; spot_ask: number; futures_bid: number; futures_ask: number; funding_pct_8h: number } | null> {
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

async function fetchBybitSymbol(symbol: string): Promise<{ spot_bid: number; spot_ask: number; futures_bid: number; futures_ask: number; funding_pct_8h: number } | null> {
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

function buildOpportunity(
  symbol: string,
  venue: Venue,
  venueLabel: string,
  fees: VenueFees,
  row: { spot_bid: number; spot_ask: number; futures_bid: number; futures_ask: number; funding_pct_8h: number },
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
  };

  const opportunities: SpotFuturesRow[] = [];
  const warnings = new Set<string>();

  await Promise.all(
    SYMBOLS.map(async (symbol) => {
      const jobs: Array<Promise<void>> = [
        (async () => {
          try {
            const row = await fetchBinanceSymbol(symbol);
            if (!row) return;
            opportunities.push(buildOpportunity(symbol, "binance", "Binance", feesByVenue.binance, row, slippageBufferPct));
          } catch (err) {
            warnings.add(`Binance ${symbol}: ${normalizeError(err)}`);
          }
        })(),
        (async () => {
          try {
            const row = await fetchBybitSymbol(symbol);
            if (!row) return;
            opportunities.push(buildOpportunity(symbol, "bybit", "Bybit", feesByVenue.bybit, row, slippageBufferPct));
          } catch (err) {
            warnings.add(`Bybit ${symbol}: ${normalizeError(err)}`);
          }
        })(),
      ];

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
      venues: ["binance", "bybit"],
      profitable_count: profitableCount,
      best_opportunity: sorted[0] ?? null,
      slippage_buffer_pct: slippageBufferPct,
    },
  };

  if (warnings.size > 0) {
    payload.warning = [...warnings].slice(0, 6).join(" | ");
  }

  cache.set(cacheKey, {
    expiresAt: now + CACHE_TTL_MS,
    payload,
  });

  return NextResponse.json(payload, { status: 200 });
}
