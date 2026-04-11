import { NextRequest, NextResponse } from "next/server";
import type { P2PArbitrageOpportunity, P2PArbitrageResponse, P2POffer } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 15_000;
const MAX_RAW_OFFERS = 20;
const MAX_OPPORTUNITIES = 20;

const cache = new Map<string, { expiresAt: number; payload: P2PArbitrageResponse }>();

type BinanceTradeMethod = {
  tradeMethodName?: string;
};

type BinanceAdv = {
  advNo?: string;
  price?: string;
  surplusAmount?: string;
  minSingleTransAmount?: string;
  maxSingleTransAmount?: string;
  tradeMethods?: BinanceTradeMethod[];
};

type BinanceAdvertiser = {
  nickName?: string;
  monthOrderCount?: string;
  monthFinishRate?: string;
};

type BinanceRow = {
  adv?: BinanceAdv;
  advertiser?: BinanceAdvertiser;
};

type BinanceResponse = {
  code?: string;
  message?: string;
  data?: BinanceRow[];
};

function safeNumber(value: unknown): number {
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

async function postBinanceP2P(tradeType: "BUY" | "SELL"): Promise<BinanceResponse> {
  const res = await fetch("https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search", {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": "usdtbot-p2p-monitor/1.0",
    },
    body: JSON.stringify({
      page: 1,
      rows: MAX_RAW_OFFERS,
      payTypes: [],
      publisherType: null,
      asset: "USDT",
      fiat: "BRL",
      tradeType,
    }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  return (await res.json()) as BinanceResponse;
}

function toOffer(row: BinanceRow, side: "buy" | "sell"): P2POffer | null {
  const adv = row.adv ?? {};
  const advertiser = row.advertiser ?? {};
  const price = safeNumber(adv.price);
  const availableUsdt = safeNumber(adv.surplusAmount);
  const minOrderBrl = safeNumber(adv.minSingleTransAmount);
  const maxOrderBrl = safeNumber(adv.maxSingleTransAmount);

  if (price <= 0 || availableUsdt <= 0) {
    return null;
  }

  const paymentMethods = (adv.tradeMethods ?? [])
    .map((method) => String(method.tradeMethodName ?? "").trim())
    .filter(Boolean);

  return {
    id: String(adv.advNo ?? `${side}-${advertiser.nickName ?? "anon"}-${price}`),
    side,
    price_brl: Number(price.toFixed(4)),
    available_usdt: Number(availableUsdt.toFixed(4)),
    min_order_brl: Number(minOrderBrl.toFixed(2)),
    max_order_brl: Number(maxOrderBrl.toFixed(2)),
    seller_name: String(advertiser.nickName ?? "Anuncio sem nome"),
    month_orders: safeNumber(advertiser.monthOrderCount),
    month_finish_rate: safeNumber(advertiser.monthFinishRate),
    payment_methods: paymentMethods,
  };
}

function buildOpportunities(buyOffers: P2POffer[], sellOffers: P2POffer[]): P2PArbitrageOpportunity[] {
  const opportunities: P2PArbitrageOpportunity[] = [];

  for (const buy of buyOffers.slice(0, 10)) {
    for (const sell of sellOffers.slice(0, 10)) {
      if (buy.id === sell.id) continue;

      const grossSpreadPct = ((sell.price_brl - buy.price_brl) / buy.price_brl) * 100;
      const grossSpreadBrlPer1000 = (1000 / buy.price_brl) * (sell.price_brl - buy.price_brl);

      const minAmount = Math.max(buy.min_order_brl, sell.min_order_brl);
      const maxAmount = Math.min(buy.max_order_brl, sell.max_order_brl);
      const executable = maxAmount > 0 && maxAmount >= minAmount;

      opportunities.push({
        buy_offer_id: buy.id,
        sell_offer_id: sell.id,
        buy_price_brl: buy.price_brl,
        sell_price_brl: sell.price_brl,
        gross_spread_pct: Number(grossSpreadPct.toFixed(4)),
        gross_spread_brl_per_1000: Number(grossSpreadBrlPer1000.toFixed(4)),
        est_liquidity_usdt: Number(Math.min(buy.available_usdt, sell.available_usdt).toFixed(4)),
        executable,
        executable_min_brl: Number(minAmount.toFixed(2)),
        executable_max_brl: Number(maxAmount.toFixed(2)),
        buy_seller: buy.seller_name,
        sell_buyer: sell.seller_name,
        buy_payment_methods: buy.payment_methods,
        sell_payment_methods: sell.payment_methods,
      });
    }
  }

  return opportunities
    .sort((a, b) => b.gross_spread_pct - a.gross_spread_pct)
    .slice(0, MAX_OPPORTUNITIES);
}

function parsePositiveNumber(value: string | null, fallback: number): number {
  const num = safeNumber(value);
  if (num <= 0) return fallback;
  return num;
}

function ensureBinanceSuccess(payload: BinanceResponse, side: "BUY" | "SELL") {
  if (payload.code && payload.code !== "000000") {
    throw new Error(`Binance P2P ${side} falhou: ${payload.code} ${payload.message ?? ""}`.trim());
  }
}

export async function GET(request: NextRequest) {
  const now = Date.now();
  const amountBrl = parsePositiveNumber(request.nextUrl.searchParams.get("amount_brl"), 1000);
  const safetyBufferPct = parsePositiveNumber(request.nextUrl.searchParams.get("safety_buffer_pct"), 0.2);
  const cacheKey = `${amountBrl.toFixed(2)}|${safetyBufferPct.toFixed(4)}`;
  const cacheHit = cache.get(cacheKey);

  if (cacheHit && cacheHit.expiresAt > now) {
    return NextResponse.json(cacheHit.payload, { status: 200 });
  }

  try {
    const [buyPayload, sellPayload] = await Promise.all([postBinanceP2P("BUY"), postBinanceP2P("SELL")]);
    ensureBinanceSuccess(buyPayload, "BUY");
    ensureBinanceSuccess(sellPayload, "SELL");

    const rawBuyRows = Array.isArray(buyPayload.data) ? buyPayload.data : [];
    const rawSellRows = Array.isArray(sellPayload.data) ? sellPayload.data : [];

    const buyOffers = rawBuyRows
      .map((row) => toOffer(row, "buy"))
      .filter((row): row is P2POffer => row !== null)
      .sort((a, b) => a.price_brl - b.price_brl);

    const sellOffers = rawSellRows
      .map((row) => toOffer(row, "sell"))
      .filter((row): row is P2POffer => row !== null)
      .sort((a, b) => b.price_brl - a.price_brl);

    const opportunities = buildOpportunities(buyOffers, sellOffers);
    const profitableCount = opportunities.filter((opp) => opp.gross_spread_pct > 0).length;
    const bestBuy = buyOffers[0] ?? null;
    const bestSell = sellOffers[0] ?? null;

    const grossSpreadPct =
      bestBuy && bestSell
        ? Number((((bestSell.price_brl - bestBuy.price_brl) / bestBuy.price_brl) * 100).toFixed(4))
        : 0;

    const bestNetForAmount = opportunities
      .filter((opp) => opp.executable && amountBrl >= opp.executable_min_brl && amountBrl <= opp.executable_max_brl)
      .map((opp) => {
        const usdt = amountBrl / opp.buy_price_brl;
        const gross = usdt * opp.sell_price_brl - amountBrl;
        const bufferCost = amountBrl * (safetyBufferPct / 100);
        const net = gross - bufferCost;
        return { opportunity: opp, net, netPct: (net / amountBrl) * 100 };
      })
      .sort((a, b) => b.net - a.net)[0] ?? null;

    const payload: P2PArbitrageResponse = {
      timestamp: new Date().toISOString(),
      source: "binance-p2p-usdt",
      fiat: "BRL",
      asset: "USDT",
      buy_offers: buyOffers,
      sell_offers: sellOffers,
      opportunities,
      summary: {
        api_connected: true,
        buy_count: buyOffers.length,
        sell_count: sellOffers.length,
        raw_buy_rows: rawBuyRows.length,
        raw_sell_rows: rawSellRows.length,
        opportunities_count: opportunities.length,
        profitable_count: profitableCount,
        best_buy_price_brl: bestBuy?.price_brl ?? null,
        best_sell_price_brl: bestSell?.price_brl ?? null,
        gross_spread_pct: grossSpreadPct,
        simulated_amount_brl: Number(amountBrl.toFixed(2)),
        simulated_safety_buffer_pct: Number(safetyBufferPct.toFixed(4)),
        best_net_opportunity: bestNetForAmount
          ? {
              buy_offer_id: bestNetForAmount.opportunity.buy_offer_id,
              sell_offer_id: bestNetForAmount.opportunity.sell_offer_id,
              est_net_profit_brl: Number(bestNetForAmount.net.toFixed(4)),
              est_net_profit_pct: Number(bestNetForAmount.netPct.toFixed(4)),
            }
          : null,
      },
      warning:
        rawBuyRows.length === 0 || rawSellRows.length === 0
          ? "API conectada, mas sem anuncios para este par/filtro neste momento."
          : "Estimativa para monitoramento. Considere risco de execucao, latencia, bloqueio de conta e limites dinamicos dos anuncios.",
    };

    cache.set(cacheKey, {
      expiresAt: now + CACHE_TTL_MS,
      payload,
    });

    return NextResponse.json(payload, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      {
        timestamp: new Date().toISOString(),
        source: "binance-p2p-usdt",
        fiat: "BRL",
        asset: "USDT",
        buy_offers: [],
        sell_offers: [],
        opportunities: [],
        summary: {
          api_connected: false,
          buy_count: 0,
          sell_count: 0,
          raw_buy_rows: 0,
          raw_sell_rows: 0,
          opportunities_count: 0,
          profitable_count: 0,
          best_buy_price_brl: null,
          best_sell_price_brl: null,
          gross_spread_pct: 0,
          simulated_amount_brl: 1000,
          simulated_safety_buffer_pct: 0.2,
          best_net_opportunity: null,
        },
        error: normalizeError(err),
      } satisfies P2PArbitrageResponse,
      { status: 500 }
    );
  }
}