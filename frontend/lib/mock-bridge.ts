// =============================================================================
// mock-bridge.ts — Admin Relay fallback logic
// Activated ONLY when: BRIDGE_MODE=ADMIN_RELAY (Domain 7 smoke test FAIL)
//
// PRD Section 6.2 — Idempotency Rule (MANDATORY):
//   adminRelay() MUST check Supabase to confirm session status === 'PENDING'
//   before executing any transfer. Prevents double-spend from duplicate
//   blockchain events or network retries.
//
// WARNING: This module is PoC-only. MUST be disabled before mainnet deployment.
// =============================================================================

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  createPublicClient,
  createWalletClient,
  http,
  decodeEventLog,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bscTestnet } from "viem/chains";
import { getArcChain } from "./chains";

// Minimum admin wallet balance before operator warning is triggered
const MIN_ADMIN_BALANCE_USDC = 50_000_000n; // 50 USDC in 6-decimal units

// SwapCompleted event ABI — must match SwapRouter.sol exactly
const SWAP_COMPLETED_ABI = [
  {
    name: "SwapCompleted",
    type: "event",
    inputs: [
      { name: "sessionId", type: "bytes32", indexed: true },
      { name: "netUSDCAmount", type: "uint256", indexed: false },
      { name: "merchantWallet", type: "address", indexed: false },
    ],
  },
] as const;

// Minimal ERC-20 ABI fragments
const ERC20_BALANCE_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const ERC20_TRANSFER_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

// -------------------------------------------------------------------------
// pollSwapCompleted
//
// Waits for BSC Testnet tx receipt, then parses SwapCompleted event.
// Returns event data on success, null on timeout or event not found.
// -------------------------------------------------------------------------
export async function pollSwapCompleted(
  sessionId: string,
  txHash: string,
  timeoutMs = 30_000
): Promise<{ netUSDCAmount: bigint; merchantWallet: string } | null> {
  const client = createPublicClient({
    chain: bscTestnet,
    transport: http(process.env.BSC_TESTNET_RPC_URL),
  });

  let receipt;
  try {
    receipt = await client.waitForTransactionReceipt({
      hash: txHash as `0x${string}`,
      timeout: timeoutMs,
    });
  } catch {
    console.warn(`pollSwapCompleted: tx ${txHash} not confirmed within ${timeoutMs}ms`);
    return null;
  }

  const swapRouterAddress = (process.env.SWAP_ROUTER_ADDRESS_BSC ?? "").toLowerCase();

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== swapRouterAddress) continue;
    try {
      const decoded = decodeEventLog({
        abi: SWAP_COMPLETED_ABI,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "SwapCompleted") {
        return {
          netUSDCAmount: decoded.args.netUSDCAmount,
          merchantWallet: decoded.args.merchantWallet,
        };
      }
    } catch {
      // Not a SwapCompleted log — skip
    }
  }

  console.warn(`pollSwapCompleted: SwapCompleted event not found in tx ${txHash}`);
  return null;
}

// -------------------------------------------------------------------------
// adminRelay — IDEMPOTENT transfer from Admin Wallet to merchant on Arc Testnet
//
// CRITICAL: Must verify session is still PENDING in Supabase before executing.
// If session is any other status, ABORT immediately — do not transfer.
// -------------------------------------------------------------------------
export async function adminRelay(
  merchantWallet: string,
  usdcAmount: bigint,
  sessionId: string
): Promise<{ txHash: string }> {
  const supabase = getSupabaseClient();

  // ── ATOMIC IDEMPOTENCY GUARD ───────────────────────────────────────────
  // Single atomic UPDATE with status=PENDING condition. If 0 rows affected,
  // another caller already claimed this session — abort without transfer.
  const { data: updated, error: updateError } = await supabase
    .from("payment_sessions")
    .update({ status: "SWAP_EXECUTING", bridge_mode: "ADMIN_RELAY" })
    .eq("session_id", sessionId)
    .eq("status", "PENDING")
    .select("session_id");

  if (updateError) {
    throw new Error(`adminRelay: failed to lock session — ${updateError.message}`);
  }

  if (!updated || updated.length === 0) {
    console.warn(`adminRelay: session ${sessionId} not PENDING — aborting (idempotency guard)`);
    return { txHash: "" };
  }
  // ── END IDEMPOTENCY GUARD ─────────────────────────────────────────────

  // Pre-flight: warn if admin wallet balance is low
  await verifyAdminWalletBalance();

  // Execute ERC-20 transfer via admin wallet on Arc Testnet
  const pk = process.env.AIG_ADMIN_WALLET_PRIVATE_KEY;
  if (!pk || !pk.startsWith("0x") || pk.length !== 66) {
    throw new Error("adminRelay: AIG_ADMIN_WALLET_PRIVATE_KEY missing or malformed");
  }
  const account = privateKeyToAccount(pk as `0x${string}`);
  const arcChain = getArcChain();

  const walletClient = createWalletClient({
    account,
    chain: arcChain,
    transport: http(process.env.ARC_TESTNET_RPC_URL),
  });
  const publicClient = createPublicClient({
    chain: arcChain,
    transport: http(process.env.ARC_TESTNET_RPC_URL),
  });

  const txHash = await walletClient.writeContract({
    address: process.env.USDC_ADDRESS_ARC_TESTNET as `0x${string}`,
    abi: ERC20_TRANSFER_ABI,
    functionName: "transfer",
    args: [merchantWallet as `0x${string}`, usdcAmount],
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 30_000 });
  return { txHash };
}

// -------------------------------------------------------------------------
// verifyAdminWalletBalance
//
// Warns operator if Admin Wallet balance drops below 50 testUSDC.
// Called before every adminRelay() execution. Does NOT throw on low balance.
// -------------------------------------------------------------------------
export async function verifyAdminWalletBalance(): Promise<void> {
  const arcChain = getArcChain();
  const client = createPublicClient({
    chain: arcChain,
    transport: http(process.env.ARC_TESTNET_RPC_URL),
  });

  const balance = await client.readContract({
    address: process.env.USDC_ADDRESS_ARC_TESTNET as `0x${string}`,
    abi: ERC20_BALANCE_ABI,
    functionName: "balanceOf",
    args: [process.env.AIG_ADMIN_WALLET_ADDRESS as `0x${string}`],
  });

  if (balance < MIN_ADMIN_BALANCE_USDC) {
    console.warn(
      `⚠️  ADMIN WALLET LOW: ${Number(balance) / 1e6} USDC remaining. ` +
        `Top up ${process.env.AIG_ADMIN_WALLET_ADDRESS} on Arc Testnet.`
    );
  }
}

// -------------------------------------------------------------------------
// Internal Supabase client (singleton)
// -------------------------------------------------------------------------
let _supabase: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Supabase env vars not set");
    _supabase = createClient(url, key);
  }
  return _supabase;
}
