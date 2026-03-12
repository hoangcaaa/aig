// =============================================================================
// /app/api/agent/execute/route.ts — SSE execution endpoint
//
// POST /api/agent/execute
// Body: { sessionId, swapTxHash, merchantWallet, targetUSDC }
// Response: Server-Sent Events stream
//
// Accepts customer's on-chain swap tx hash, then orchestrates the bridge
// path (CCTP or ADMIN_RELAY) and streams real-time status events.
//
// SSE events emitted: swap_executing → bridging → confirmed | bridge_delayed | error
// =============================================================================

import { NextRequest } from "next/server";
import { updateSessionStatus, type BridgeMode } from "@/lib/agent";
import {
  extractMessageHash,
  extractRawMessage,
  pollAttestation,
  receiveMessage,
} from "@/lib/cctp";
import { pollSwapCompleted, adminRelay } from "@/lib/mock-bridge";
import { awardPoints } from "@/lib/points";

const BRIDGE_MODE = (process.env.BRIDGE_MODE as BridgeMode) ?? "CCTP";

export async function POST(req: NextRequest) {
  const { sessionId, swapTxHash, merchantWallet, targetUSDC } = await req.json();

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const emit = async (event: string, data: object) => {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    await writer.write(encoder.encode(payload));
  };

  runPipeline({ sessionId, swapTxHash, merchantWallet, targetUSDC, emit, writer }).catch(
    async (err) => {
      await emit("error", { message: err instanceof Error ? err.message : String(err) });
      await writer.close();
    }
  );

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

async function runPipeline({
  sessionId,
  swapTxHash,
  merchantWallet,
  targetUSDC,
  emit,
  writer,
}: {
  sessionId: string;
  swapTxHash: string;
  merchantWallet: string;
  targetUSDC: number;
  emit: (event: string, data: object) => Promise<void>;
  writer: WritableStreamDefaultWriter;
}) {
  try {
    await updateSessionStatus(sessionId, "SWAP_EXECUTING", BRIDGE_MODE);
    await emit("swap_executing", { txHash: swapTxHash });

    await updateSessionStatus(sessionId, "BRIDGING");
    await emit("bridging", { mode: BRIDGE_MODE });

    if (BRIDGE_MODE === "CCTP") {
      // PRIMARY PATH: BSC burn → Circle attestation → Arc mint
      const [messageHash, rawMessage] = await Promise.all([
        extractMessageHash(swapTxHash),
        extractRawMessage(swapTxHash),
      ]);

      const attestation = await pollAttestation(messageHash, 120_000);
      const { txHash: arcTxHash } = await receiveMessage(rawMessage, attestation);

      await updateSessionStatus(sessionId, "CONFIRMED", "CCTP");
      await emit("confirmed", { txHash: arcTxHash, bridgeMode: "CCTP" });
    } else {
      // FALLBACK PATH: poll BSC SwapCompleted event → admin wallet relay on Arc
      const swapEvent = await pollSwapCompleted(sessionId, swapTxHash);

      if (!swapEvent) {
        await updateSessionStatus(sessionId, "BRIDGE_DELAYED");
        await emit("bridge_delayed", { reason: "SwapCompleted event not found within 30s" });
        return;
      }

      const { txHash: relayTxHash } = await adminRelay(
        merchantWallet,
        swapEvent.netUSDCAmount,
        sessionId
      );

      if (!relayTxHash) {
        // Idempotency guard fired — session already processed
        return;
      }

      await updateSessionStatus(sessionId, "CONFIRMED", "ADMIN_RELAY");
      await emit("confirmed", { txHash: relayTxHash, bridgeMode: "ADMIN_RELAY" });
    }

    // Award points after CONFIRMED
    // TODO: fetch merchantCreatedAt, isFirstChain, isReferred from DB in Phase 2
    await awardPoints(
      merchantWallet,
      sessionId,
      targetUSDC,
      new Date().toISOString(),
      false,
      false
    );
  } finally {
    await writer.close();
  }
}
