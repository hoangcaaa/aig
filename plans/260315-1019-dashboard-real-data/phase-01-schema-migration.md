# Phase 1: Schema Migration (003)

## Context
- Existing migrations: `frontend/supabase/migrations/001_create_payment_sessions.sql`, `002_create_points_tables.sql`
- `payment_sessions` has: id, session_id, status, bridge_mode, merchant_wallet, target_usdc, swap_params, created_at, updated_at

## Overview
- **Priority:** P1 (blocks Phase 2 and 3)
- **Status:** Complete
- Create `merchants` table and add `customer_wallet` to `payment_sessions`

## SQL Migration

**File to create:** `frontend/supabase/migrations/003_create_merchants_table.sql`

```sql
-- Migration 003: Merchants table + customer_wallet column

-- 1. Merchants table
create table merchants (
  id              uuid primary key default gen_random_uuid(),
  wallet_address  text unique not null,
  business_name   text,
  created_at      timestamptz default now()
);

create index on merchants (wallet_address);

-- 2. Add customer_wallet to payment_sessions (nullable — backfill not required)
alter table payment_sessions
  add column if not exists customer_wallet text;

create index on payment_sessions (merchant_wallet, status);
```

## Implementation Steps

1. Create `frontend/supabase/migrations/003_create_merchants_table.sql` with SQL above
2. Run migration in Supabase SQL editor (or `supabase db push`)
3. Verify: `SELECT * FROM merchants LIMIT 1;` should return empty set, no errors
4. Verify: `\d payment_sessions` shows `customer_wallet` column

## Files

| Action | Path |
|--------|------|
| Create | `frontend/supabase/migrations/003_create_merchants_table.sql` |

## Success Criteria
- [x] `merchants` table exists with columns: id, wallet_address, business_name, created_at
- [x] `wallet_address` has unique constraint
- [x] `payment_sessions.customer_wallet` column exists
- [x] Composite index on `(merchant_wallet, status)` for analytics queries

## Risk Assessment
- **Low risk** — additive schema change, no existing data affected
- `ALTER TABLE ADD COLUMN IF NOT EXISTS` is safe for re-runs
