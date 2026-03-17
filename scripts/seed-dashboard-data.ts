// =============================================================================
// seed-dashboard-data.ts — Insert 1 merchant + 15 payment sessions for testing
// Usage: npx tsx scripts/seed-dashboard-data.ts
// Requires: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
// =============================================================================

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Load env from frontend/.env.local or frontend/.env (no dotenv dependency)
const __dirname2 = dirname(fileURLToPath(import.meta.url));
const envVars: Record<string, string> = {};
for (const name of [".env.local", ".env"]) {
  try {
    const content = readFileSync(resolve(__dirname2, "../frontend", name), "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const k = trimmed.slice(0, eqIdx);
      if (!envVars[k]) envVars[k] = trimmed.slice(eqIdx + 1);
    }
  } catch { /* file not found, skip */ }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || envVars.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || envVars.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in frontend/.env.local");
  process.exit(1);
}

const supabase = createClient(url, key);

// Helper: date offset from now
const ago = (hours: number) => new Date(Date.now() - hours * 3600_000).toISOString();

const MERCHANT_WALLET = "0xd3adb33f00000000000000000000000000001234";

async function seed() {
  // 1. Upsert merchant
  const { error: mErr } = await supabase
    .from("merchants")
    .upsert({ wallet_address: MERCHANT_WALLET, business_name: "ARC Coffee Shop" }, { onConflict: "wallet_address" });

  if (mErr) throw new Error(`Merchant upsert failed: ${mErr.message}`);
  console.log("Merchant upserted: ARC Coffee Shop");

  // 2. Insert 15 payment sessions
  const sessions = [
    // Today (3)
    { session_id: "pay_seed_001", status: "CONFIRMED",      bridge_mode: "CCTP",        target_usdc: 25.00,  customer_wallet: "0xaaaa000000000000000000000000000000000001", created_at: ago(2),    updated_at: ago(1.83) },
    { session_id: "pay_seed_002", status: "CONFIRMED",      bridge_mode: "ADMIN_RELAY", target_usdc: 150.00, customer_wallet: "0xaaaa000000000000000000000000000000000002", created_at: ago(4),    updated_at: ago(3.75) },
    { session_id: "pay_seed_003", status: "PENDING",         bridge_mode: "CCTP",        target_usdc: 10.50,  customer_wallet: "0xaaaa000000000000000000000000000000000003", created_at: ago(0.5),  updated_at: ago(0.5)  },
    // Yesterday (3)
    { session_id: "pay_seed_004", status: "CONFIRMED",      bridge_mode: "CCTP",        target_usdc: 42.00,  customer_wallet: "0xaaaa000000000000000000000000000000000004", created_at: ago(27),   updated_at: ago(26)   },
    { session_id: "pay_seed_005", status: "EXPIRED",         bridge_mode: "ADMIN_RELAY", target_usdc: 5.00,   customer_wallet: "0xaaaa000000000000000000000000000000000005", created_at: ago(30),   updated_at: ago(29)   },
    { session_id: "pay_seed_006", status: "CONFIRMED",      bridge_mode: "CCTP",        target_usdc: 88.50,  customer_wallet: "0xaaaa000000000000000000000000000000000006", created_at: ago(32),   updated_at: ago(31)   },
    // 3 days ago (2)
    { session_id: "pay_seed_007", status: "CONFIRMED",      bridge_mode: "ADMIN_RELAY", target_usdc: 200.00, customer_wallet: "0xaaaa000000000000000000000000000000000007", created_at: ago(73),   updated_at: ago(72)   },
    { session_id: "pay_seed_008", status: "REFUNDED",        bridge_mode: "CCTP",        target_usdc: 75.00,  customer_wallet: "0xaaaa000000000000000000000000000000000008", created_at: ago(76),   updated_at: ago(75)   },
    // 5 days ago (2)
    { session_id: "pay_seed_009", status: "CONFIRMED",      bridge_mode: "CCTP",        target_usdc: 30.00,  customer_wallet: "0xaaaa000000000000000000000000000000000009", created_at: ago(122),  updated_at: ago(121)  },
    { session_id: "pay_seed_010", status: "SWAP_EXECUTING",  bridge_mode: "ADMIN_RELAY", target_usdc: 12.75,  customer_wallet: "0xaaaa000000000000000000000000000000000010", created_at: ago(125),  updated_at: ago(124)  },
    // 7 days ago — edge of 7-day window (2)
    { session_id: "pay_seed_011", status: "CONFIRMED",      bridge_mode: "CCTP",        target_usdc: 60.00,  customer_wallet: "0xaaaa000000000000000000000000000000000011", created_at: ago(169),  updated_at: ago(168)  },
    { session_id: "pay_seed_012", status: "BRIDGING",        bridge_mode: "CCTP",        target_usdc: 99.99,  customer_wallet: "0xaaaa000000000000000000000000000000000012", created_at: ago(171),  updated_at: ago(170)  },
    // 8-10 days ago — outside 7-day window (3)
    { session_id: "pay_seed_013", status: "CONFIRMED",      bridge_mode: "ADMIN_RELAY", target_usdc: 500.00, customer_wallet: "0xaaaa000000000000000000000000000000000013", created_at: ago(192),  updated_at: ago(191)  },
    { session_id: "pay_seed_014", status: "CONFIRMED",      bridge_mode: "CCTP",        target_usdc: 15.00,  customer_wallet: "0xaaaa000000000000000000000000000000000014", created_at: ago(218),  updated_at: ago(217)  },
    { session_id: "pay_seed_015", status: "BRIDGE_DELAYED",  bridge_mode: "CCTP",        target_usdc: 45.00,  customer_wallet: "0xaaaa000000000000000000000000000000000015", created_at: ago(240),  updated_at: ago(238)  },
  ].map((s) => ({ ...s, merchant_wallet: MERCHANT_WALLET }));

  const { error: sErr, count } = await supabase
    .from("payment_sessions")
    .upsert(sessions, { onConflict: "session_id", count: "exact" });

  if (sErr) throw new Error(`Sessions upsert failed: ${sErr.message}`);
  console.log(`Payment sessions upserted: ${count ?? sessions.length} rows`);

  // 3. Verify
  const { data: verify } = await supabase
    .from("payment_sessions")
    .select("status")
    .eq("merchant_wallet", MERCHANT_WALLET);

  const confirmed = verify?.filter((r) => r.status === "CONFIRMED").length ?? 0;
  console.log(`\nVerification: ${verify?.length} total sessions, ${confirmed} confirmed`);
  console.log(`Merchant wallet for testing: ${MERCHANT_WALLET}`);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
