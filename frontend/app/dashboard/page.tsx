"use client";

// =============================================================================
// /app/dashboard/page.tsx — Merchant Dashboard, Pencil design
// Layout: Header | Metrics Row | (Recent Payments | QR + Points columns)
// Data: Supabase via /api/dashboard + /api/points, real-time feed in table
// =============================================================================

import { useState, useEffect } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { QRCodeGenerator } from "@/components/qr-code-generator";
import { PaymentFeedTable } from "@/components/payment-feed-table";
import { DashboardStatCards } from "@/components/dashboard-stat-cards";
import { PointsTierCard } from "@/components/points-tier-card";
import type { DashboardStats } from "@/lib/merchant";

interface PointsData {
  totalPoints: number;
  tier: string;
  lastActivity: string | null;
}

// Shared card style used for all content cards
const cardClass =
  "bg-white border border-[#CBCCC9] shadow-[0_1px_1.75px_0_#0000000d]";

export default function DashboardPage() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  const [mounted, setMounted] = useState(false);
  const [targetUSDC] = useState<number>(50);
  const [points, setPoints] = useState<PointsData | null>(null);
  const [dashStats, setDashStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Prevent hydration mismatch: wagmi state differs server vs client
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!address) return;

    fetch(`/api/points?wallet=${address}`)
      .then((r) => r.json())
      .then((data) => { if (!data.error) setPoints(data); })
      .catch(() => null);

    fetch(`/api/dashboard?wallet=${address}`)
      .then((r) => r.json())
      .then((data) => { if (!data.error) setDashStats(data.stats); })
      .catch(() => null)
      .finally(() => setStatsLoading(false));
  }, [address]);

  // SSR placeholder — render nothing until client hydrates
  if (!mounted) {
    return (
      <main className="min-h-screen bg-[#F2F3F0] flex items-center justify-center">
        <p className="text-[#666666] text-sm">Loading...</p>
      </main>
    );
  }

  // ── Not connected: wallet connect screen ─────────────────────────────────
  if (!isConnected) {
    return (
      <main className="min-h-screen bg-[#F2F3F0] flex flex-col items-center justify-center p-4">
        <div className="text-center flex flex-col items-center gap-4 max-w-sm w-full">
          <h1 className="font-[family-name:var(--font-jetbrains-mono)] text-[28px] font-semibold text-[#111111] tracking-[-1px]">
            Dashboard
          </h1>
          <p className="font-[family-name:var(--font-geist-sans)] text-sm text-[#666666]">
            Connect your wallet to access your merchant dashboard.
          </p>
          <button
            onClick={() => connect({ connector: injected() })}
            className="bg-[#FF8400] rounded-full h-10 px-6 font-[family-name:var(--font-jetbrains-mono)] text-sm font-medium text-[#111111] hover:opacity-90 transition-opacity"
          >
            Connect Wallet
          </button>
        </div>
      </main>
    );
  }

  // ── Connected: full Pencil layout ─────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[#F2F3F0]" style={{ padding: "32px 40px" }}>
      <div className="flex flex-col gap-7">

        {/* ── 1. Page Header ─────────────────────────────────────────────── */}
        <div className="flex flex-row items-center justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="font-[family-name:var(--font-jetbrains-mono)] text-[28px] font-semibold text-[#111111] tracking-[-1px] leading-none">
              Dashboard
            </h1>
            <p className="font-[family-name:var(--font-geist-sans)] text-sm text-[#666666]">
              Welcome back. Here&apos;s your payment overview.
            </p>
          </div>

          <div className="flex flex-row items-center gap-3">
            {/* Generate QR button */}
            <button className="bg-[#FF8400] rounded-full h-10 px-4 font-[family-name:var(--font-jetbrains-mono)] text-sm font-medium text-[#111111] hover:opacity-90 transition-opacity whitespace-nowrap">
              Generate QR
            </button>
            {/* Export button */}
            <button className="bg-[#F2F3F0] border border-[#CBCCC9] shadow-sm rounded-full h-10 px-4 font-[family-name:var(--font-jetbrains-mono)] text-sm font-medium text-[#111111] hover:bg-white transition-colors whitespace-nowrap">
              Export
            </button>
            {/* Disconnect (small secondary) */}
            <button
              onClick={() => disconnect()}
              className="font-[family-name:var(--font-geist-sans)] text-xs text-[#666666] hover:text-[#111111] transition-colors ml-2"
            >
              {address?.slice(0, 6)}&hellip;{address?.slice(-4)} &middot; Disconnect
            </button>
          </div>
        </div>

        {/* ── 2. Metrics Row ──────────────────────────────────────────────── */}
        <DashboardStatCards
          totalRevenue={dashStats?.totalRevenue ?? 0}
          transactionCount={dashStats?.transactionCount ?? 0}
          pointsBalance={points?.totalPoints ?? 0}
          tier={points?.tier ?? "Builder"}
          loading={statsLoading}
        />

        {/* ── 3. Content Columns ──────────────────────────────────────────── */}
        <div className="flex flex-row gap-6">

          {/* Left: Recent Payments table */}
          <div className={`flex-1 flex flex-col ${cardClass}`}>
            {/* Table header */}
            <div className="flex flex-row items-center justify-between px-6 py-4 border-b border-[#CBCCC9]">
              <span className="font-[family-name:var(--font-jetbrains-mono)] text-base font-semibold text-[#111111]">
                Recent Payments
              </span>
            </div>
            {/* Table body */}
            <PaymentFeedTable merchantWallet={address ?? ""} />
          </div>

          {/* Right column: QR card + Points card */}
          <div className="w-[340px] flex flex-col gap-6">

            {/* QR Code Card */}
            <div className={cardClass}>
              {/* QR card header */}
              <div className="flex flex-col gap-1 px-6 py-4 border-b border-[#CBCCC9]">
                <span className="font-[family-name:var(--font-jetbrains-mono)] text-base font-semibold text-[#111111]">
                  Payment QR Code
                </span>
                <span className="font-[family-name:var(--font-geist-sans)] text-xs text-[#666666]">
                  Share with customers to receive payments
                </span>
              </div>
              {/* QR card body */}
              <div className="px-6 py-6 flex flex-col items-center">
                {address && (
                  <QRCodeGenerator merchantWallet={address} targetUSDC={targetUSDC} />
                )}
              </div>
            </div>

            {/* Points & Tier Card */}
            <PointsTierCard
              totalPoints={points?.totalPoints ?? 0}
              tier={points?.tier ?? "Builder"}
            />
          </div>
        </div>

      </div>
    </main>
  );
}
