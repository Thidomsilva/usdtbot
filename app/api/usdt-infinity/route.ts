import { NextRequest, NextResponse } from "next/server";
import { scanUsdtInfinityOpportunities } from "@/lib/usdt-infinity";

export async function POST(req: NextRequest) {
  const { capital } = await req.json();
  const opportunities = await scanUsdtInfinityOpportunities({ capital });
  return NextResponse.json({ opportunities });
}
