"use client";

// =============================================================================
// payment-feed-table.tsx — Real-time payment feed, Pencil design layout
// Columns: Source | Token | USDC Received | Status | Time
// Real-time Supabase subscription preserved from original implementation
// =============================================================================

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

interface PaymentRow {
  id: string;
  session_id: string;
  status: string;
  bridge_mode: string | null;
  target_usdc: number | null;
  created_at: string;
  updated_at: string;
}

interface PaymentFeedTableProps {
  merchantWallet: string;
}

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Relative time helper: "2 min ago", "1 hour ago", "3 days ago"
function relativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr !== 1 ? "s" : ""} ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
}

// Map bridge_mode → Source label
function sourceLabel(bridgeMode: string | null): string {
  if (!bridgeMode) return "BSC Testnet";
  return "BSC Testnet";
}

// Map bridge_mode → Token label
function tokenLabel(bridgeMode: string | null): string {
  if (bridgeMode === "CCTP") return "USDC";
  if (bridgeMode === "ADMIN_RELAY") return "tBNB";
  return "USDC";
}

// Status badge styling per Pencil design
const STATUS_STYLES: Record<string, string> = {
  CONFIRMED: "bg-[#DFE6E1] text-[#004D1A]",
  PENDING: "bg-[#FFF3E0] text-[#804200]",
  BRIDGING: "bg-[#E8EAF6] text-[#1A237E]",
  EXPIRED: "bg-[#F2F3F0] text-[#666666]",
  REFUNDED: "bg-[#FCE4EC] text-[#B71C1C]",
  SWAP_EXECUTING: "bg-[#E8EAF6] text-[#1A237E]",
  BRIDGE_DELAYED: "bg-[#FFF3E0] text-[#804200]",
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? "bg-[#F2F3F0] text-[#666666]";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-1 font-[family-name:var(--font-jetbrains-mono)] text-sm leading-none ${style}`}
    >
      {status}
    </span>
  );
}

// Column header cell
function ColHeader({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`px-3 py-3 font-[family-name:var(--font-jetbrains-mono)] text-xs font-semibold text-[#666666] tracking-wider uppercase ${className}`}
    >
      {children}
    </div>
  );
}

export function PaymentFeedTable({ merchantWallet }: PaymentFeedTableProps) {
  const [rows, setRows] = useState<PaymentRow[]>([]);

  useEffect(() => {
    if (!merchantWallet) return;
    const supabase = getSupabaseClient();

    // Initial load
    supabase
      .from("payment_sessions")
      .select("*")
      .eq("merchant_wallet", merchantWallet.toLowerCase())
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (data) setRows(data as PaymentRow[]);
      });

    // Real-time subscription
    const channel = supabase
      .channel("payment_sessions_feed")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "payment_sessions",
          filter: `merchant_wallet=eq.${merchantWallet.toLowerCase()}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setRows((prev) => [payload.new as PaymentRow, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setRows((prev) =>
              prev.map((r) => (r.id === payload.new.id ? (payload.new as PaymentRow) : r))
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [merchantWallet]);

  if (rows.length === 0) {
    return (
      <p className="font-[family-name:var(--font-geist-sans)] text-sm text-[#666666] text-center py-10">
        No payments yet. Share your QR code to receive your first payment.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      {/* Table header row */}
      <div className="flex flex-row bg-[#F2F3F0]">
        <ColHeader className="w-[140px]">Source</ColHeader>
        <ColHeader className="flex-1">Token</ColHeader>
        <ColHeader className="w-[140px]">USDC Received</ColHeader>
        <ColHeader className="w-[120px]">Status</ColHeader>
        <ColHeader className="w-[140px]">Time</ColHeader>
      </div>

      {/* Data rows */}
      {rows.map((row) => (
        <div
          key={row.id}
          className="flex flex-row border-b border-[#CBCCC9] hover:bg-[#F2F3F0]/50 transition-colors"
        >
          {/* Source */}
          <div className="w-[140px] px-3 py-3 font-[family-name:var(--font-geist-sans)] text-[13px] text-[#111111]">
            {sourceLabel(row.bridge_mode)}
          </div>
          {/* Token */}
          <div className="flex-1 px-3 py-3 font-[family-name:var(--font-geist-sans)] text-[13px] font-medium text-[#111111]">
            {tokenLabel(row.bridge_mode)}
          </div>
          {/* USDC Received */}
          <div className="w-[140px] px-3 py-3 font-[family-name:var(--font-jetbrains-mono)] text-[13px] font-medium text-[#111111]">
            {row.target_usdc != null
              ? `$${Number(row.target_usdc).toFixed(2)}`
              : "—"}
          </div>
          {/* Status */}
          <div className="w-[120px] px-3 py-3 flex items-center">
            <StatusBadge status={row.status} />
          </div>
          {/* Time */}
          <div className="w-[140px] px-3 py-3 font-[family-name:var(--font-geist-sans)] text-xs text-[#666666]">
            {relativeTime(row.updated_at)}
          </div>
        </div>
      ))}
    </div>
  );
}
