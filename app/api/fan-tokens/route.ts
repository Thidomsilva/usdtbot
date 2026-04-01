import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 20_000;

let cache: { expiresAt: number; payload: any } | null = null;

type Tier = 1 | 2 | 3 | 4;

type FanToken = {
  id: string;
  symbol: string;
  team: string;
  tier: Tier;
};

type ExchangeMeta = {
  id: string;
  label: string;
  pix: boolean;
  accepts_brl: boolean;
  estimated: boolean;
};

type ExchangeQuote = {
  exchange: string;
  label: string;
  pix: boolean;
  accepts_brl: boolean;
  estimated: boolean;
  status: "ok" | "not_listed";
  error?: string;
  price_brl?: number;
  volume_24h_brl?: number;
  change_24h?: number;
  high_24h_brl?: number;
  low_24h_brl?: number;
};

type Arb = {
  buy_exchange: string;
  buy_exchange_label: string;
  sell_exchange: string;
  sell_exchange_label: string;
  buy_price_brl: number;
  sell_price_brl: number;
  spread_pct: number;
  profit_est_brl_per_100: number;
};

const TOKENS: FanToken[] = [
  { id: "santos-fc-fan-token", symbol: "SANTOS", team: "Santos FC", tier: 1 },
  { id: "og-fan-token", symbol: "OG", team: "OG Esports", tier: 1 },
  { id: "fc-porto", symbol: "PORTO", team: "FC Porto", tier: 1 },
  { id: "lazio-fan-token", symbol: "LAZIO", team: "SS Lazio", tier: 1 },
  { id: "argentina-fan-token", symbol: "ARG", team: "AFA", tier: 1 },
  { id: "as-roma-fan-token", symbol: "ASR", team: "AS Roma", tier: 2 },
  { id: "paris-saint-germain-fan-token", symbol: "PSG", team: "PSG", tier: 2 },
  { id: "fc-barcelona-fan-token", symbol: "BAR", team: "FC Barcelona", tier: 2 },
  { id: "galatasaray-fan-token", symbol: "GAL", team: "Galatasaray", tier: 2 },
  { id: "ac-milan-fan-token", symbol: "ACM", team: "AC Milan", tier: 2 },
  { id: "juventus-fan-token", symbol: "JUV", team: "Juventus", tier: 3 },
  { id: "manchester-city-fan-token", symbol: "CITY", team: "Man City", tier: 3 },
  { id: "atletico-de-madrid", symbol: "ATM", team: "Atletico Madrid", tier: 3 },
  { id: "arsenal-fan-token", symbol: "AFC", team: "Arsenal", tier: 3 },
  { id: "inter-milan-fan-token", symbol: "INTER", team: "Inter Milan", tier: 3 },
  { id: "flamengo-fan-token", symbol: "MENGO", team: "Flamengo", tier: 4 },
  { id: "corinthians-fan-token", symbol: "SCCP", team: "Corinthians", tier: 4 },
  { id: "trabzonspor-fan-token", symbol: "TRA", team: "Trabzonspor", tier: 4 },
  { id: "alpine-f1-team-fan-token", symbol: "ALPINE", team: "Alpine F1", tier: 4 },
  { id: "ufc-fan-token", symbol: "UFC", team: "UFC", tier: 4 },
];

const EXCHANGES: ExchangeMeta[] = [
  { id: "binance", label: "Binance", pix: false, accepts_brl: false, estimated: false },
  { id: "coinbase", label: "Coinbase", pix: false, accepts_brl: false, estimated: true },
  { id: "kraken", label: "Kraken", pix: false, accepts_brl: false, estimated: true },
  { id: "bybit", label: "Bybit", pix: false, accepts_brl: false, estimated: false },
  { id: "bingx", label: "BingX", pix: false, accepts_brl: false, estimated: true },
  { id: "mercadobitcoin", label: "Mercado Bitcoin", pix: true, accepts_brl: true, estimated: false },
  { id: "okx", label: "OKX", pix: false, accepts_brl: false, estimated: false },
  { id: "kucoin", label: "KuCoin", pix: false, accepts_brl: false, estimated: false },
  { id: "bitget", label: "Bitget", pix: false, accepts_brl: false, estimated: false },
  { id: "novadax", label: "Novadax", pix: true, accepts_brl: true, estimated: false },
  { id: "gate", label: "Gate.io", pix: false, accepts_brl: false, estimated: false },
];

type RawQuote = {
  price_usdt: number;
  volume: number;
  change_24h: number;
  high: number;
  low: number;
  price_brl_direct?: number;
};

type Fetcher = (symbol: string, usdBrl: number) => Promise<RawQuote | null>;

async function fetchJson(url: string): Promise<Record<string, any>> {
  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      accept: "application/json",
      "user-agent": "usdtbot-fantokens/1.0",
    },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as Record<string, any>;
}

