import { NextResponse } from "next/server";
import type { ExchangeData, PricesResponse, Summary } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 8000;

let usdBrlCache: { value: number; expiresAt: number } | null = null;

type Fetcher = () => Promise<Omit<ExchangeData, "status" | "label" | "pair">>;

type ExchangeDef = {
  key: string;
  label: string;
  fetcher: Fetcher;
};

function roundIfPositive(value: number | undefined): number | undefined {
  return value && value > 0 ? Number(value.toFixed(4)) : undefined;
}

async function fetchJson(url: string): Promise<Record<string, any>> {
  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      accept: "application/json",
      "user-agent": "usdtbot-monitor/1.0",
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  return (await res.json()) as Record<string, any>;
}

function safeNumber(value: any): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
}

async function fetchUsdBrlRate(): Promise<number> {
  const now = Date.now();
  if (usdBrlCache && usdBrlCache.expiresAt > now) {
    return usdBrlCache.value;
  }

  const payload = await fetchJson("https://api.frankfurter.app/latest?from=USD&to=BRL");
  const rate = safeNumber(payload.rates?.BRL);
  if (rate <= 0) {
    throw new Error("Taxa USD/BRL indisponivel");
  }

  usdBrlCache = {
    value: rate,
    expiresAt: now + 60_000,
  };

  return rate;
}

function buildUsdFallback(
  usdtUsd: number,
  usdBrl: number,
  sourceUrl: string,
  sourcePair: string,
  opts?: {
    change_24h?: number;
    high_usd?: number;
    low_usd?: number;
    volume_usd?: number;
  }
) {
  const priceBrl = usdtUsd * usdBrl;
  const highUsd = opts?.high_usd ?? usdtUsd;
  const lowUsd = opts?.low_usd ?? usdtUsd;
  const volumeUsd = opts?.volume_usd ?? 0;

  return {
    pricing_mode: "fallback" as const,
    source_pair: sourcePair,
    warning: `Preco estimado via ${sourcePair} + USD/BRL; pode haver variacao.`,
    price_brl: priceBrl,
    volume_24h: volumeUsd > 0 ? volumeUsd * usdBrl : 0,
    change_24h: opts?.change_24h ?? 0,
    high_24h: highUsd * usdBrl,
    low_24h: lowUsd * usdBrl,
    source_url: sourceUrl,
  };
}

async function fetchBinance() {
  const hosts = ["api.binance.com", "api1.binance.com", "api2.binance.com", "api3.binance.com"];

  for (const host of hosts) {
    try {
      const [data, book] = await Promise.all([
        fetchJson(`https://${host}/api/v3/ticker/24hr?symbol=USDTBRL`),
        fetchJson(`https://${host}/api/v3/ticker/bookTicker?symbol=USDTBRL`),
      ]);
      const price = safeNumber(data.lastPrice);
      if (price > 0) {
        return {
          price_brl: price,
          bid_price_brl: safeNumber(book.bidPrice),
          ask_price_brl: safeNumber(book.askPrice),
          volume_24h: safeNumber(data.quoteVolume),
          change_24h: safeNumber(data.priceChangePercent),
          high_24h: safeNumber(data.highPrice),
          low_24h: safeNumber(data.lowPrice),
          source_url: "https://www.binance.com/en/trade/USDT_BRL",
        };
      }
    } catch {
      // Try next Binance host.
    }
  }

  // Fallback: gets Binance reference price via CryptoCompare when direct endpoints are blocked.
  const fallback = await fetchJson("https://min-api.cryptocompare.com/data/price?fsym=USDT&tsyms=BRL&e=Binance");
  const fallbackPrice = safeNumber(fallback.BRL);
  if (fallbackPrice <= 0) {
    throw new Error("Binance ticker indisponivel");
  }

  return {
    price_brl: fallbackPrice,
    volume_24h: 0,
    change_24h: 0,
    high_24h: fallbackPrice,
    low_24h: fallbackPrice,
    source_url: "https://www.binance.com/en/trade/USDT_BRL",
  };
}

