-- Migration 003: Merchants table + customer_wallet column on payment_sessions

-- 1. Merchants table — auto-registered on first dashboard visit
create table merchants (
  id              uuid primary key default gen_random_uuid(),
  wallet_address  text unique not null,
  business_name   text,
  created_at      timestamptz default now()
);

create index on merchants (wallet_address);

-- 2. Add customer_wallet to payment_sessions (nullable — no backfill needed)
alter table payment_sessions
  add column if not exists customer_wallet text;

-- 3. Composite index for dashboard analytics queries
create index on payment_sessions (merchant_wallet, status);
