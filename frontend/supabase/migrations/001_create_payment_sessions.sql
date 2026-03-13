-- Migration 001: Create payment_sessions table
-- Run in Supabase SQL editor before any TypeScript implementation

create table payment_sessions (
  id              uuid primary key default gen_random_uuid(),
  session_id      text unique not null,
  status          text not null default 'PENDING',
  bridge_mode     text,
  merchant_wallet text,
  target_usdc     numeric,
  swap_params     jsonb,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- Index for frequent lookups by session_id
create index on payment_sessions (session_id);

-- Auto-update updated_at on row modification
create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger payment_sessions_updated_at
  before update on payment_sessions
  for each row execute function update_updated_at();
