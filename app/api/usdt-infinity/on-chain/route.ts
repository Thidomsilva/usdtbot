import { NextRequest, NextResponse } from "next/server";
import { scanPolygonBrlStableMatrix } from "@/lib/polygon-brl-onchain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parsePositiveNumber(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: NextRequest) {
  try {
    const simulatedLotBrl = parsePositiveNumber(request.nextUrl.searchParams.get("lot_brl"), 1000);
    const thresholdPct = parsePositiveNumber(request.nextUrl.searchParams.get("threshold_pct"), 0.5);
    const payload = await scanPolygonBrlStableMatrix({ simulatedLotBrl, thresholdPct });
    return NextResponse.json(payload, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      {
        timestamp: new Date().toISOString(),
        rpcUrl: process.env.POLYGON_RPC_URL || "https://polygon-rpc.com",
        simulatedLotBrl: 1000,
        thresholdPct: 0.5,
        rows: [],
        summary: {
          pairsMonitored: 6,
          poolsFound: 0,
          alerts: 0,
          bestOpportunity: null,
        },
        error: String(err ?? "Falha ao consultar pools on-chain"),
      },
      { status: 500 }
    );
  }
}