async function fetchBybit() {
  const hosts = ["api.bybit.com", "api.bytick.com", "api.bybitglobal.com"];

  for (const host of hosts) {
    try {
      const payload = await fetchJson(`https://${host}/v5/market/tickers?category=spot&symbol=USDTBRL`);
      const data = Array.isArray(payload.result?.list) ? payload.result.list[0] ?? {} : {};
      const last = safeNumber(data.lastPrice);
      if (last > 0) {
        return {
          price_brl: last,
          bid_price_brl: safeNumber(data.bid1Price),
          ask_price_brl: safeNumber(data.ask1Price),
          volume_24h: safeNumber(data.turnover24h),
          change_24h: safeNumber(data.price24hPcnt) * 100,
          high_24h: safeNumber(data.highPrice24h),
          low_24h: safeNumber(data.lowPrice24h),
          source_url: "https://www.bybit.com/pt-BR/trade/spot/USDT/BRL",
        };
      }
    } catch {
      // Try next Bybit host.
    }
  }

  // Fallback: reference Bybit price via CryptoCompare when direct endpoints are blocked.
  const fallback = await fetchJson("https://min-api.cryptocompare.com/data/price?fsym=USDT&tsyms=BRL&e=Bybit");
  const fallbackPrice = safeNumber(fallback.BRL);
  if (fallbackPrice <= 0) {
    throw new Error("Bybit ticker indisponivel");
  }

  return {
    price_brl: fallbackPrice,
    volume_24h: 0,
    change_24h: 0,
    high_24h: fallbackPrice,
    low_24h: fallbackPrice,
    source_url: "https://www.bybit.com/pt-BR/trade/spot/USDT/BRL",
  };
}

async function fetchKucoin() {
  const [payload, level1] = await Promise.all([
    fetchJson("https://api.kucoin.com/api/v1/market/stats?symbol=USDT-BRL"),
    fetchJson("https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=USDT-BRL"),
  ]);
  const data = payload.data ?? {};
  const book = level1.data ?? {};
  return {
    price_brl: safeNumber(book.price) || safeNumber(data.last),
    bid_price_brl: safeNumber(book.bestBid) || safeNumber(data.buy),
    ask_price_brl: safeNumber(book.bestAsk) || safeNumber(data.sell),
    volume_24h: safeNumber(data.volValue),
    change_24h: safeNumber(data.changeRate) * 100,
    high_24h: safeNumber(data.high),
    low_24h: safeNumber(data.low),
    source_url: "https://www.kucoin.com/trade/USDT-BRL",
  };
}

async function fetchNovadax() {
  const payload = await fetchJson("https://api.novadax.com/v1/market/ticker?symbol=USDT_BRL");
  const data = payload.data ?? {};
  const last = safeNumber(data.lastPrice);
  const open = safeNumber(data.open24h) || last;
  const change = open > 0 ? ((last - open) / open) * 100 : 0;
  return {
    price_brl: last,
    bid_price_brl: safeNumber(data.bidPrice) || safeNumber(data.buy),
    ask_price_brl: safeNumber(data.askPrice) || safeNumber(data.sell),
    volume_24h: safeNumber(data.volume24h),
    change_24h: change,
    high_24h: safeNumber(data.high24h),
    low_24h: safeNumber(data.low24h),
    source_url: "https://novadax.com/pt-BR/trade/USDT-BRL",
  };
}

async function fetchMercadoBitcoin() {
  const payload = await fetchJson("https://www.mercadobitcoin.net/api/USDT/ticker/");
  const data = payload.ticker ?? {};
  const last = safeNumber(data.last);
  const open = safeNumber(data.open) || last;
  const change = open > 0 ? ((last - open) / open) * 100 : 0;
  return {
    price_brl: last,
    bid_price_brl: safeNumber(data.buy),
    ask_price_brl: safeNumber(data.sell),
    volume_24h: safeNumber(data.vol),
    change_24h: change,
    high_24h: safeNumber(data.high),
    low_24h: safeNumber(data.low),
    source_url: "https://www.mercadobitcoin.com.br/negociacoes/USDT",
  };
}

