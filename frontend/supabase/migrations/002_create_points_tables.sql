-- Migration 002: Create points_ledger table and points_balance materialized view

create table points_ledger (
  id               uuid primary key default gen_random_uuid(),
  wallet           text not null,
  session_id       text not null,
  usd_volume       numeric not null,
  points_earned    numeric not null,
  multiplier       numeric not null default 1,
  multiplier_reason text,
  created_at       timestamptz default now()
);

create index on points_ledger (wallet);
create index on points_ledger (session_id);

-- Materialized view: wallet totals + tier computed from thresholds
-- Tiers: bronze < 1000, silver < 5000, gold < 20000, platinum >= 20000
create materialized view points_balance as
select
  wallet,
  sum(points_earned) as total_points,
  case
    when sum(points_earned) >= 20000 then 'platinum'
    when sum(points_earned) >= 5000  then 'gold'
    when sum(points_earned) >= 1000  then 'silver'
    else 'bronze'
  end as tier,
  max(created_at) as last_activity
from points_ledger
group by wallet;

create unique index on points_balance (wallet);

-- Refresh function — call after each points_ledger insert
create or replace function refresh_points_balance()
returns trigger as $$
begin
  refresh materialized view concurrently points_balance;
  return null;
end;
$$ language plpgsql;

create trigger points_ledger_refresh_balance
  after insert on points_ledger
  for each statement execute function refresh_points_balance();
