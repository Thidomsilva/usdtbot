import { NextResponse } from "next/server";
import type { ExchangeData, PricesResponse, Summary } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 8000;

type Fetcher = () => Promise<Omit<ExchangeData, "status" | "label" | "pair">>;

type ExchangeDef = {
  key: string;
  label: string;
  fetcher: Fetcher;
};

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

async function fetchBinance() {
  const hosts = ["api.binance.com", "api1.binance.com", "api2.binance.com", "api3.binance.com"];

  for (const host of hosts) {
    try {
      const data = await fetchJson(`https://${host}/api/v3/ticker/24hr?symbol=USDTBRL`);
      const price = safeNumber(data.lastPrice);
      if (price > 0) {
        return {
          price_brl: price,
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
  const payload = await fetchJson("https://api.kucoin.com/api/v1/market/stats?symbol=USDT-BRL");
  const data = payload.data ?? {};
  return {
    price_brl: safeNumber(data.last),
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
  const payload = await fetchJson("https://open-api.bingx.com/openApi/spot/v1/ticker/price?symbol=USDT-BRL");

  if (safeNumber(payload.code) !== 0) {
    const msg = String(payload.msg ?? "BingX ticker indisponivel");
    if (msg.toLowerCase().includes("symbol is not found")) {
      throw new Error("Par USDT/BRL nao disponivel na BingX");
    }
    throw new Error(msg);
  }

  const data = payload.data ?? {};
  const price = safeNumber(data.price);
  if (price <= 0) {
    throw new Error("Par USDT/BRL nao disponivel na BingX");
  }

  return {
    price_brl: price,
    volume_24h: 0,
    change_24h: 0,
    high_24h: price,
    low_24h: price,
    source_url: "https://bingx.com/pt-br/spot/USDTBRL",
  };
}

async function fetchKraken() {
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
    volume_24h: baseVolume > 0 ? baseVolume * price : 0,
    change_24h: open > 0 ? ((price - open) / open) * 100 : 0,
    high_24h: safeNumber(Array.isArray(ticker.h) ? ticker.h[1] : 0),
    low_24h: safeNumber(Array.isArray(ticker.l) ? ticker.l[1] : 0),
    source_url: "https://pro.kraken.com/app/trade/usdt-brl",
  };
}

async function fetchCoinbase() {
  let payload: Record<string, any>;
  try {
    payload = await fetchJson("https://api.exchange.coinbase.com/products/USDT-BRL/ticker");
  } catch (err) {
    const msg = String(err ?? "");
    if (msg.includes("HTTP 404")) {
      throw new Error("Par USDT/BRL nao disponivel na Coinbase");
    }
    throw err;
  }

  const price = safeNumber(payload.price);
  if (price <= 0) {
    throw new Error("Par USDT/BRL nao disponivel na Coinbase");
  }

  const open = safeNumber(payload.open);
  const baseVolume = safeNumber(payload.volume);

  return {
    price_brl: price,
    volume_24h: baseVolume > 0 ? baseVolume * price : 0,
    change_24h: open > 0 ? ((price - open) / open) * 100 : 0,
    high_24h: safeNumber(payload.high),
    low_24h: safeNumber(payload.low),
    source_url: "https://www.coinbase.com/advanced-trade/spot/USDT-BRL",
  };
}

async function fetchBitmart() {
  const payload = await fetchJson("https://api-cloud.bitmart.com/spot/v1/ticker?symbol=USDT_BRL");
  if (safeNumber(payload.code) !== 1000) {
    const msg = String(payload.msg ?? "Bitmart ticker indisponivel");
    if (msg.toLowerCase().includes("symbol not found")) {
      throw new Error("Par USDT/BRL nao disponivel na Bitmart");
    }
    throw new Error(msg);
  }

  const ticker = payload.data?.tickers?.[0] ?? {};
  const price = safeNumber(ticker.last_price);
  if (price <= 0) {
    throw new Error("Par USDT/BRL nao disponivel na Bitmart");
  }

  const open = safeNumber(ticker.open_24h);

  return {
    price_brl: price,
    volume_24h: safeNumber(ticker.quote_volume_24h),
    change_24h: open > 0 ? ((price - open) / open) * 100 : 0,
    high_24h: safeNumber(ticker.high_24h),
    low_24h: safeNumber(ticker.low_24h),
    source_url: "https://www.bitmart.com/trade/pt-BR?symbol=USDT_BRL",
  };
}

const EXCHANGES: ExchangeDef[] = [
  { key: "binance", label: "Binance", fetcher: fetchBinance },
  { key: "bybit", label: "Bybit", fetcher: fetchBybit },
  { key: "bingx", label: "BingX", fetcher: fetchBingx },
  { key: "kraken", label: "Kraken", fetcher: fetchKraken },
  { key: "coinbase", label: "Coinbase", fetcher: fetchCoinbase },
  { key: "bitmart", label: "Bitmart", fetcher: fetchBitmart },
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
            price_brl: Number((data.price_brl ?? 0).toFixed(4)),
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
    total_count: EXCHANGES.length,
    exchanges,
    summary,
  };

  return NextResponse.json(payload, { status: 200 });
}
