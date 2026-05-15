import { NextRequest, NextResponse } from "next/server";
import { scanUsdtInfinityOpportunities } from "@/lib/usdt-infinity";

export async function POST(req: NextRequest) {
  try {
    const { capital } = await req.json();
    const opportunities = await scanUsdtInfinityOpportunities({ capital });
    return NextResponse.json({ opportunities });
  } catch (err) {
    console.error("[USDT Infinity API] Erro:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
