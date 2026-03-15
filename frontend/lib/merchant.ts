// =============================================================================
// merchant.ts — Merchant profile + dashboard analytics
// Imported by: /app/api/dashboard/route.ts
// =============================================================================

import "server-only";
import { getSupabaseClient } from "./agent";

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------
export interface MerchantProfile {
  id: string;
  walletAddress: string;
  businessName: string | null;
  createdAt: string;
}

export interface DashboardStats {
  totalRevenue: number;
  transactionCount: number;
  successRate: number;
  recentVolume: number;
}

// -------------------------------------------------------------------------
// Upsert merchant — creates on first visit, returns existing on subsequent
// -------------------------------------------------------------------------
export async function upsertMerchant(
  walletAddress: string
): Promise<MerchantProfile> {
  const supabase = getSupabaseClient();
  const normalized = walletAddress.toLowerCase();

  const { data, error } = await supabase
    .from("merchants")
    .upsert(
      { wallet_address: normalized },
      { onConflict: "wallet_address" }
    )
    .select("id, wallet_address, business_name, created_at")
    .single();

  if (error) throw new Error(`upsertMerchant failed: ${error.message}`);

  return {
    id: data.id,
    walletAddress: data.wallet_address,
    businessName: data.business_name,
    createdAt: data.created_at,
  };
}

// -------------------------------------------------------------------------
// Dashboard analytics — aggregates CONFIRMED payment_sessions
// -------------------------------------------------------------------------
export async function getMerchantStats(
  walletAddress: string
): Promise<DashboardStats> {
  const supabase = getSupabaseClient();
  const normalized = walletAddress.toLowerCase();

  // Fetch all sessions (override default 1000-row limit for large merchants)
  const { data: sessions, error } = await supabase
    .from("payment_sessions")
    .select("status, target_usdc, created_at")
    .eq("merchant_wallet", normalized)
    .limit(10000);

  if (error) throw new Error(`getMerchantStats failed: ${error.message}`);

  const rows = sessions ?? [];
  const confirmed = rows.filter((s) => s.status === "CONFIRMED");
  const nonPending = rows.filter((s) => s.status !== "PENDING");

  // Number() guards against Supabase returning numeric columns as strings
  const totalRevenue = confirmed.reduce(
    (sum, s) => sum + Number(s.target_usdc ?? 0),
    0
  );
  const transactionCount = confirmed.length;
  const successRate =
    nonPending.length > 0
      ? Math.round((confirmed.length / nonPending.length) * 100)
      : 0;

  // 7-day volume
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();
  const recentVolume = confirmed
    .filter((s) => s.created_at >= sevenDaysAgo)
    .reduce((sum, s) => sum + Number(s.target_usdc ?? 0), 0);

  return { totalRevenue, transactionCount, successRate, recentVolume };
}
