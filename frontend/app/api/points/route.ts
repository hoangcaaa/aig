// =============================================================================
// /app/api/points/route.ts — Points balance endpoint
//
// GET /api/points?wallet=0x...
// Response: { totalPoints, tier, lastActivity }
// =============================================================================

import { NextRequest } from "next/server";
import { getPointsBalance } from "@/lib/points";

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");

  if (!wallet) {
    return Response.json({ error: "wallet query param required" }, { status: 400 });
  }

  try {
    const result = await getPointsBalance(wallet);
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
