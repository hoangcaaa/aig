"use client";

// =============================================================================
// /app/dashboard/page.tsx — Merchant Dashboard
// PRD F-010: QR generator, real-time payment feed, points balance
//
// Minimum viable Phase 1: no auth — merchant identified by connected wallet.
// =============================================================================

import { useState, useEffect } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { QRCodeGenerator } from "@/components/qr-code-generator";
import { PaymentFeedTable } from "@/components/payment-feed-table";

interface PointsData {
  totalPoints: number;
  tier: string;
  lastActivity: string | null;
}

const TIER_COLORS: Record<string, string> = {
  Builder: "text-blue-600 bg-blue-50",
  Architect: "text-purple-600 bg-purple-50",
  Sovereign: "text-amber-600 bg-amber-50",
};

export default function DashboardPage() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  const [targetUSDC, setTargetUSDC] = useState<number>(10);
  const [points, setPoints] = useState<PointsData | null>(null);

  // Fetch points balance when wallet connects
  useEffect(() => {
    if (!address) return;
    fetch(`/api/points?wallet=${address}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) setPoints(data);
      })
      .catch(() => null);
  }, [address]);

  if (!isConnected) {
    return (
      <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-sm w-full">
          <h1 className="text-3xl font-bold text-gray-900">Merchant Dashboard</h1>
          <p className="text-gray-500">Connect your wallet to access your dashboard.</p>
          <button
            onClick={() => connect({ connector: injected() })}
            className="w-full bg-gray-900 hover:bg-gray-800 text-white font-semibold py-3 px-4 rounded-xl transition-colors"
          >
            Connect Wallet
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Merchant Dashboard</h1>
            <p className="text-sm text-gray-500 font-mono mt-0.5">
              {address?.slice(0, 6)}…{address?.slice(-4)}
            </p>
          </div>
          <button
            onClick={() => disconnect()}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Disconnect
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* QR Generator */}
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-2">Accept Payment</h2>
            <div className="flex items-center gap-2 mb-4">
              <label className="text-sm text-gray-600">Amount (USDC):</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={targetUSDC}
                onChange={(e) => setTargetUSDC(parseFloat(e.target.value) || 0)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {targetUSDC > 0 && address && (
              <QRCodeGenerator merchantWallet={address} targetUSDC={targetUSDC} />
            )}
          </div>

          {/* Points */}
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">ARC Points</h2>
            {points ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600 text-sm">Total Points</span>
                  <span className="text-2xl font-bold text-gray-900">
                    {points.totalPoints.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600 text-sm">Tier</span>
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-semibold ${
                      TIER_COLORS[points.tier] ?? "text-gray-600 bg-gray-50"
                    }`}
                  >
                    {points.tier}
                  </span>
                </div>
                {points.lastActivity && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 text-sm">Last Activity</span>
                    <span className="text-sm text-gray-500">
                      {new Date(points.lastActivity).toLocaleDateString()}
                    </span>
                  </div>
                )}
                <div className="mt-3 bg-gray-50 rounded-xl p-3 text-xs text-gray-500">
                  Builder → Architect: 500 pts · Architect → Sovereign: 5,000 pts
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">Loading points...</p>
            )}
          </div>
        </div>

        {/* Payment Feed */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Payment History</h2>
          <PaymentFeedTable merchantWallet={address ?? ""} />
        </div>
      </div>
    </main>
  );
}