async function fetchBitget() {
  const payload = await fetchJson("https://api.bitget.com/api/v2/spot/market/tickers?symbol=USDTBRL");
  const data = Array.isArray(payload.data) ? payload.data[0] ?? {} : {};
  return {
    price_brl: safeNumber(data.lastPr),
    bid_price_brl: safeNumber(data.bidPr),
    ask_price_brl: safeNumber(data.askPr),
    volume_24h: safeNumber(data.quoteVolume),
    change_24h: (() => {
      const open = safeNumber(data.open);
      const last = safeNumber(data.lastPr);
      return open > 0 ? ((last - open) / open) * 100 : 0;
    })(),
    high_24h: safeNumber(data.high24h),
    low_24h: safeNumber(data.low24h),
    source_url: "https://www.bitget.com/spot/USDTBRL",
  };
}

async function fetchOkx() {
  const payload = await fetchJson("https://www.okx.com/api/v5/market/ticker?instId=USDT-BRL");
  const data = Array.isArray(payload.data) ? payload.data[0] ?? {} : {};
  return {
    price_brl: safeNumber(data.last),
    bid_price_brl: safeNumber(data.bidPx),
    ask_price_brl: safeNumber(data.askPx),
    volume_24h: safeNumber(data.volCcy24h),
    change_24h: (() => {
      const open = safeNumber(data.open24h);
      const last = safeNumber(data.last);
      return open > 0 ? ((last - open) / open) * 100 : 0;
    })(),
    high_24h: safeNumber(data.high24h),
    low_24h: safeNumber(data.low24h),
    source_url: "https://www.okx.com/trade-spot/usdt-brl",
  };
}

async function fetchBingx() {
  const [payload, bookPayload] = await Promise.all([
    fetchJson("https://open-api.bingx.com/openApi/spot/v1/ticker/price?symbol=USDT-BRL"),
    fetchJson("https://open-api.bingx.com/openApi/spot/v1/ticker/bookTicker?symbol=USDT-BRL").catch(
      () => ({ data: {} } as Record<string, any>)
    ),
  ]);

  if (safeNumber(payload.code) === 0) {
    const data = payload.data ?? {};
    const book = bookPayload.data ?? {};
    const price = safeNumber(data.price);
    if (price > 0) {
      return {
        price_brl: price,
        bid_price_brl: safeNumber(book.bidPrice),
        ask_price_brl: safeNumber(book.askPrice),
        volume_24h: 0,
        change_24h: 0,
        high_24h: price,
        low_24h: price,
        source_url: "https://bingx.com/pt-br/spot/USDTBRL",
      };
    }
  }

  // Fallback: usa USDC/USDT e converte USDT para BRL via USD/BRL.
  const stablePayload = await fetchJson("https://open-api.bingx.com/openApi/spot/v1/ticker/price?symbol=USDC-USDT");
  if (safeNumber(stablePayload.code) !== 0) {
    const msg = String(payload.msg ?? "BingX ticker indisponivel");
    throw new Error(msg);
  }

  const tradePrice = safeNumber(stablePayload.data?.[0]?.trades?.[0]?.price);
  if (tradePrice <= 0) {
    const fallbackFromPriceField = safeNumber(stablePayload.data?.[0]?.price);
    if (fallbackFromPriceField > 0) {
      const usdtUsd = 1 / fallbackFromPriceField;
      const usdBrl = await fetchUsdBrlRate();
      return buildUsdFallback(usdtUsd, usdBrl, "https://bingx.com/pt-br/spot/USDCUSDT", "USDC/USDT");
    }
  }

  if (tradePrice <= 0) {
    throw new Error("BingX ticker indisponivel");
  }

  const usdtUsd = 1 / tradePrice;
  const usdBrl = await fetchUsdBrlRate();

  return buildUsdFallback(usdtUsd, usdBrl, "https://bingx.com/pt-br/spot/USDCUSDT", "USDC/USDT");
}

