"use client";

// =============================================================================
// payment-feed-table.tsx — Real-time payment feed for merchant dashboard
// Subscribes to Supabase payment_sessions filtered by merchant wallet
// PRD F-010: payment feed
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

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    CONFIRMED: "bg-green-100 text-green-700",
    PENDING: "bg-yellow-100 text-yellow-700",
    SWAP_EXECUTING: "bg-blue-100 text-blue-700",
    BRIDGING: "bg-purple-100 text-purple-700",
    BRIDGE_DELAYED: "bg-orange-100 text-orange-700",
    EXPIRED: "bg-gray-100 text-gray-500",
    REFUNDED: "bg-red-100 text-red-600",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
        colors[status] ?? "bg-gray-100 text-gray-600"
      }`}
    >
      {status}
    </span>
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
      <p className="text-sm text-gray-400 text-center py-8">
        No payments yet. Share your QR code to receive your first payment.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead>
          <tr className="border-b border-gray-100 text-gray-500 text-xs uppercase">
            <th className="py-2 pr-4">Session</th>
            <th className="py-2 pr-4">Amount</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Bridge</th>
            <th className="py-2">Time</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-gray-50">
              <td className="py-2 pr-4 font-mono text-xs text-gray-500">
                {row.session_id.slice(0, 12)}...
              </td>
              <td className="py-2 pr-4 font-medium">
                {row.target_usdc != null ? `$${row.target_usdc.toFixed(2)}` : "—"}
              </td>
              <td className="py-2 pr-4">{statusBadge(row.status)}</td>
              <td className="py-2 pr-4 text-gray-500">{row.bridge_mode ?? "—"}</td>
              <td className="py-2 text-gray-400 text-xs">
                {new Date(row.updated_at).toLocaleTimeString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
