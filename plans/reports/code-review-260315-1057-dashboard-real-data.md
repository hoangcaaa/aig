# Code Review: Dashboard Real Data

**Date:** 2026-03-15
**Reviewer:** code-reviewer
**Focus:** SQL injection, error handling, type safety, security, code quality

---

## Scope
- **New files:** `003_create_merchants_table.sql`, `lib/merchant.ts`, `app/api/dashboard/route.ts`, `components/dashboard-stat-cards.tsx`
- **Modified files:** `lib/agent.ts` (exported `getSupabaseClient`), `app/dashboard/page.tsx` (integrated stat cards)
- **LOC changed:** ~200 (new) + ~30 (modified)

## Overall Assessment

Solid implementation. Clean separation between DB logic (`merchant.ts`), API route, and UI component. Supabase parameterized queries eliminate SQL injection risk. Several issues found, mostly **High** priority around security and performance.

---

## Critical Issues

### C-1: Unauthenticated dashboard API exposes any merchant's data

**File:** `frontend/app/api/dashboard/route.ts`

The `GET /api/dashboard?wallet=0x...` endpoint has no authentication. Anyone can query any wallet address and retrieve revenue, transaction count, success rate, and volume. The `upsertMerchant()` call also auto-creates merchant records for arbitrary wallets.

**Impact:** Information disclosure (OWASP A01 Broken Access Control). An attacker can enumerate merchant wallets and scrape analytics.

**Fix:** At minimum, require a signed message or session token proving wallet ownership. For Phase 1 MVP, consider rate limiting + requiring the request originate from a connected wallet session.

```typescript
// Minimum viable guard: verify wallet signature
const signature = req.nextUrl.searchParams.get("sig");
const message = req.nextUrl.searchParams.get("msg");
if (!signature || !message) {
  return Response.json({ error: "Authentication required" }, { status: 401 });
}
// Verify signature matches wallet using viem's verifyMessage
```

**Severity:** Critical (but acceptable risk if this is an internal-only testnet MVP with no real merchant data).

---

## High Priority

### H-1: `getMerchantStats()` fetches ALL sessions into memory for aggregation

**File:** `frontend/lib/merchant.ts:62-91`

The function loads every `payment_sessions` row for a merchant, then filters/aggregates in JS. For high-volume merchants this will degrade performance and increase memory usage.

**Impact:** O(n) memory growth per API call. Supabase also has default row limits (1000) which would silently truncate results, producing incorrect stats.

**Fix:** Use Supabase RPC or a Postgres view for aggregation:

```sql
-- Option A: Postgres function
create or replace function get_merchant_stats(p_wallet text)
returns json as $$
  select json_build_object(
    'totalRevenue', coalesce(sum(target_usdc) filter (where status = 'CONFIRMED'), 0),
    'transactionCount', count(*) filter (where status = 'CONFIRMED'),
    'successRate', case
      when count(*) filter (where status != 'PENDING') > 0
      then round(count(*) filter (where status = 'CONFIRMED')::numeric
           / count(*) filter (where status != 'PENDING') * 100)
      else 0 end,
    'recentVolume', coalesce(sum(target_usdc) filter (
      where status = 'CONFIRMED' and created_at >= now() - interval '7 days'), 0)
  ) from payment_sessions where merchant_wallet = p_wallet;
$$ language sql stable;
```

```typescript
// Then in merchant.ts:
const { data, error } = await supabase.rpc("get_merchant_stats", { p_wallet: normalized });
```

**Severity:** High. Silent data truncation at 1000 rows is a correctness bug.

### H-2: Duplicate `getSupabaseClient()` singletons across modules

**Files:** `lib/agent.ts:197`, `lib/mock-bridge.ts:214`, `lib/points.ts:120`, `components/payment-feed-table.tsx:26`

Four separate singleton implementations of `getSupabaseClient()` exist. `merchant.ts` imports from `agent.ts`, which is good, but the others are independent copies. This creates multiple Supabase client instances (wasted connections) and divergent behavior (payment-feed-table uses anon key; others use service role key).

