# Code Review: AIG Phase 1 MVP Implementation

**Date:** 2026-03-12
**Scope:** 16 files (~1,200 LOC) — lib/, api routes, components, SwapRouter.sol, Deploy.s.sol
**Focus:** Security, idempotency, BigInt safety, SSE, error handling, wagmi v2

---

## Overall Assessment

Solid Phase 1 MVP. Code is well-documented, follows PRD constraints (no Solidity math, off-chain slippage). Idempotency guard in `adminRelay` correctly uses double-check pattern. Several security and correctness issues need attention before testnet deployment.

---

## Critical Issues

### C1. Race condition in adminRelay idempotency guard
**File:** `frontend/lib/mock-bridge.ts:130-158`

SELECT + UPDATE is not atomic. Between the `.select()` check (L130) and `.update()` (L154), another invocation can pass the same guard. The `.eq("status", "PENDING")` on the update helps but doesn't fully close the gap — the function doesn't verify the update actually changed a row.

**Fix:** Check `count` or `data` returned by `.update()`. If 0 rows affected, abort:
```ts
const { data: updated, error: updateError } = await supabase
  .from("payment_sessions")
  .update({ status: "SWAP_EXECUTING", bridge_mode: "ADMIN_RELAY" })
  .eq("session_id", sessionId)
  .eq("status", "PENDING")
  .select("session_id"); // returns matched rows

if (!updated?.length) {
  console.warn(`adminRelay: session ${sessionId} already claimed`);
  return { txHash: "" };
}
```
Remove the preceding `.select()` + status check — the atomic update replaces it.

### C2. Private key used without validation
**File:** `frontend/lib/mock-bridge.ts:168-169`, `frontend/lib/cctp.ts:121-122`

`process.env.AIG_ADMIN_WALLET_PRIVATE_KEY` cast to `0x${string}` with no validation. If env var is unset or malformed, `privateKeyToAccount()` will throw a cryptic error. Worse, if accidentally set to a non-hex value, behavior is undefined.

**Fix:** Validate at startup or at minimum before use:
```ts
const pk = process.env.AIG_ADMIN_WALLET_PRIVATE_KEY;
if (!pk || !pk.startsWith("0x") || pk.length !== 66)
  throw new Error("AIG_ADMIN_WALLET_PRIVATE_KEY invalid or unset");
```

### C3. No input validation on /api/agent/execute
**File:** `frontend/app/api/agent/execute/route.ts:28`

Request body destructured with zero validation. `swapTxHash`, `sessionId`, `merchantWallet` all used directly in blockchain calls and DB queries. Missing:
- `swapTxHash` format validation (must be `0x` + 64 hex chars)
- `merchantWallet` address validation
- `targetUSDC` type/range check
- `sessionId` existence check

Injection risk: `merchantWallet` flows directly into `adminRelay()` which uses it as an ERC-20 transfer recipient. Malformed input = lost funds.

**Fix:** Add validation block before SSE stream starts:
```ts
if (!sessionId || !swapTxHash?.match(/^0x[0-9a-fA-F]{64}$/) || !merchantWallet?.match(/^0x[0-9a-fA-F]{40}$/)) {
  return Response.json({ error: "Invalid params" }, { status: 400 });
}
```

---

## High Priority

### H1. Floating-point precision loss in calculateSwapParams
**File:** `frontend/lib/agent.ts:97-107`

`targetUSDC * 0.001` and subsequent float math can lose precision for large USD amounts. Example: `targetUSDC = 999999.99` produces rounding artifacts. `Math.ceil(grossUSDCFloat * 1_000_000)` may exceed safe integer range for very large values.

**Recommendation:** Use integer math throughout:
```ts
const targetMicro = BigInt(Math.round(targetUSDC * 1_000_000));
const aigServiceFee = (targetMicro + 999n) / 1000n; // ceil(0.1%)
const grossUSDC = targetMicro + aigServiceFee;
```

### H2. fetchSpotPrice precision loss
**File:** `frontend/lib/agent.ts:155`

`Number((10n ** 18n * 1_000_000n) / wbnbWeiPer1USDC) / 1_000_000` — integer division truncates, then float division introduces rounding. For a BNB price of ~$600, error is small but systematic (always underestimates). Combined with slippage buffer this is likely safe for MVP but should be documented as known imprecision.

### H3. CCTP path calls extractMessageBytesFromReceipt twice
**File:** `frontend/app/api/agent/execute/route.ts:79-81`

```ts
const [messageHash, rawMessage] = await Promise.all([
  extractMessageHash(swapTxHash),
  extractRawMessage(swapTxHash),
]);
```
Both call `extractMessageBytesFromReceipt()` which does `waitForTransactionReceipt()`. Two redundant RPC calls. Should call `extractMessageBytesFromReceipt` once, compute hash from result.

**Fix:** Export `extractMessageBytesFromReceipt` or add combined helper:
```ts
const messageBytes = await extractMessageBytesFromReceipt(swapTxHash);
const messageHash = keccak256(messageBytes);
```

### H4. SSE stream never closed on client disconnect
**File:** `frontend/app/api/agent/execute/route.ts:39-44`

`runPipeline` runs as fire-and-forget promise. If client disconnects mid-stream, the pipeline continues executing blockchain transactions (adminRelay, receiveMessage) and writing to a closed stream. `writer.write()` will throw but is only caught in the `.catch()` handler which tries to write again.

**Recommendation:** Use `AbortSignal` from `req.signal` to detect client disconnection and abort the pipeline early (at least before the expensive bridge step).

