// =============================================================================
// /app/api/agent/quote/route.ts — Sync quote endpoint
//
// POST /api/agent/quote
// Body: { sessionId, merchantWallet, targetUSDC, customerWallet, sourceChain, sourceToken }
// Response: SwapParams JSON
//
// Calculates swap params off-chain, caches them to Supabase payment_sessions,
// and returns them as JSON. No SSE — sync response only.
// The cached swap_params allow /execute to skip recalculation.
// =============================================================================

import { NextRequest } from "next/server";
import { calculateSwapParams, updateSessionStatus, type AgentRequest } from "@/lib/agent";

export async function POST(req: NextRequest) {
  try {
    const body: AgentRequest = await req.json();
    const { sessionId, targetUSDC } = body;

    if (!sessionId || !targetUSDC) {
      return Response.json({ error: "sessionId and targetUSDC are required" }, { status: 400 });
    }

    const swapParams = await calculateSwapParams(targetUSDC);

    // Cache swap_params to Supabase so /execute can retrieve without recalculating
    await updateSessionStatus(sessionId, "PENDING", undefined, swapParams);

    return Response.json({
      amountInMaximumWei: swapParams.amountInMaximumWei.toString(),
      grossUSDCRequired: swapParams.grossUSDCRequired.toString(),
      aigServiceFee: swapParams.aigServiceFee.toString(),
      netUSDCToMerchant: swapParams.netUSDCToMerchant.toString(),
      poolFee: swapParams.poolFee,
      spotPriceUSDCPerBNB: swapParams.spotPriceUSDCPerBNB,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
