"use client";

// =============================================================================
// qr-code-generator.tsx — QR code with 60s auto-refresh
// Encodes payment session data so customers can scan to open /pay/[id]
// PRD F-003: QR code generation
// =============================================================================

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

interface QRCodeGeneratorProps {
  merchantWallet: string;
  targetUSDC: number;
  baseUrl?: string; // defaults to window.location.origin
}

interface QRPayload {
  sessionId: string;
  merchantWallet: string;
  targetUSDC: number;
  expiry: number;
}

function generateSessionId(): string {
  // Random hex session ID (32 bytes)
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function QRCodeGenerator({ merchantWallet, targetUSDC, baseUrl }: QRCodeGeneratorProps) {
  const [payload, setPayload] = useState<QRPayload | null>(null);
  const [countdown, setCountdown] = useState(60);

  function refresh() {
    setPayload({
      sessionId: generateSessionId(),
      merchantWallet,
      targetUSDC,
      expiry: Math.floor(Date.now() / 1000) + 60,
    });
    setCountdown(60);
  }

  // Initial generation
  useEffect(() => {
    refresh();
  }, [merchantWallet, targetUSDC]);

  // Auto-refresh every 60s
  useEffect(() => {
    const interval = setInterval(refresh, 60_000);
    return () => clearInterval(interval);
  }, [merchantWallet, targetUSDC]);

  // Countdown ticker
  useEffect(() => {
    const tick = setInterval(() => setCountdown((n) => Math.max(0, n - 1)), 1_000);
    return () => clearInterval(tick);
  }, []);

  if (!payload) return null;

  const origin = typeof window !== "undefined" ? window.location.origin : (baseUrl ?? "");
  const payUrl = `${origin}/pay/${payload.sessionId}?merchant=${encodeURIComponent(merchantWallet)}&amount=${targetUSDC}`;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="bg-white p-4 rounded-2xl shadow-md">
        <QRCodeSVG value={payUrl} size={220} />
      </div>
      <p className="text-xs text-gray-500">
        Refreshes in <span className="font-semibold text-gray-700">{countdown}s</span>
      </p>
      <button
        onClick={refresh}
        className="text-xs text-blue-600 hover:underline"
      >
        Refresh now
      </button>
      <p className="text-xs text-gray-400 font-mono break-all text-center max-w-xs">
        Session: {payload.sessionId.slice(0, 16)}...
      </p>
    </div>
  );
}
