-- =============================================================================
-- Seed: 1 merchant + 15 realistic payment_sessions for dashboard testing
-- Merchant wallet: 0xd3ad...b33f (lowercase, consistent across all rows)
-- =============================================================================

-- 1. Merchant profile
INSERT INTO merchants (wallet_address, business_name)
VALUES ('0xd3adb33f00000000000000000000000000001234', 'ARC Coffee Shop')
ON CONFLICT (wallet_address) DO NOTHING;

-- 2. Payment sessions — spread across last 10 days, mixed statuses/amounts/bridges
INSERT INTO payment_sessions
  (session_id, status, bridge_mode, merchant_wallet, customer_wallet, target_usdc, created_at, updated_at)
VALUES
  -- Today: 3 transactions
  ('pay_seed_001', 'CONFIRMED',      'CCTP',        '0xd3adb33f00000000000000000000000000001234', '0xaaaa000000000000000000000000000000000001', 25.00,
    now() - interval '2 hours',   now() - interval '1 hour 50 minutes'),
  ('pay_seed_002', 'CONFIRMED',      'ADMIN_RELAY', '0xd3adb33f00000000000000000000000000001234', '0xaaaa000000000000000000000000000000000002', 150.00,
    now() - interval '4 hours',   now() - interval '3 hours 45 minutes'),
  ('pay_seed_003', 'PENDING',        'CCTP',        '0xd3adb33f00000000000000000000000000001234', '0xaaaa000000000000000000000000000000000003', 10.50,
    now() - interval '30 minutes', now() - interval '30 minutes'),

  -- Yesterday: 3 transactions
  ('pay_seed_004', 'CONFIRMED',      'CCTP',        '0xd3adb33f00000000000000000000000000001234', '0xaaaa000000000000000000000000000000000004', 42.00,
    now() - interval '1 day 3 hours',  now() - interval '1 day 2 hours'),
  ('pay_seed_005', 'EXPIRED',        'ADMIN_RELAY', '0xd3adb33f00000000000000000000000000001234', '0xaaaa000000000000000000000000000000000005', 5.00,
    now() - interval '1 day 6 hours',  now() - interval '1 day 5 hours'),
  ('pay_seed_006', 'CONFIRMED',      'CCTP',        '0xd3adb33f00000000000000000000000000001234', '0xaaaa000000000000000000000000000000000006', 88.50,
    now() - interval '1 day 8 hours',  now() - interval '1 day 7 hours'),

  -- 3 days ago: 2 transactions
  ('pay_seed_007', 'CONFIRMED',      'ADMIN_RELAY', '0xd3adb33f00000000000000000000000000001234', '0xaaaa000000000000000000000000000000000007', 200.00,
    now() - interval '3 days 1 hour',  now() - interval '3 days'),
  ('pay_seed_008', 'REFUNDED',       'CCTP',        '0xd3adb33f00000000000000000000000000001234', '0xaaaa000000000000000000000000000000000008', 75.00,
    now() - interval '3 days 4 hours', now() - interval '3 days 3 hours'),

  -- 5 days ago: 2 transactions
  ('pay_seed_009', 'CONFIRMED',      'CCTP',        '0xd3adb33f00000000000000000000000000001234', '0xaaaa000000000000000000000000000000000009', 30.00,
    now() - interval '5 days 2 hours', now() - interval '5 days 1 hour'),
  ('pay_seed_010', 'SWAP_EXECUTING', 'ADMIN_RELAY', '0xd3adb33f00000000000000000000000000001234', '0xaaaa000000000000000000000000000000000010', 12.75,
    now() - interval '5 days 5 hours', now() - interval '5 days 4 hours'),

  -- 7 days ago: 2 transactions (edge of 7-day window)
  ('pay_seed_011', 'CONFIRMED',      'CCTP',        '0xd3adb33f00000000000000000000000000001234', '0xaaaa000000000000000000000000000000000011', 60.00,
    now() - interval '7 days 1 hour',  now() - interval '7 days'),
  ('pay_seed_012', 'BRIDGING',       'CCTP',        '0xd3adb33f00000000000000000000000000001234', '0xaaaa000000000000000000000000000000000012', 99.99,
    now() - interval '7 days 3 hours', now() - interval '7 days 2 hours'),

  -- 8-10 days ago: 3 transactions (outside 7-day window)
  ('pay_seed_013', 'CONFIRMED',      'ADMIN_RELAY', '0xd3adb33f00000000000000000000000000001234', '0xaaaa000000000000000000000000000000000013', 500.00,
    now() - interval '8 days',   now() - interval '7 days 23 hours'),
  ('pay_seed_014', 'CONFIRMED',      'CCTP',        '0xd3adb33f00000000000000000000000000001234', '0xaaaa000000000000000000000000000000000014', 15.00,
    now() - interval '9 days 2 hours', now() - interval '9 days 1 hour'),
  ('pay_seed_015', 'BRIDGE_DELAYED', 'CCTP',        '0xd3adb33f00000000000000000000000000001234', '0xaaaa000000000000000000000000000000000015', 45.00,
    now() - interval '10 days',  now() - interval '9 days 22 hours')

ON CONFLICT (session_id) DO NOTHING;