async function fetchKraken() {
  try {
    const pairsPayload = await fetchJson("https://api.kraken.com/0/public/AssetPairs?pair=USDTBRL");
    if (Array.isArray(pairsPayload.error) && pairsPayload.error.length > 0) {
      throw new Error("Par USDT/BRL nao disponivel na Kraken");
    }

    const pairKey = Object.keys(pairsPayload.result ?? {})[0];
    if (!pairKey) {
      throw new Error("Par USDT/BRL nao disponivel na Kraken");
    }

    const tickerPayload = await fetchJson(`https://api.kraken.com/0/public/Ticker?pair=${pairKey}`);
    if (Array.isArray(tickerPayload.error) && tickerPayload.error.length > 0) {
      throw new Error("Par USDT/BRL nao disponivel na Kraken");
    }

    const ticker = tickerPayload.result?.[pairKey] ?? {};
    const price = safeNumber(Array.isArray(ticker.c) ? ticker.c[0] : 0);
    if (price <= 0) {
      throw new Error("Par USDT/BRL nao disponivel na Kraken");
    }

    const open = safeNumber(ticker.o);
    const baseVolume = safeNumber(Array.isArray(ticker.v) ? ticker.v[1] : 0);

    return {
      price_brl: price,
      bid_price_brl: safeNumber(Array.isArray(ticker.b) ? ticker.b[0] : 0),
      ask_price_brl: safeNumber(Array.isArray(ticker.a) ? ticker.a[0] : 0),
      volume_24h: baseVolume > 0 ? baseVolume * price : 0,
      change_24h: open > 0 ? ((price - open) / open) * 100 : 0,
      high_24h: safeNumber(Array.isArray(ticker.h) ? ticker.h[1] : 0),
      low_24h: safeNumber(Array.isArray(ticker.l) ? ticker.l[1] : 0),
      source_url: "https://pro.kraken.com/app/trade/usdt-brl",
    };
  } catch {
    const tickerPayload = await fetchJson("https://api.kraken.com/0/public/Ticker?pair=USDTUSD");
    if (Array.isArray(tickerPayload.error) && tickerPayload.error.length > 0) {
      throw new Error("Kraken ticker indisponivel");
    }

    const pairKey = Object.keys(tickerPayload.result ?? {})[0];
    const ticker = pairKey ? tickerPayload.result?.[pairKey] ?? {} : {};
    const usdtUsd = safeNumber(Array.isArray(ticker.c) ? ticker.c[0] : 0);
    if (usdtUsd <= 0) {
      throw new Error("Kraken ticker indisponivel");
    }

    const usdBrl = await fetchUsdBrlRate();
    const openUsd = safeNumber(ticker.o);
    const volumeUsdt = safeNumber(Array.isArray(ticker.v) ? ticker.v[1] : 0);
    const volumeUsd = volumeUsdt > 0 ? volumeUsdt * usdtUsd : 0;

    return buildUsdFallback(usdtUsd, usdBrl, "https://pro.kraken.com/app/trade/usdt-usd", "USDT/USD", {
      change_24h: openUsd > 0 ? ((usdtUsd - openUsd) / openUsd) * 100 : 0,
      high_usd: safeNumber(Array.isArray(ticker.h) ? ticker.h[1] : 0),
      low_usd: safeNumber(Array.isArray(ticker.l) ? ticker.l[1] : 0),
      volume_usd: volumeUsd,
    });
  }
}

async function fetchCoinbase() {
  let payload: Record<string, any>;
  try {
    payload = await fetchJson("https://api.exchange.coinbase.com/products/USDT-BRL/ticker");
  } catch (err) {
    const msg = String(err ?? "");
    if (!msg.includes("HTTP 404")) {
      throw err;
    }

    const usdPayload = await fetchJson("https://api.exchange.coinbase.com/products/USDT-USD/ticker");
    const usdtUsd = safeNumber(usdPayload.price);
    if (usdtUsd <= 0) {
      throw new Error("Coinbase ticker indisponivel");
    }

    const usdBrl = await fetchUsdBrlRate();
    const openUsd = safeNumber(usdPayload.open);
    const volumeUsdt = safeNumber(usdPayload.volume);
    const volumeUsd = volumeUsdt > 0 ? volumeUsdt * usdtUsd : 0;

    return buildUsdFallback(usdtUsd, usdBrl, "https://www.coinbase.com/advanced-trade/spot/USDT-USD", "USDT/USD", {
      change_24h: openUsd > 0 ? ((usdtUsd - openUsd) / openUsd) * 100 : 0,
      high_usd: safeNumber(usdPayload.high),
      low_usd: safeNumber(usdPayload.low),
      volume_usd: volumeUsd,
    });
  }

  const price = safeNumber(payload.price);
  if (price <= 0) {
    throw new Error("Par USDT/BRL nao disponivel na Coinbase");
  }

  const open = safeNumber(payload.open);
  const baseVolume = safeNumber(payload.volume);

  return {
    price_brl: price,
    bid_price_brl: safeNumber(payload.bid),
    ask_price_brl: safeNumber(payload.ask),
    volume_24h: baseVolume > 0 ? baseVolume * price : 0,
    change_24h: open > 0 ? ((price - open) / open) * 100 : 0,
    high_24h: safeNumber(payload.high),
    low_24h: safeNumber(payload.low),
    source_url: "https://www.coinbase.com/advanced-trade/spot/USDT-BRL",
  };
}

