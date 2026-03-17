"use client";

// =============================================================================
// qr-code-generator.tsx — QR code card body, Pencil design
// 180x180 QR placeholder, amount, session ID, expiry text
// 60s auto-refresh preserved from original implementation
// =============================================================================

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

interface QRCodeGeneratorProps {
  merchantWallet: string;
  targetUSDC: number;
  baseUrl?: string;
}

interface QRPayload {
  sessionId: string;
  merchantWallet: string;
  targetUSDC: number;
  expiry: number;
}

function generateSessionId(): string {
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

  useEffect(() => {
    refresh();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchantWallet, targetUSDC]);

  useEffect(() => {
    const interval = setInterval(refresh, 60_000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchantWallet, targetUSDC]);

  useEffect(() => {
    const tick = setInterval(() => setCountdown((n) => Math.max(0, n - 1)), 1_000);
    return () => clearInterval(tick);
  }, []);

  if (!payload) return null;

  const origin = typeof window !== "undefined" ? window.location.origin : (baseUrl ?? "");
  const payUrl = `${origin}/pay/${payload.sessionId}?merchant=${encodeURIComponent(merchantWallet)}&amount=${targetUSDC}`;

  // Use fixed format to avoid hydration mismatch (toLocaleTimeString differs server/client)
  const expiryDate = new Date(payload.expiry * 1000);
  const hh = String(expiryDate.getHours()).padStart(2, "0");
  const mm = String(expiryDate.getMinutes()).padStart(2, "0");
  const ss = String(expiryDate.getSeconds()).padStart(2, "0");
  const expiryStr = `${hh}:${mm}:${ss}`;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* QR code — 180x180 container matching Pencil spec */}
      <div className="w-[180px] h-[180px] bg-[#F2F3F0] border border-[#CBCCC9] rounded flex items-center justify-center">
        <QRCodeSVG value={payUrl} size={156} />
      </div>

      {/* Amount */}
      <p className="font-[family-name:var(--font-jetbrains-mono)] text-xl font-semibold text-[#111111] text-center">
        ${targetUSDC.toFixed(2)} USDC
      </p>

      {/* Session ID */}
      <p className="font-[family-name:var(--font-jetbrains-mono)] text-[11px] text-[#666666] text-center">
        {payload.sessionId.slice(0, 16)}...
      </p>

      {/* Expiry */}
      <p className="font-[family-name:var(--font-geist-sans)] text-[11px] text-[#666666] text-center">
        Expires at {expiryStr} &middot; {countdown}s remaining
      </p>

      {/* Refresh link */}
      <button
        onClick={refresh}
        className="font-[family-name:var(--font-geist-sans)] text-xs text-[#804200] hover:underline"
      >
        Refresh now
      </button>
    </div>
  );
}