### H5. SwapRouter.sol refund sends WBNB not BNB
**File:** `contracts/src/SwapRouter.sol:146`

Refund transfers WBNB tokens to customer, not native BNB. Customer receives WBNB they must unwrap. Most wallets handle this, but it's a UX friction. Consider unwrapping before refund:
```solidity
IWBNB(wbnb).withdraw(refundAmount);
payable(msg.sender).call{value: refundAmount}("");
```

### H6. SwapRouter.sol: stale USDC balance check
**File:** `contracts/src/SwapRouter.sol:134`

`balanceOf(address(this))` includes any USDC already in the contract (from previous txs or stuck tokens). This means the `InsufficientOutput` check can pass even if the swap produced 0 USDC but contract had residual balance. Should track balance delta:
```solidity
uint256 usdcBefore = IERC20(usdc).balanceOf(address(this));
// ... swap ...
uint256 usdcReceived = IERC20(usdc).balanceOf(address(this)) - usdcBefore;
```

---

## Medium Priority

### M1. Duplicate Supabase singleton across 3 files
**Files:** `agent.ts`, `mock-bridge.ts`, `points.ts` — each has own `getSupabaseClient()` singleton with service role key.

Extract to shared `lib/supabase-admin.ts`. Reduces duplication and centralizes credential handling.

### M2. QR code generator missing dependency in useEffect
**File:** `frontend/components/qr-code-generator.tsx:47-49`

`refresh` function references `merchantWallet` and `targetUSDC` via closure but the auto-refresh interval (L52-55) captures a stale `refresh` if props change. React lint would flag this. Should use `useCallback` for `refresh` and include it in dependency arrays.

### M3. No quote staleness handling
**File:** `frontend/app/pay/[id]/page.tsx:72-93`

Quote fetched once on mount. If user waits 5+ minutes, spot price may have moved significantly. No refresh mechanism or staleness warning. QR has 60s expiry but quote has none.

**Recommendation:** Add `expiresAt` to quote response; show refresh button after 60s.

### M4. sessionId encoding as bytes32 is fragile
**File:** `frontend/app/pay/[id]/page.tsx:138`

`sessionId.padStart(64, "0")` — if sessionId is already 64 hex chars (from QR generator's 32-byte random), this is fine. But if it's a UUID or other format, the padding produces invalid bytes32. No validation enforced.

### M5. execute route: empty txHash returned on idempotency skip
**File:** `frontend/app/api/agent/execute/route.ts:105-108`

When `adminRelay` returns `{ txHash: "" }` (idempotency guard), the pipeline silently returns without emitting any SSE event. Client hangs with "bridging" status forever. Should emit a `confirmed` or `already_processed` event.

### M6. SwapRouter.sol: unspentWbnb variable computed but unused
**File:** `contracts/src/SwapRouter.sol:142`

`unspentWbnb` is calculated but never used. `refundAmount` (L144) is the value actually transferred. Dead code — remove L142.

### M7. No rate limiting on API routes
**Files:** `quote/route.ts`, `execute/route.ts`, `points/route.ts`

No rate limiting. `/api/agent/quote` calls on-chain quoter per request — easily abused to burn RPC credits. Consider middleware-level rate limiting or at minimum a session-based cooldown.

### M8. Deploy.s.sol logs private key indirectly
**File:** `contracts/scripts/Deploy.s.sol:15`

CLI usage comment shows `--private-key $TEST_PRIVATE_KEY`. This is fine for testnet, but forge's `--private-key` flag puts the key in shell history and process list. Prefer `--account` or `--keystore` for any non-test environment. Document this risk.

---

## Positive Observations

- Strong adherence to "no Solidity math" rule throughout — all fee/slippage calculations in `agent.ts`
- Idempotency double-check pattern in `adminRelay` (SELECT check + conditional UPDATE)
- Clean SSE implementation using TransformStream (correct Next.js 14+ pattern)
- Good type definitions (SwapParams, SessionStatus, AgentRequest)
- Proper BigInt serialization for JSON responses
- Real-time Supabase subscription in payment feed
- QR auto-refresh with 60s countdown is good UX
- SwapRouter.sol has mandatory refund mechanism with event emission
- Deploy.s.sol correctly handles ADMIN_RELAY (address(0) for CCTP messenger)

---

## Recommended Actions (Priority Order)

1. **C3** — Add input validation on `/api/agent/execute` (security, funds at risk)
2. **C1** — Fix adminRelay race condition (use atomic update + row count check)
3. **C2** — Validate private key env var before use
4. **H6** — Fix stale USDC balance check in SwapRouter.sol (use delta)
5. **H3** — Deduplicate `extractMessageBytesFromReceipt` calls (saves RPC + latency)
6. **H5** — Consider WBNB unwrap before refund (UX)
7. **M5** — Emit SSE event on idempotency skip (client hangs otherwise)
8. **M1** — Extract shared Supabase singleton

---

## Unresolved Questions

1. Is `points_balance` a materialized view or a table? If view, is it auto-refreshed or manual? `getPointsBalance` queries it directly — could return stale data if not refreshed after `awardPoints`.
2. SwapRouter.sol has no `pause()` mechanism — if a bug is found post-deploy, there's no way to halt swaps without redeploying. Intentional for PoC?
3. The `updateSessionStatus` uses `upsert` (L187 in agent.ts) — this means any caller can create sessions via the API. Is session creation meant to be restricted?
4. No session expiry enforcement server-side. QR expires client-side (60s), but a captured URL can be used indefinitely. Should `/api/agent/quote` check session age?