function safeNumber(value: any): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeError(err: unknown): string {
  const msg = String(err ?? "Erro desconhecido");
  if (msg.includes("HTTP 451")) return "Indisponivel na regiao atual";
  if (msg.includes("HTTP 403")) return "Bloqueado para esta regiao";
  if (msg.toLowerCase().includes("timeout")) return "Timeout na consulta";
  return msg;
}

async function fetchUsdBrlRate(): Promise<number> {
  const payload = await fetchJson("https://api.frankfurter.app/latest?from=USD&to=BRL");
  const rate = safeNumber(payload.rates?.BRL);
  if (rate <= 0) throw new Error("Taxa USD/BRL indisponivel");
  return rate;
}

async function fxBinance(symbol: string): Promise<RawQuote | null> {
  const d = await fetchJson(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}USDT`);
  if (!d.lastPrice) return null;
  return {
    price_usdt: safeNumber(d.lastPrice),
    volume: safeNumber(d.quoteVolume),
    change_24h: safeNumber(d.priceChangePercent),
    high: safeNumber(d.highPrice),
    low: safeNumber(d.lowPrice),
  };
}

async function fxCoinbase(symbol: string): Promise<RawQuote | null> {
  const d = await fetchJson(`https://api.coinbase.com/api/v3/brokerage/products/${symbol}-USDT`);
  if (!d.price) return null;
  return {
    price_usdt: safeNumber(d.price),
    volume: safeNumber(d.volume_24h),
    change_24h: safeNumber(d.price_percentage_change_24h),
    high: 0,
    low: 0,
  };
}

async function fxKraken(symbol: string): Promise<RawQuote | null> {
  const d = await fetchJson(`https://api.kraken.com/0/public/Ticker?pair=${symbol}USDT`);
  if ((d.error && d.error.length) || !d.result) return null;
  const key = Object.keys(d.result)[0];
  if (!key) return null;
  const t = d.result[key] ?? {};
  const last = safeNumber(Array.isArray(t.c) ? t.c[0] : 0);
  if (last <= 0) return null;
  const open = safeNumber(t.o);
  return {
    price_usdt: last,
    volume: safeNumber(Array.isArray(t.v) ? t.v[1] : 0),
    change_24h: open > 0 ? ((last - open) / open) * 100 : 0,
    high: safeNumber(Array.isArray(t.h) ? t.h[1] : 0),
    low: safeNumber(Array.isArray(t.l) ? t.l[1] : 0),
  };
}

