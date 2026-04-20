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
  category?: "fan_token" | "major" | "altcoin";
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
  bid_price_brl?: number;
  ask_price_brl?: number;
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
  // === Grandes do mercado ===
  { id: "BTC", symbol: "BTC", team: "Bitcoin", tier: 1, category: "major" },
  { id: "ETH", symbol: "ETH", team: "Ethereum", tier: 1, category: "major" },
  { id: "USDT", symbol: "USDT", team: "Tether", tier: 1, category: "major" },
  { id: "USDC", symbol: "USDC", team: "USD Coin", tier: 1, category: "major" },
  { id: "BNB", symbol: "BNB", team: "Binance Coin", tier: 1, category: "major" },
  { id: "XRP", symbol: "XRP", team: "XRP", tier: 1, category: "major" },
  { id: "SOL", symbol: "SOL", team: "Solana", tier: 1, category: "major" },
  { id: "TRX", symbol: "TRX", team: "Tron", tier: 1, category: "major" },
  { id: "NEAR", symbol: "NEAR", team: "NEAR Protocol", tier: 1, category: "major" },
  { id: "SUI", symbol: "SUI", team: "Sui", tier: 1, category: "major" },
  { id: "APT", symbol: "APT", team: "Aptos", tier: 1, category: "major" },
  // === Altcoins de alta liquidez ===
  { id: "ADA", symbol: "ADA", team: "Cardano", tier: 2, category: "altcoin" },
  { id: "DOGE", symbol: "DOGE", team: "Dogecoin", tier: 2, category: "altcoin" },
  { id: "POL", symbol: "POL", team: "Polygon", tier: 2, category: "altcoin" },
  { id: "AVAX", symbol: "AVAX", team: "Avalanche", tier: 2, category: "altcoin" },
  { id: "DOT", symbol: "DOT", team: "Polkadot", tier: 2, category: "altcoin" },
  { id: "LINK", symbol: "LINK", team: "Chainlink", tier: 2, category: "altcoin" },
  { id: "LTC", symbol: "LTC", team: "Litecoin", tier: 2, category: "altcoin" },
  { id: "TON", symbol: "TON", team: "Toncoin", tier: 2, category: "altcoin" },
  { id: "SHIB", symbol: "SHIB", team: "Shiba Inu", tier: 2, category: "altcoin" },
  { id: "HBAR", symbol: "HBAR", team: "Hedera", tier: 2, category: "altcoin" },
  { id: "XLM", symbol: "XLM", team: "Stellar", tier: 2, category: "altcoin" },
  { id: "BCH", symbol: "BCH", team: "Bitcoin Cash", tier: 2, category: "altcoin" },
  { id: "ICP", symbol: "ICP", team: "Internet Computer", tier: 2, category: "altcoin" },
  { id: "FET", symbol: "FET", team: "Fetch.ai", tier: 2, category: "altcoin" },
  { id: "RENDER", symbol: "RENDER", team: "Render", tier: 2, category: "altcoin" },
  { id: "SEI", symbol: "SEI", team: "Sei", tier: 2, category: "altcoin" },
  { id: "ONDO", symbol: "ONDO", team: "Ondo", tier: 2, category: "altcoin" },
  { id: "ALGO", symbol: "ALGO", team: "Algorand", tier: 2, category: "altcoin" },
  { id: "SAND", symbol: "SAND", team: "The Sandbox", tier: 2, category: "altcoin" },
  { id: "MANA", symbol: "MANA", team: "Decentraland", tier: 2, category: "altcoin" },
  { id: "GRT", symbol: "GRT", team: "The Graph", tier: 2, category: "altcoin" },
  { id: "CRV", symbol: "CRV", team: "Curve DAO", tier: 2, category: "altcoin" },
  { id: "SNX", symbol: "SNX", team: "Synthetix", tier: 2, category: "altcoin" },
  { id: "UNI", symbol: "UNI", team: "Uniswap", tier: 2, category: "altcoin" },
  { id: "AAVE", symbol: "AAVE", team: "Aave", tier: 2, category: "altcoin" },
  { id: "OP", symbol: "OP", team: "Optimism", tier: 2, category: "altcoin" },
  { id: "ARB", symbol: "ARB", team: "Arbitrum", tier: 2, category: "altcoin" },
  { id: "INJ", symbol: "INJ", team: "Injective", tier: 2, category: "altcoin" },
  { id: "ATOM", symbol: "ATOM", team: "Cosmos", tier: 2, category: "altcoin" },
  { id: "ETC", symbol: "ETC", team: "Ethereum Classic", tier: 2, category: "altcoin" },
  { id: "FIL", symbol: "FIL", team: "Filecoin", tier: 2, category: "altcoin" },
  { id: "PEPE", symbol: "PEPE", team: "Pepe", tier: 3, category: "altcoin" },
  { id: "WIF", symbol: "WIF", team: "dogwifhat", tier: 3, category: "altcoin" },
  { id: "NOT", symbol: "NOT", team: "Notcoin", tier: 3, category: "altcoin" },
  { id: "BONK", symbol: "BONK", team: "Bonk", tier: 3, category: "altcoin" },
  { id: "FLOKI", symbol: "FLOKI", team: "Floki", tier: 3, category: "altcoin" },
  { id: "MEME", symbol: "MEME", team: "Memecoin", tier: 3, category: "altcoin" },
  { id: "BOME", symbol: "BOME", team: "Book of Meme", tier: 3, category: "altcoin" },
  { id: "VET", symbol: "VET", team: "VeChain", tier: 3, category: "altcoin" },
  // === Fan Tokens ===
  { id: "santos-fc-fan-token", symbol: "SANTOS", team: "Santos FC", tier: 1, category: "fan_token" },
  { id: "og-fan-token", symbol: "OG", team: "OG Esports", tier: 1, category: "fan_token" },
  { id: "fc-porto", symbol: "PORTO", team: "FC Porto", tier: 1, category: "fan_token" },
  { id: "lazio-fan-token", symbol: "LAZIO", team: "SS Lazio", tier: 1, category: "fan_token" },
  { id: "argentina-fan-token", symbol: "ARG", team: "AFA", tier: 1, category: "fan_token" },
  { id: "as-roma-fan-token", symbol: "ASR", team: "AS Roma", tier: 2, category: "fan_token" },
  { id: "paris-saint-germain-fan-token", symbol: "PSG", team: "PSG", tier: 2, category: "fan_token" },
  { id: "fc-barcelona-fan-token", symbol: "BAR", team: "FC Barcelona", tier: 2, category: "fan_token" },
  { id: "galatasaray-fan-token", symbol: "GAL", team: "Galatasaray", tier: 2, category: "fan_token" },
  { id: "ac-milan-fan-token", symbol: "ACM", team: "AC Milan", tier: 2, category: "fan_token" },
  { id: "juventus-fan-token", symbol: "JUV", team: "Juventus", tier: 3, category: "fan_token" },
  { id: "manchester-city-fan-token", symbol: "CITY", team: "Man City", tier: 3, category: "fan_token" },
  { id: "atletico-de-madrid", symbol: "ATM", team: "Atletico Madrid", tier: 3, category: "fan_token" },
  { id: "arsenal-fan-token", symbol: "AFC", team: "Arsenal", tier: 3, category: "fan_token" },
  { id: "inter-milan-fan-token", symbol: "INTER", team: "Inter Milan", tier: 3, category: "fan_token" },
  { id: "flamengo-fan-token", symbol: "MENGO", team: "Flamengo", tier: 4, category: "fan_token" },
  { id: "corinthians-fan-token", symbol: "SCCP", team: "Corinthians", tier: 4, category: "fan_token" },
  { id: "trabzonspor-fan-token", symbol: "TRA", team: "Trabzonspor", tier: 4, category: "fan_token" },
  { id: "alpine-f1-team-fan-token", symbol: "ALPINE", team: "Alpine F1", tier: 4, category: "fan_token" },
  { id: "ufc-fan-token", symbol: "UFC", team: "UFC", tier: 4, category: "fan_token" },
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
  bid_usdt?: number;
  ask_usdt?: number;
  bid_brl_direct?: number;
  ask_brl_direct?: number;
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
  const [d, book] = await Promise.all([
    fetchJson(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}USDT`),
    fetchJson(`https://api.binance.com/api/v3/ticker/bookTicker?symbol=${symbol}USDT`),
  ]);
  if (!d.lastPrice) return null;
  return {
    price_usdt: safeNumber(d.lastPrice),
    bid_usdt: safeNumber(book.bidPrice),
    ask_usdt: safeNumber(book.askPrice),
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
    bid_usdt: safeNumber(d.best_bid),
    ask_usdt: safeNumber(d.best_ask),
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
    bid_usdt: safeNumber(Array.isArray(t.b) ? t.b[0] : 0),
    ask_usdt: safeNumber(Array.isArray(t.a) ? t.a[0] : 0),
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
    bid_usdt: safeNumber(t.bid1Price),
    ask_usdt: safeNumber(t.ask1Price),
    volume: safeNumber(t.volume24h),
    change_24h: safeNumber(t.price24hPcnt) * 100,
    high: safeNumber(t.highPrice24h),
    low: safeNumber(t.lowPrice24h),
  };
}

