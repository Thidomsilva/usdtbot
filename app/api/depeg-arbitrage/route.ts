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
  idealType: "usd_peg" | "fx";
  fxBase?: FxBase;
};

type DepegRow = {
  id: string;
  label: string;
  symbol: string;
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
    best_opportunity: Pick<DepegRow, "id" | "label" | "depeg_pct" | "asymmetry_pct" | "direction" | "signal"> | null;
  };
  warning?: string;
  error?: string;
};

type CacheEntry = {
  expiresAt: number;
  payload: DepegResponse;
};

const cache = new Map<string, CacheEntry>();

const PAIRS: PairConfig[] = [
  {
    id: "fdusd-usdt",
    label: "FDUSD x USDT",
    symbol: "FDUSDUSDT",
    idealType: "usd_peg",
  },
  {
    id: "tusd-usdt",
    label: "TUSD x USDT",
    symbol: "TUSDUSDT",
    idealType: "usd_peg",
  },
  {
    id: "eurc-usdt",
    label: "EURC x USDT",
    symbol: "EURCUSDT",
    idealType: "fx",
    fxBase: "EUR",
  },
  {
    id: "eurs-usdt",
    label: "EURS x USDT",
    symbol: "EURSUSDT",
    idealType: "fx",
    fxBase: "EUR",
  },
  {
    id: "brz-usdt",
    label: "BRZ x USDT",
    symbol: "BRZUSDT",
    idealType: "fx",
    fxBase: "BRL",
  },
  {
    id: "brl1-usdt",
    label: "BRL1 x USDT",
    symbol: "BRL1USDT",
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
      status: "unavailable",
      analyzed_on: "Binance Spot BookTicker",
      peg_reference: isUsdPeg ? "USD (1:1)" : `${pair.fxBase}/USD via Frankfurter`,
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

async function fetchTicker(symbol: string): Promise<{ bid: number; ask: number; mid: number } | null> {
  const data = await fetchJson(`https://api.binance.com/api/v3/ticker/bookTicker?symbol=${symbol}`);
  const bid = toNum(data?.bidPrice);
  const ask = toNum(data?.askPrice);
  const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : 0;

  if (bid <= 0 || ask <= 0 || mid <= 0) {
    return null;
  }

  return { bid, ask, mid };
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
        const pegReference = pair.idealType === "usd_peg" ? "USD (1:1)" : `${pair.fxBase}/USD via Frankfurter`;
        const idealPrice =
          pair.idealType === "usd_peg"
            ? 1
            : pair.fxBase
              ? toNum(fxMap.get(pair.fxBase))
              : 0;

        try {
          const ticker = await fetchTicker(pair.symbol);
          if (!ticker || idealPrice <= 0) {
            return {
              id: pair.id,
              label: pair.label,
              symbol: pair.symbol,
              status: "unavailable",
              analyzed_on: "Binance Spot BookTicker",
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
              notes: "Par monitorado, mas sem cotacao disponivel neste ciclo.",
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
            status: "ok",
            analyzed_on: "Binance Spot BookTicker",
            peg_reference: pegReference,
            market_price: Number(ticker.mid.toFixed(6)),
            market_price_brl: usdBrl > 0 ? Number((ticker.mid * usdBrl).toFixed(6)) : null,
            bid_price: Number(ticker.bid.toFixed(6)),
            ask_price: Number(ticker.ask.toFixed(6)),
            orderbook_spread_pct: Number(orderbookSpreadPct.toFixed(4)),
            ideal_price: Number(idealPrice.toFixed(6)),
            ideal_price_brl: usdBrl > 0 ? Number((idealPrice * usdBrl).toFixed(6)) : null,
            depeg_pct: Number(depegPct.toFixed(4)),
            asymmetry_pct: Number(asymmetryPct.toFixed(4)),
            direction,
            severity,
            signal,
            notes,
          } as DepegRow;
        } catch {
          return {
            id: pair.id,
            label: pair.label,
            symbol: pair.symbol,
            status: "unavailable",
            analyzed_on: "Binance Spot BookTicker",
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
            notes: "Par monitorado, mas a consulta da cotacao falhou neste ciclo.",
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
      .filter((row) => row.status === "ok" && row.asymmetry_pct !== null && row.asymmetry_pct >= thresholdPct)
      .sort((a, b) => b.asymmetry_pct - a.asymmetry_pct);

    const best = aboveThreshold[0] ?? null;

    const payload: DepegResponse = {
      timestamp: new Date().toISOString(),
      source: "binance-bookticker + frankfurter-fx",
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
            }
          : null,
      },
      warning:
        aboveThreshold.length === 0
          ? "Sem descolamento relevante acima do limiar no momento. Exibindo os valores atuais de todos os pares monitorados."
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
      source: "binance-bookticker + frankfurter-fx",
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
