// =============================================================================
// GET /api/dashboard?wallet=0x...
// Returns merchant profile (auto-created) + analytics stats
// =============================================================================

import { NextRequest } from "next/server";
import { upsertMerchant, getMerchantStats } from "@/lib/merchant";

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet) {
    return Response.json(
      { error: "wallet query param required" },
      { status: 400 }
    );
  }

  try {
    const [merchant, stats] = await Promise.all([
      upsertMerchant(wallet),
      getMerchantStats(wallet),
    ]);

    return Response.json({ merchant, stats });
  } catch (err) {
    console.error("[API /dashboard] Error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
