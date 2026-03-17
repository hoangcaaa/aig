# Phase 2: API — GET /api/dashboard

## Context
- [Phase 1 migration](./phase-01-schema-migration.md) must be applied first
- Existing pattern: `frontend/app/api/points/route.ts` (simple GET with wallet param)
- Supabase client singleton: `frontend/lib/agent.ts` → `getSupabaseClient()`

## Overview
- **Priority:** P1 (blocks Phase 3)
- **Status:** Complete
- Single API route returning merchant profile + analytics aggregates

## API Response Shape

```typescript
// GET /api/dashboard?wallet=0x...
interface DashboardResponse {
  merchant: {
    id: string;
    walletAddress: string;
    businessName: string | null;
    createdAt: string;
  };
  stats: {
    totalRevenue: number;       // sum of target_usdc where status=CONFIRMED
    transactionCount: number;   // count of CONFIRMED sessions
    successRate: number;        // CONFIRMED / (total - PENDING), 0-100
    recentVolume: number;       // sum of target_usdc CONFIRMED last 7 days
  };
}
```

## Key Insights
- Use Supabase RPC or direct queries — no need for a DB function (KISS)
- `getSupabaseClient()` in agent.ts is server-side only (uses service role key) — reuse it
- Export `getSupabaseClient()` from agent.ts (currently not exported but function exists)

## Implementation Steps

### 1. Export getSupabaseClient from agent.ts
- **File:** `frontend/lib/agent.ts`
- Change `function getSupabaseClient()` to `export function getSupabaseClient()`
- Already a singleton, safe to share

### 2. Create merchant lib
- **File to create:** `frontend/lib/merchant.ts`

```typescript
import { getSupabaseClient } from "./agent";

export interface MerchantProfile {
  id: string;
  walletAddress: string;
  businessName: string | null;
  createdAt: string;
}

/** Upsert merchant — returns existing or newly created row */
export async function upsertMerchant(walletAddress: string): Promise<MerchantProfile> {
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

export interface DashboardStats {
  totalRevenue: number;
  transactionCount: number;
  successRate: number;
  recentVolume: number;
}

/** Fetch analytics for a merchant wallet */
export async function getMerchantStats(walletAddress: string): Promise<DashboardStats> {
  const supabase = getSupabaseClient();
  const normalized = walletAddress.toLowerCase();

  // All sessions for this merchant (exclude PENDING for rate calc)
  const { data: allSessions, error } = await supabase
    .from("payment_sessions")
    .select("status, target_usdc, created_at")
    .eq("merchant_wallet", normalized);

  if (error) throw new Error(`getMerchantStats failed: ${error.message}`);

  const sessions = allSessions ?? [];
  const confirmed = sessions.filter((s) => s.status === "CONFIRMED");
  const nonPending = sessions.filter((s) => s.status !== "PENDING");

  const totalRevenue = confirmed.reduce((sum, s) => sum + (s.target_usdc ?? 0), 0);
  const transactionCount = confirmed.length;
  const successRate = nonPending.length > 0
    ? Math.round((confirmed.length / nonPending.length) * 100)
    : 0;

  // 7-day volume
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const recentVolume = confirmed
    .filter((s) => s.created_at >= sevenDaysAgo)
    .reduce((sum, s) => sum + (s.target_usdc ?? 0), 0);

  return { totalRevenue, transactionCount, successRate, recentVolume };
}
```

### 3. Create API route
- **File to create:** `frontend/app/api/dashboard/route.ts`

```typescript
import { NextRequest } from "next/server";
import { upsertMerchant, getMerchantStats } from "@/lib/merchant";

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet) {
    return Response.json({ error: "wallet query param required" }, { status: 400 });
  }

  try {
    const [merchant, stats] = await Promise.all([
      upsertMerchant(wallet),
      getMerchantStats(wallet),
    ]);

    return Response.json({ merchant, stats });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
```

## Files

| Action | Path |
|--------|------|
| Modify | `frontend/lib/agent.ts` (export getSupabaseClient) |
| Create | `frontend/lib/merchant.ts` |
| Create | `frontend/app/api/dashboard/route.ts` |

## Success Criteria
- [x] `GET /api/dashboard?wallet=0x...` returns 200 with merchant + stats
- [x] First call creates merchant row (upsert)
- [x] Subsequent calls return same merchant
- [x] Stats correctly aggregate CONFIRMED sessions
- [x] Missing wallet param returns 400

## Security Considerations
- Uses service role key (server-side only) — never exposed to client
- Wallet address normalized to lowercase to prevent duplicates
- No write operations beyond merchant upsert

## Risk Assessment
- **Medium** — `getSupabaseClient` export is a minor API surface change; no breaking consumers since it was internal-only
