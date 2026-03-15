// =============================================================================
// agent.ts — AI Agent orchestration logic
// Imported by: /app/api/agent/quote/route.ts, /app/api/agent/execute/route.ts
//
// RULE: All spotPrice math and slippage calculations happen in this file.
//       The final integer amountInMaximum is passed to SwapRouter.sol.
//       Zero floating-point math in .sol files.
// =============================================================================

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createPublicClient, http } from "viem";
import { bscTestnet } from "viem/chains";

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------
export type BridgeMode = "CCTP" | "ADMIN_RELAY";

export type SessionStatus =
  | "PENDING"
  | "SWAP_EXECUTING"
  | "BRIDGING"
  | "CONFIRMED"
  | "EXPIRED"
  | "REFUNDED"
  | "BRIDGE_DELAYED";

export interface SwapParams {
  /** WBNB to spend (wei, integer) — passed as amountInMaximum to SwapRouter.sol */
  amountInMaximumWei: bigint;
  /** Target USDC output including AIG fee (6 decimals, integer) */
  grossUSDCRequired: bigint;
  /** AIG 0.1% service fee portion (6 decimals, integer) */
  aigServiceFee: bigint;
  /** Net USDC the merchant receives (6 decimals, integer) */
  netUSDCToMerchant: bigint;
  /** PancakeSwap V3 pool fee tier */
  poolFee: number;
  /** Spot price used for calculation (informational only — not sent to contract) */
  spotPriceUSDCPerBNB: number;
}

export interface AgentRequest {
  sessionId: string;
  merchantWallet: string;
  targetUSDC: number;
  customerWallet: string;
  sourceChain: string;
  sourceToken: string;
}

// PancakeSwap V3 QuoterV2 ABI — quoteExactOutputSingle only
const QUOTER_ABI = [
  {
    name: "quoteExactOutputSingle",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountIn", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

// -------------------------------------------------------------------------
// Off-chain price + slippage calculation (MUST stay here, NOT in Solidity)
//
// Formula (PRD F-001):
//   aigServiceFee     = targetUSDC * 0.001
//   grossUSDCRequired = targetUSDC + aigServiceFee
//   requiredTokenIn   = grossUSDCRequired / spotPrice / (1 - 0.005)
//
// All results are converted to integer wei / 6-decimal USDC before returning.
// -------------------------------------------------------------------------
export async function calculateSwapParams(
  targetUSDC: number // e.g. 100.00 = $100
): Promise<SwapParams> {
  // 1. Fetch current tBNB/USDC spot price from PancakeSwap V3 on-chain quoter
  const spotPriceUSDCPerBNB = await fetchSpotPrice();

  // 2. AIG fee: 0.1% of targetUSDC (charged to customer via gross-up)
  const aigServiceFeeFloat = targetUSDC * 0.001;
  const grossUSDCFloat = targetUSDC + aigServiceFeeFloat;

  // 3. Required BNB with 0.5% slippage buffer (off-chain only)
  const requiredBNBFloat = grossUSDCFloat / spotPriceUSDCPerBNB / (1 - 0.005);

  // 4. Convert to integers (no floats sent to contract)
  const grossUSDCRequired = BigInt(Math.ceil(grossUSDCFloat * 1_000_000));
  const aigServiceFee = BigInt(Math.ceil(aigServiceFeeFloat * 1_000_000));
  const netUSDCToMerchant = grossUSDCRequired - aigServiceFee;
  const amountInMaximumWei = BigInt(Math.ceil(requiredBNBFloat * 1e18));

  return {
    amountInMaximumWei,
    grossUSDCRequired,
    aigServiceFee,
    netUSDCToMerchant,
    poolFee: 500, // PancakeSwap V3 0.05% pool (tBNB/USDC)
    spotPriceUSDCPerBNB,
  };
}

// -------------------------------------------------------------------------
// Fetch spot price from PancakeSwap V3 QuoterV2 (BSC Testnet)
// Uses on-chain quoter — no aggregator APIs (PRD decision #5)
// Quoter: quoteExactOutputSingle — same call semantics as the real swap
// -------------------------------------------------------------------------
async function fetchSpotPrice(): Promise<number> {
  const quoterAddress = (
    process.env.PANCAKESWAP_V3_QUOTER_BSC ?? "0xbC203d7f83677c7ed3F7acEc959963E5051B27aE"
  ) as `0x${string}`;

  const client = createPublicClient({
    chain: bscTestnet,
    transport: http(process.env.BSC_TESTNET_RPC_URL),
  });

  // Quote: how much WBNB to buy exactly 1 USDC (1_000_000 = 1 USDC in 6 decimals)
  const SAMPLE_USDC = 1_000_000n;

  const result = await client.readContract({
    address: quoterAddress,
    abi: QUOTER_ABI,
    functionName: "quoteExactOutputSingle",
    args: [
      {
        tokenIn: process.env.WBNB_ADDRESS_BSC as `0x${string}`,
        tokenOut: process.env.USDC_ADDRESS_BSC_TESTNET as `0x${string}`,
        amount: SAMPLE_USDC,
        fee: 500, // 0.05% pool
        sqrtPriceLimitX96: 0n,
      },
    ],
  });

  // amountIn = WBNB wei needed to buy 1 USDC
  // spotPrice (USDC per BNB) = 1e18 / amountIn * 1 (since 1 USDC output)
  const wbnbWeiPer1USDC = result[0];
  return Number((10n ** 18n * 1_000_000n) / wbnbWeiPer1USDC) / 1_000_000;
}

// -------------------------------------------------------------------------
// Update payment session status in Supabase
// Optionally caches swap params for /execute to retrieve without recalculating
// -------------------------------------------------------------------------
export async function updateSessionStatus(
  sessionId: string,
  status: SessionStatus,
  bridgeMode?: BridgeMode,
  swapParams?: SwapParams
): Promise<void> {
  const supabase = getSupabaseClient();
  const update: Record<string, unknown> = { status };

  if (bridgeMode) update.bridge_mode = bridgeMode;

  if (swapParams) {
    // Serialize bigints to strings — JSONB can store strings fine
    update.swap_params = {
      amountInMaximumWei: swapParams.amountInMaximumWei.toString(),
      grossUSDCRequired: swapParams.grossUSDCRequired.toString(),
      aigServiceFee: swapParams.aigServiceFee.toString(),
      netUSDCToMerchant: swapParams.netUSDCToMerchant.toString(),
      poolFee: swapParams.poolFee,
      spotPriceUSDCPerBNB: swapParams.spotPriceUSDCPerBNB,
    };
  }

  const { error } = await supabase
    .from("payment_sessions")
    .upsert({ session_id: sessionId, ...update }, { onConflict: "session_id" });

  if (error) throw new Error(`updateSessionStatus failed: ${error.message}`);
}

// -------------------------------------------------------------------------
// Internal Supabase client (singleton)
// -------------------------------------------------------------------------
let _supabase: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Supabase env vars not set");
    _supabase = createClient(url, key);
  }
  return _supabase;
}