async function fxBybit(symbol: string): Promise<RawQuote | null> {
  const d = await fetchJson(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${symbol}USDT`);
  const items = Array.isArray(d.result?.list) ? d.result.list : [];
  const t = items[0] ?? {};
  if (!t.lastPrice) return null;
  return {
    price_usdt: safeNumber(t.lastPrice),
    volume: safeNumber(t.volume24h),
    change_24h: safeNumber(t.price24hPcnt) * 100,
    high: safeNumber(t.highPrice24h),
    low: safeNumber(t.lowPrice24h),
  };
}

async function fxBingx(symbol: string): Promise<RawQuote | null> {
  const d = await fetchJson(`https://open-api.bingx.com/openApi/spot/v1/ticker/24hr?symbol=${symbol}-USDT`);
  const p = d.data ?? {};
  if (!p.lastPrice) return null;
  return {
    price_usdt: safeNumber(p.lastPrice),
    volume: safeNumber(p.quoteVolume),
    change_24h: safeNumber(p.priceChangePercent),
    high: safeNumber(p.highPrice),
    low: safeNumber(p.lowPrice),
  };
}

async function fxMercadoBitcoin(symbol: string, usdBrl: number): Promise<RawQuote | null> {
  const d = await fetchJson(`https://www.mercadobitcoin.net/api/${symbol}/ticker/`);
  const t = d.ticker ?? {};
  const priceBrl = safeNumber(t.last);
  if (priceBrl <= 0) return null;
  const open = safeNumber(t.open) || priceBrl;
  const change = open > 0 ? ((priceBrl - open) / open) * 100 : 0;
  return {
    price_usdt: priceBrl / usdBrl,
    price_brl_direct: priceBrl,
    volume: safeNumber(t.vol) * priceBrl,
    change_24h: change,
    high: safeNumber(t.high),
    low: safeNumber(t.low),
  };
}

async function fxOkx(symbol: string): Promise<RawQuote | null> {
  const d = await fetchJson(`https://www.okx.com/api/v5/market/ticker?instId=${symbol}-USDT`);
  const t = Array.isArray(d.data) ? d.data[0] ?? {} : {};
  if (!t.last) return null;
  const last = safeNumber(t.last);
  const open = safeNumber(t.open24h) || last;
  return {
    price_usdt: last,
    volume: safeNumber(t.volCcy24h),
    change_24h: open > 0 ? ((last - open) / open) * 100 : 0,
    high: safeNumber(t.high24h),
    low: safeNumber(t.low24h),
  };
}

async function fxKucoin(symbol: string): Promise<RawQuote | null> {
  const d = await fetchJson(`https://api.kucoin.com/api/v1/market/stats?symbol=${symbol}-USDT`);
  const t = d.data ?? {};
  if (!t.last) return null;
  const last = safeNumber(t.last);
  const open = safeNumber(t.open) || last;
  return {
    price_usdt: last,
    volume: safeNumber(t.volValue),
    change_24h: open > 0 ? ((last - open) / open) * 100 : 0,
    high: safeNumber(t.high),
    low: safeNumber(t.low),
  };
}

async function fxBitget(symbol: string): Promise<RawQuote | null> {
  const d = await fetchJson(`https://api.bitget.com/api/v2/spot/market/tickers?symbol=${symbol}USDT`);
  const t = Array.isArray(d.data) ? d.data[0] ?? {} : {};
  if (!t.lastPr) return null;
  return {
    price_usdt: safeNumber(t.lastPr),
    volume: safeNumber(t.quoteVolume),
    change_24h: safeNumber(t.change24h) * 100,
    high: safeNumber(t.high24h),
    low: safeNumber(t.low24h),
  };
}

async function fxNovadax(symbol: string, usdBrl: number): Promise<RawQuote | null> {
  const d = await fetchJson(`https://api.novadax.com/v1/market/ticker?symbol=${symbol}_BRL`);
  const t = d.data ?? {};
  const priceBrl = safeNumber(t.lastPrice);
  if (priceBrl <= 0) return null;
  const open = safeNumber(t.open24h) || priceBrl;
  const change = open > 0 ? ((priceBrl - open) / open) * 100 : 0;
  return {
    price_usdt: priceBrl / usdBrl,
    price_brl_direct: priceBrl,
    volume: safeNumber(t.volume24h) * priceBrl,
    change_24h: change,
    high: safeNumber(t.high24h) / usdBrl,
    low: safeNumber(t.low24h) / usdBrl,
  };
}

async function fxGate(symbol: string): Promise<RawQuote | null> {
  const d = await fetchJson(`https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${symbol}_USDT`);
  if (!Array.isArray(d) || d.length === 0) return null;
  const t = d[0] ?? {};
  const last = safeNumber(t.last);
  if (last <= 0) return null;
  const open = safeNumber(t.open_24h) || last;
  return {
    price_usdt: last,
    volume: safeNumber(t.quote_volume),
    change_24h: open > 0 ? ((last - open) / open) * 100 : 0,
    high: safeNumber(t.high_24h),
    low: safeNumber(t.low_24h),
  };
}

const FETCHERS: Record<string, { fetcher: Fetcher; needsBrl: boolean }> = {
  binance: { fetcher: async (symbol) => fxBinance(symbol), needsBrl: false },
  coinbase: { fetcher: async (symbol) => fxCoinbase(symbol), needsBrl: false },
  kraken: { fetcher: async (symbol) => fxKraken(symbol), needsBrl: false },
  bybit: { fetcher: async (symbol) => fxBybit(symbol), needsBrl: false },
  bingx: { fetcher: async (symbol) => fxBingx(symbol), needsBrl: false },
  mercadobitcoin: { fetcher: async (symbol, usdBrl) => fxMercadoBitcoin(symbol, usdBrl), needsBrl: true },
  okx: { fetcher: async (symbol) => fxOkx(symbol), needsBrl: false },
  kucoin: { fetcher: async (symbol) => fxKucoin(symbol), needsBrl: false },
  bitget: { fetcher: async (symbol) => fxBitget(symbol), needsBrl: false },
  novadax: { fetcher: async (symbol, usdBrl) => fxNovadax(symbol, usdBrl), needsBrl: true },
  gate: { fetcher: async (symbol) => fxGate(symbol), needsBrl: false },
};

async function fetchTokenOnExchange(tokenSymbol: string, exchange: ExchangeMeta, usdBrl: number): Promise<ExchangeQuote> {
  const conf = FETCHERS[exchange.id];
  try {
    const raw = await conf.fetcher(tokenSymbol, usdBrl);
    if (!raw) {
      return {
        exchange: exchange.id,
        label: exchange.label,
        pix: exchange.pix,
        accepts_brl: exchange.accepts_brl,
        estimated: exchange.estimated,
        status: "not_listed",
      };
    }

    const priceBrl = raw.price_brl_direct ?? raw.price_usdt * usdBrl;
    const highBrl = raw.high > 0 ? raw.high * (raw.price_brl_direct ? 1 : usdBrl) : priceBrl;
    const lowBrl = raw.low > 0 ? raw.low * (raw.price_brl_direct ? 1 : usdBrl) : priceBrl;
    const volumeBrl = raw.price_brl_direct ? raw.volume : raw.volume * usdBrl;

    return {
      exchange: exchange.id,
      label: exchange.label,
      pix: exchange.pix,
      accepts_brl: exchange.accepts_brl,
      estimated: exchange.estimated,
      status: "ok",
      price_brl: Number(priceBrl.toFixed(4)),
      volume_24h_brl: Number(volumeBrl.toFixed(2)),
      change_24h: Number(raw.change_24h.toFixed(4)),
      high_24h_brl: Number(highBrl.toFixed(4)),
      low_24h_brl: Number(lowBrl.toFixed(4)),
    };
  } catch (err) {
    return {
      exchange: exchange.id,
      label: exchange.label,
      pix: exchange.pix,
      accepts_brl: exchange.accepts_brl,
      estimated: exchange.estimated,
      status: "not_listed",
      error: normalizeError(err),
    };
  }
}

function getBestArb(quotes: ExchangeQuote[]): Arb | null {
  const ok = quotes.filter((q) => q.status === "ok" && (q.price_brl ?? 0) > 0);
  if (ok.length < 2) return null;

  let best: Arb | null = null;
  for (const buy of ok) {
    for (const sell of ok) {
      if (buy.exchange === sell.exchange) continue;
      if ((sell.price_brl ?? 0) <= (buy.price_brl ?? 0)) continue;

      const spread = (((sell.price_brl ?? 0) - (buy.price_brl ?? 0)) / (buy.price_brl ?? 1)) * 100;
      if (!best || spread > best.spread_pct) {
        best = {
          buy_exchange: buy.exchange,
          buy_exchange_label: buy.label,
          sell_exchange: sell.exchange,
          sell_exchange_label: sell.label,
          buy_price_brl: buy.price_brl ?? 0,
          sell_price_brl: sell.price_brl ?? 0,
          spread_pct: Number(spread.toFixed(4)),
          profit_est_brl_per_100: Number((((100 / (buy.price_brl ?? 1)) * ((sell.price_brl ?? 0) - (buy.price_brl ?? 0))).toFixed(4))),
        };
      }
    }
  }

  return best;
}

export async function GET() {
  try {
    const now = Date.now();
    if (cache && cache.expiresAt > now) {
      return NextResponse.json(cache.payload, { status: 200 });
    }

    const usdBrl = await fetchUsdBrlRate();

    const tokens = await Promise.all(
      TOKENS.map(async (token) => {
        const exchanges = await Promise.all(
          EXCHANGES.map((exchange) => fetchTokenOnExchange(token.symbol, exchange, usdBrl))
        );
        const okQuotes = exchanges.filter((e) => e.status === "ok" && (e.price_brl ?? 0) > 0);
        const avg = okQuotes.length
          ? Number((okQuotes.reduce((acc, e) => acc + (e.price_brl ?? 0), 0) / okQuotes.length).toFixed(4))
          : null;

        return {
          id: token.id,
          symbol: token.symbol,
          team: token.team,
          tier: token.tier,
          status: "ok",
          avg_price_brl: avg,
          exchanges,
          best_arb: getBestArb(exchanges),
        };
      })
    );

    const withArb = tokens.filter((t) => t.status === "ok" && t.best_arb);
    const above1 = withArb.filter((t) => (t.best_arb?.spread_pct ?? 0) >= 1);
    const above3 = withArb.filter((t) => (t.best_arb?.spread_pct ?? 0) >= 3);
    const best = withArb
      .slice()
      .sort((a, b) => (b.best_arb?.spread_pct ?? 0) - (a.best_arb?.spread_pct ?? 0))[0];

    const payload = {
      timestamp: new Date().toISOString(),
      exchanges_monitored: EXCHANGES.map((e) => e.id),
      summary: {
        total_tokens: tokens.length,
        with_arbitrage: withArb.length,
        above_1_pct: above1.length,
        above_3_pct: above3.length,
        usd_brl: Number(usdBrl.toFixed(4)),
        best_opportunity: best
          ? {
              symbol: best.symbol,
              team: best.team,
              spread_pct: best.best_arb?.spread_pct ?? 0,
              buy: best.best_arb?.buy_exchange_label ?? "",
              sell: best.best_arb?.sell_exchange_label ?? "",
            }
          : null,
      },
      tokens,
    };

    cache = {
      expiresAt: now + CACHE_TTL_MS,
      payload,
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      {
        timestamp: new Date().toISOString(),
        summary: null,
        tokens: [],
        error: String(err ?? "Erro interno"),
      },
      { status: 500 }
    );
  }
}