**Fix:** Extract a shared `lib/supabase.ts` module:
- `getSupabaseServerClient()` (service role key, for server-side modules)
- `getSupabaseClient()` (anon key, for client components)

Import from this single source everywhere.

**Severity:** High (code smell + potential connection waste; also confusing which key is used where).

### H-3: `getSupabaseClient()` from `agent.ts` uses `SUPABASE_SERVICE_ROLE_KEY`

**File:** `lib/merchant.ts:6` importing from `lib/agent.ts:197-205`

`merchant.ts` inherits the service-role client. This is correct for server-side API routes, but the import path is misleading -- `merchant.ts` has nothing to do with the AI agent. If someone later imports `merchant.ts` in a client component, the service role key would be bundled.

**Impact:** Potential secret exposure if imported client-side.

**Fix:** Move to dedicated `lib/supabase.ts` (see H-2). Mark server-only modules with `import "server-only"` at top.

```typescript
// lib/merchant.ts — add at top
import "server-only";
```

**Severity:** High (latent security risk).

---

## Medium Priority

### M-1: `target_usdc` column is `numeric` but treated as `number` in TypeScript

**File:** `lib/merchant.ts:73-89`

Supabase returns `numeric` columns as strings (not numbers) to preserve precision. The `s.target_usdc ?? 0` arithmetic may concatenate strings instead of summing.

**Fix:** Parse explicitly:

```typescript
const totalRevenue = confirmed.reduce(
  (sum, s) => sum + Number(s.target_usdc ?? 0),
  0
);
```

Or define the column type in a Supabase generated types file.

**Severity:** Medium (could produce NaN or string concatenation in revenue calculations).

### M-2: `DashboardStats` interface duplicated between `merchant.ts` and `page.tsx`

**Files:** `lib/merchant.ts:18-23`, `app/dashboard/page.tsx:23-28`

Two identical `DashboardStats` interfaces. Violates DRY.

**Fix:** Import from `merchant.ts`:

```typescript
import type { DashboardStats } from "@/lib/merchant";
```

**Severity:** Medium (maintenance burden, risk of drift).

### M-3: ISO string comparison for 7-day volume filtering

**File:** `lib/merchant.ts:87-89`

```typescript
.filter((s) => s.created_at >= sevenDaysAgo)
```

ISO string comparison works for UTC timestamps but can break if Supabase returns timestamps with timezone offsets in non-standard formats. Safer to compare Date objects.

**Fix:**
```typescript
.filter((s) => new Date(s.created_at).getTime() >= Date.now() - 7 * 24 * 60 * 60 * 1000)
```

**Severity:** Medium (edge case with timezone representation).

### M-4: Missing `merchant_wallet` NOT NULL constraint and case normalization in migration

**File:** `frontend/supabase/migrations/001_create_payment_sessions.sql:9`

`merchant_wallet text` is nullable. Migration 003 adds an index on `(merchant_wallet, status)` but queries always filter by `merchant_wallet`. Nullable indexed columns can have unexpected behavior.

Also: no enforcement that `merchant_wallet` is stored lowercase. The app normalizes with `.toLowerCase()` but nothing prevents direct DB inserts with mixed case.

**Fix:** Consider a check constraint or trigger:
```sql
alter table payment_sessions
  add constraint merchant_wallet_lowercase
  check (merchant_wallet = lower(merchant_wallet));
```

**Severity:** Medium.

### M-5: No wallet address format validation

**File:** `app/api/dashboard/route.ts:10-16`

The endpoint accepts any string as `wallet`. No validation that it's a valid Ethereum address (0x + 40 hex chars). Malformed input flows through to Supabase queries and upsert.

**Fix:**
```typescript
const isValidAddress = /^0x[0-9a-fA-F]{40}$/.test(wallet);
if (!isValidAddress) {
  return Response.json({ error: "Invalid wallet address" }, { status: 400 });
}
```