const EXCHANGES: ExchangeDef[] = [
  { key: "binance", label: "Binance", fetcher: fetchBinance },
  { key: "bybit", label: "Bybit", fetcher: fetchBybit },
  { key: "bingx", label: "BingX", fetcher: fetchBingx },
  { key: "kraken", label: "Kraken", fetcher: fetchKraken },
  { key: "coinbase", label: "Coinbase", fetcher: fetchCoinbase },
  { key: "bitget", label: "Bitget", fetcher: fetchBitget },
  { key: "okx", label: "OKX", fetcher: fetchOkx },
  { key: "kucoin", label: "KuCoin", fetcher: fetchKucoin },
  { key: "novadax", label: "Novadax", fetcher: fetchNovadax },
  { key: "mercadobitcoin", label: "Mercado Bitcoin", fetcher: fetchMercadoBitcoin },
];

function normalizeError(err: unknown): string {
  const msg = String(err ?? "Erro desconhecido");
  if (msg.includes("HTTP 451")) return "Indisponivel na regiao atual";
  if (msg.includes("HTTP 403")) return "Bloqueado para esta regiao";
  if (msg.toLowerCase().includes("timeout")) return "Timeout na consulta";
  return msg;
}

export async function GET() {
  const entries = await Promise.all(
    EXCHANGES.map(async ({ key, label, fetcher }) => {
      try {
        const data = await fetcher();
        return [
          key,
          {
            status: "ok",
            label,
            pair: "USDT/BRL",
            pricing_mode: data.pricing_mode ?? "direct",
            source_pair: data.source_pair,
            warning: data.warning,
            price_brl: Number((data.price_brl ?? 0).toFixed(4)),
            bid_price_brl: roundIfPositive(data.bid_price_brl),
            ask_price_brl: roundIfPositive(data.ask_price_brl),
            volume_24h: Number((data.volume_24h ?? 0).toFixed(4)),
            change_24h: Number((data.change_24h ?? 0).toFixed(4)),
            high_24h: Number((data.high_24h ?? 0).toFixed(4)),
            low_24h: Number((data.low_24h ?? 0).toFixed(4)),
            source_url: data.source_url,
          } satisfies ExchangeData,
        ] as const;
      } catch (err) {
        return [
          key,
          {
            status: "error",
            label,
            pair: "USDT/BRL",
            error: normalizeError(err),
          } satisfies ExchangeData,
        ] as const;
      }
    })
  );

  const exchanges = Object.fromEntries(entries) as PricesResponse["exchanges"];
  const okList = Object.values(exchanges).filter((e) => e.status === "ok" && e.price_brl && e.price_brl > 0);
  const prices = okList.map((e) => e.price_brl as number);

  let summary: Summary | null = null;
  if (prices.length > 0) {
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    summary = {
      min: Number(min.toFixed(4)),
      max: Number(max.toFixed(4)),
      avg: Number((prices.reduce((acc, n) => acc + n, 0) / prices.length).toFixed(4)),
      spread_pct: min > 0 ? Number((((max - min) / min) * 100).toFixed(4)) : 0,
      min_exchange: okList.find((e) => e.price_brl === min)?.label ?? "",
      max_exchange: okList.find((e) => e.price_brl === max)?.label ?? "",
    };
  }

  const payload: PricesResponse = {
    timestamp: new Date().toISOString(),
    ok_count: okList.length,
    total_count: entries.length,
    exchanges,
    summary,
  };

  return NextResponse.json(payload, { status: 200 });
}
