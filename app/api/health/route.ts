import { NextResponse } from "next/server";

export const runtime = "nodejs";

const TIMEOUT_MS = 6000;

type HealthCheck = {
  name: string;
  url: string;
  ok: boolean;
  status?: number;
  latency_ms: number;
  error?: string;
};

async function fetchJson(url: string): Promise<{ status: number; body: Record<string, any> }> {
  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      accept: "application/json",
      "user-agent": "usdtbot-health/1.0",
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

function hasFinitePositive(value: unknown): boolean {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

async function runCheck(
  name: string,
  url: string,
  validate: (payload: Record<string, any>) => boolean
): Promise<HealthCheck> {
  const start = Date.now();

  try {
    const { status, body } = await fetchJson(url);
    const valid = validate(body);
    return {
      name,
      url,
      ok: valid,
      status,
      latency_ms: Date.now() - start,
      error: valid ? undefined : "Resposta invalida",
    };
  } catch (err) {
    return {
      name,
      url,
      ok: false,
      latency_ms: Date.now() - start,
      error: String(err ?? "Erro desconhecido"),
    };
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const deep = url.searchParams.get("deep") === "1";

  const baseChecks: Array<Promise<HealthCheck>> = [
    runCheck(
      "usd_brl_frankfurter",
      "https://api.frankfurter.app/latest?from=USD&to=BRL",
      (p) => hasFinitePositive(p?.rates?.BRL)
    ),
    runCheck(
      "mercado_bitcoin_usdt_brl",
      "https://www.mercadobitcoin.net/api/USDT/ticker/",
      (p) => hasFinitePositive(p?.ticker?.last)
    ),
    runCheck(
      "binance_usdt_brl",
      "https://api.binance.com/api/v3/ticker/24hr?symbol=USDTBRL",
      (p) => hasFinitePositive(p?.lastPrice)
    ),
  ];

  const deepChecks: Array<Promise<HealthCheck>> = deep
    ? [
        runCheck(
          "novadax_usdt_brl",
          "https://api.novadax.com/v1/market/ticker?symbol=USDT_BRL",
          (p) => hasFinitePositive(p?.data?.lastPrice)
        ),
        runCheck(
          "gate_btc_usdt",
          "https://api.gateio.ws/api/v4/spot/tickers?currency_pair=BTC_USDT",
          (p) => Array.isArray(p) && p.length > 0 && hasFinitePositive((p[0] ?? {}).last)
        ),
      ]
    : [];

  const checks = await Promise.all([...baseChecks, ...deepChecks]);
  const okCount = checks.filter((c) => c.ok).length;
  const failCount = checks.length - okCount;

  const status: "ok" | "degraded" | "down" =
    okCount === checks.length ? "ok" : okCount > 0 ? "degraded" : "down";

  return NextResponse.json({
    status,
    ts: new Date().toISOString(),
    summary: {
      total: checks.length,
      ok: okCount,
      failed: failCount,
      deep_mode: deep,
    },
    checks,
  });
}