async function fxBingx(symbol: string): Promise<RawQuote | null> {
  const [d, bookRes] = await Promise.all([
    fetchJson(`https://open-api.bingx.com/openApi/spot/v1/ticker/24hr?symbol=${symbol}-USDT`),
    fetchJson(`https://open-api.bingx.com/openApi/spot/v1/ticker/bookTicker?symbol=${symbol}-USDT`).catch(
      () => ({ data: {} } as Record<string, any>)
    ),
  ]);
  const p = d.data ?? {};
  const book = bookRes.data ?? {};
  if (!p.lastPrice) return null;
  return {
    price_usdt: safeNumber(p.lastPrice),
    bid_usdt: safeNumber(book.bidPrice),
    ask_usdt: safeNumber(book.askPrice),
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
    bid_brl_direct: safeNumber(t.buy),
    ask_brl_direct: safeNumber(t.sell),
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
    bid_usdt: safeNumber(t.bidPx),
    ask_usdt: safeNumber(t.askPx),
    volume: safeNumber(t.volCcy24h),
    change_24h: open > 0 ? ((last - open) / open) * 100 : 0,
    high: safeNumber(t.high24h),
    low: safeNumber(t.low24h),
  };
}

async function fxKucoin(symbol: string): Promise<RawQuote | null> {
  const [d, level1] = await Promise.all([
    fetchJson(`https://api.kucoin.com/api/v1/market/stats?symbol=${symbol}-USDT`),
    fetchJson(`https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=${symbol}-USDT`),
  ]);
  const t = d.data ?? {};
  const book = level1.data ?? {};
  if (!t.last) return null;
  const last = safeNumber(t.last);
  const open = safeNumber(t.open) || last;
  return {
    price_usdt: safeNumber(book.price) || last,
    bid_usdt: safeNumber(book.bestBid) || safeNumber(t.buy),
    ask_usdt: safeNumber(book.bestAsk) || safeNumber(t.sell),
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
    bid_usdt: safeNumber(t.bidPr),
    ask_usdt: safeNumber(t.askPr),
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
    bid_brl_direct: safeNumber(t.bidPrice) || safeNumber(t.buy),
    ask_brl_direct: safeNumber(t.askPrice) || safeNumber(t.sell),
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
    bid_usdt: safeNumber(t.highest_bid),
    ask_usdt: safeNumber(t.lowest_ask),
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
    const bidPriceBrl = raw.bid_brl_direct ?? ((raw.bid_usdt ?? 0) > 0 ? (raw.bid_usdt ?? 0) * usdBrl : 0);
    const askPriceBrl = raw.ask_brl_direct ?? ((raw.ask_usdt ?? 0) > 0 ? (raw.ask_usdt ?? 0) * usdBrl : 0);
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
      price_brl: Number(priceBrl.toFixed(8)),
      bid_price_brl: bidPriceBrl > 0 ? Number(bidPriceBrl.toFixed(8)) : undefined,
      ask_price_brl: askPriceBrl > 0 ? Number(askPriceBrl.toFixed(8)) : undefined,
      volume_24h_brl: Number(volumeBrl.toFixed(2)),
      change_24h: Number(raw.change_24h.toFixed(4)),
      high_24h_brl: Number(highBrl.toFixed(8)),
      low_24h_brl: Number(lowBrl.toFixed(8)),
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
  const ok = quotes.filter((q) => q.status === "ok" && (q.bid_price_brl ?? 0) > 0 && (q.ask_price_brl ?? 0) > 0);
  if (ok.length < 2) return null;

  let best: Arb | null = null;
  for (const buy of ok) {
    for (const sell of ok) {
      if (buy.exchange === sell.exchange) continue;
      if ((sell.bid_price_brl ?? 0) <= (buy.ask_price_brl ?? 0)) continue;

      const spread = (((sell.bid_price_brl ?? 0) - (buy.ask_price_brl ?? 0)) / (buy.ask_price_brl ?? 1)) * 100;
      if (!best || spread > best.spread_pct) {
        best = {
          buy_exchange: buy.exchange,
          buy_exchange_label: buy.label,
          sell_exchange: sell.exchange,
          sell_exchange_label: sell.label,
          buy_price_brl: buy.ask_price_brl ?? 0,
          sell_price_brl: sell.bid_price_brl ?? 0,
          spread_pct: Number(spread.toFixed(4)),
          profit_est_brl_per_100: Number((((100 / (buy.ask_price_brl ?? 1)) * ((sell.bid_price_brl ?? 0) - (buy.ask_price_brl ?? 0))).toFixed(4))),
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
          ? Number((okQuotes.reduce((acc, e) => acc + (e.price_brl ?? 0), 0) / okQuotes.length).toFixed(8))
          : null;

        return {
          id: token.id,
          symbol: token.symbol,
          team: token.team,
          tier: token.tier,
          category: token.category ?? "fan_token",
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