**Severity:** Medium.

---

## Low Priority

### L-1: Error details leak to client in 500 response

**File:** `app/api/dashboard/route.ts:26`

`err.message` may contain internal details (table names, Supabase error codes). In production, return a generic message and log the real error server-side.

### L-2: `StatCardsProps` could import `DashboardStats` and extend it

**File:** `components/dashboard-stat-cards.tsx:8-14`

Minor type coupling improvement:
```typescript
interface StatCardsProps extends DashboardStats {
  loading: boolean;
}
```

### L-3: No loading skeleton for stat cards

**File:** `components/dashboard-stat-cards.tsx:48`

Currently shows "---" while loading. A shimmer/skeleton would be more polished but is cosmetic.

### L-4: `useEffect` missing error state for dashboard fetch

**File:** `app/dashboard/page.tsx:57-63`

Fetch errors are silently swallowed (`.catch(() => null)`). Consider setting an error state to show the user a retry option.

---

## Edge Cases Found by Scout

1. **Supabase default row limit (1000):** `getMerchantStats()` fetches all rows without `.range()`. Merchants with >1000 sessions get silently truncated stats. (Covered in H-1.)

2. **Race condition in parallel `upsertMerchant` + `getMerchantStats`:** If this is the merchant's first visit, `getMerchantStats` runs before the merchant row exists. This is fine because `getMerchantStats` queries `payment_sessions` not `merchants`, but if future code adds a merchants FK constraint, the parallel `Promise.all` will break.

3. **`payment-feed-table.tsx` uses anon key, `merchant.ts` uses service role key:** These are different privilege levels querying the same table. RLS policies must allow anon reads for the feed table to work. If RLS is later tightened for service-role-only access, the feed table breaks silently.

4. **Multiple Supabase client singletons (4 copies):** Module-level `let _supabase` singletons in different files create separate connection pools. In serverless (Vercel), each cold start creates up to 4 connections instead of 1.

---

## Positive Observations

- Clean file/module separation: migration, logic, route, component are each in their own file
- Wallet address normalization with `.toLowerCase()` applied consistently
- Proper `onConflict` upsert for idempotent merchant creation
- Supabase SDK parameterized queries -- no raw SQL injection vectors
- Good use of `Promise.all` for parallel data fetching in the API route
- Component uses data-driven `cards` array pattern -- easy to extend
- Error boundary in API route with proper HTTP status codes

---

## Recommended Actions (Priority Order)

1. **[Critical]** Add authentication to `/api/dashboard` -- at minimum wallet signature verification
2. **[High]** Move aggregation to Postgres (RPC function or view) to avoid row limit truncation
3. **[High]** Consolidate `getSupabaseClient()` into `lib/supabase.ts`; add `import "server-only"` to server modules
4. **[Medium]** Parse `target_usdc` as `Number()` explicitly to handle Supabase numeric-as-string
5. **[Medium]** Add wallet address format validation in the API route
6. **[Medium]** Deduplicate `DashboardStats` interface
7. **[Low]** Sanitize error messages in 500 responses
8. **[Low]** Add error state handling for dashboard fetch failures

---

## Metrics

| Metric | Value |
|--------|-------|
| Type Coverage | ~90% (interfaces defined, but no generated Supabase types) |
| Test Coverage | 0% (no tests for new code) |
| Linting Issues | Not run (no new syntax errors observed) |
| SQL Injection Risk | None (parameterized Supabase SDK) |
| Auth on new endpoint | Missing |

---

## Unresolved Questions

1. Is `/api/dashboard` intended to be publicly accessible in Phase 1 MVP, or should auth be added now?
2. Are Supabase RLS policies configured for `merchants` table? The migration does not include any RLS setup.
3. Should `getMerchantStats` include `REFUNDED` sessions in the success rate denominator? Currently `nonPending` includes EXPIRED and REFUNDED which inflates failure count.
