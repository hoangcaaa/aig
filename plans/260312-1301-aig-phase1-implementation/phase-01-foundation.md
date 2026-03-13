# Phase 1 — Foundation

**Priority:** P0 | **Status:** Complete | **Effort:** ~5h
**Blocks:** All other phases

## Context Links
- PRD: `/PRD final.md` — Section 6.1 (smoke test), F-001 (spot price), F-002 (agent route)
- Code: `scripts/test-cctp-domain7.ts`, `frontend/lib/agent.ts`, `frontend/app/api/agent/route.ts`

## Key Insights
- CCTP smoke test result determines BRIDGE_MODE for the entire system
- `fetchSpotPrice()` uses the PancakeSwap V3 QuoterV2 — same call semantics as the swap, so quoted price matches execution price
- `updateSessionStatus()` requires `payment_sessions` table (not yet created in Supabase)
- Route must be split to eliminate the `waitForSwapTx()` design problem (two-request flow)
- `swap_params` JSONB column caches SwapParams in Supabase so `/execute` doesn't recalculate

## Requirements

### Functional
- Smoke test exits 0 (PASS) or 1 (FAIL) with clear log output and ACTION instruction
- `fetchSpotPrice()` returns current tBNB/USDC price from on-chain Quoter (not aggregator)
- `updateSessionStatus()` upserts status + bridge_mode in Supabase atomically
- `/api/agent/quote` returns SwapParams as JSON, caches to Supabase
- `/api/agent/execute` accepts `{ sessionId, swapTxHash }`, opens SSE stream

### Non-Functional
- Quoter call must complete in <500ms (BSC Testnet RPC latency)
- No secrets in code — all addresses via env vars

## Architecture

```
POST /api/agent/quote
  body: { sessionId, merchantWallet, targetUSDC, customerWallet, sourceChain, sourceToken }
  1. calculateSwapParams(targetUSDC)  ← calls fetchSpotPrice()
  2. updateSessionStatus(sessionId, "PENDING")
  3. cache swap_params to payment_sessions row
  4. return SwapParams as JSON

POST /api/agent/execute
  body: { sessionId, swapTxHash, merchantWallet, targetUSDC }
  1. load swap_params from Supabase (already calculated)
  2. updateSessionStatus(sessionId, "SWAP_EXECUTING")
  3. emit SSE: swap_executing
  4. → branch to CCTP or ADMIN_RELAY (Phase 2/3)
  5. → awardPoints on CONFIRMED
```

## Supabase Schema — payment_sessions Table

**Create this table before any TypeScript implementation:**

```sql
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

-- Index for frequent lookups
create index on payment_sessions (session_id);

-- Trigger to auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger payment_sessions_updated_at
  before update on payment_sessions
  for each row execute function update_updated_at();
```

## Related Code Files

**Modify:**
- `scripts/test-cctp-domain7.ts` — fill in all TODOs
- `frontend/lib/agent.ts` — implement `fetchSpotPrice()`, `updateSessionStatus()`
- `frontend/app/api/agent/route.ts` — split into `/quote` + `/execute`

**Do NOT create new files** — update existing scaffolds only.

## Implementation Steps

### Step 1 — Supabase: Create payment_sessions table
Run the SQL above in Supabase SQL editor. Verify table exists before proceeding.

### Step 2 — Fill CCTP smoke test TODOs (`scripts/test-cctp-domain7.ts`)

Fill in each TODO block:

**Step 1 — Initial Arc USDC balance:**
```typescript
const arcPublicClient = createPublicClient({
  chain: { id: 212, name: 'Arc Testnet', /* ... */ },
  transport: http(ARC_TESTNET_RPC_URL)
});
const erc20Abi = [{ name: 'balanceOf', type: 'function', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' }] as const;
const initialBalance = await arcPublicClient.readContract({
  address: USDC_ADDRESS_ARC_TESTNET as `0x${string}`,
  abi: erc20Abi,
  functionName: 'balanceOf',
  args: [account.address]
});
log("STEP 1", `Initial Arc USDC: ${formatUnits(initialBalance, 6)}`);
```

**Step 2 — Approve TokenMessenger:**
```typescript
const bscWalletClient = createWalletClient({ account, chain: bscTestnet, transport: http(BSC_TESTNET_RPC_URL) });
const approveTx = await bscWalletClient.writeContract({
  address: USDC_ADDRESS_BSC_TESTNET as `0x${string}`,
  abi: [{ name: 'approve', type: 'function', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] }] as const,
  functionName: 'approve',
  args: [CCTP_TOKEN_MESSENGER_BSC as `0x${string}`, TEST_USDC_AMOUNT]
});
await bscClient.waitForTransactionReceipt({ hash: approveTx });
```

**Step 3 — depositForBurn:**
```typescript
const depositTx = await bscWalletClient.writeContract({
  address: CCTP_TOKEN_MESSENGER_BSC as `0x${string}`,
  abi: [{ name: 'depositForBurn', type: 'function', inputs: [
    { name: 'amount', type: 'uint256' },
    { name: 'destinationDomain', type: 'uint32' },
    { name: 'mintRecipient', type: 'bytes32' },
    { name: 'burnToken', type: 'address' }
  ], outputs: [{ type: 'uint64' }] }] as const,
  functionName: 'depositForBurn',
  args: [TEST_USDC_AMOUNT, arcDomain, `0x000000000000000000000000${account.address.slice(2)}`, USDC_ADDRESS_BSC_TESTNET as `0x${string}`]
});
const depositTxHash = depositTx;
await bscClient.waitForTransactionReceipt({ hash: depositTxHash });
```

**Step 4 — Extract message hash:**
```typescript
const receipt = await bscClient.getTransactionReceipt({ hash: depositTxHash });
const messageSentTopic = keccak256(toHex('MessageSent(bytes)'));  // import from viem
const messageSentLog = receipt.logs.find(l => l.topics[0] === messageSentTopic);
if (!messageSentLog) throw new Error('MessageSent log not found in receipt');
// Decode the bytes data from the log
const messageBytes = decodeAbiParameters([{ type: 'bytes' }], messageSentLog.data)[0];
const messageHash = keccak256(messageBytes);
```

**Step 6 — receiveMessage on Arc:**
```typescript
const arcWalletClient = createWalletClient({ account, chain: arcChain, transport: http(ARC_TESTNET_RPC_URL) });
const receiveTx = await arcWalletClient.writeContract({
  address: CCTP_MESSAGE_TRANSMITTER_ARC as `0x${string}`,
  abi: [{ name: 'receiveMessage', type: 'function', inputs: [{ name: 'message', type: 'bytes' }, { name: 'attestation', type: 'bytes' }], outputs: [{ type: 'bool' }] }] as const,
  functionName: 'receiveMessage',
  args: [messageBytes, attestation as `0x${string}`]
});
await arcPublicClient.waitForTransactionReceipt({ hash: receiveTx });
```

**Step 7 — Verify balance:**
```typescript
const finalBalance = await arcPublicClient.readContract({ address: USDC_ADDRESS_ARC_TESTNET as `0x${string}`, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] });
if (finalBalance <= initialBalance) throw new Error('Balance did not increase — CCTP failed');
log("STEP 7", `Arc USDC after: ${formatUnits(finalBalance, 6)} ✓`);
```

### Step 3 — Implement `fetchSpotPrice()` in `frontend/lib/agent.ts`

```typescript
import { createPublicClient, http } from 'viem';
import { bscTestnet } from 'viem/chains';

// PancakeSwap V3 QuoterV2 on BSC Testnet
const QUOTER_ADDRESS = (process.env.PANCAKESWAP_V3_QUOTER_BSC ?? '0xbC203d7f83677c7ed3F7acEc959963E5051B27aE') as `0x${string}`;

const quoterAbi = [{
  name: 'quoteExactOutputSingle',
  type: 'function',
  stateMutability: 'nonpayable',
  inputs: [{ name: 'params', type: 'tuple', components: [
    { name: 'tokenIn', type: 'address' },
    { name: 'tokenOut', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'fee', type: 'uint24' },
    { name: 'sqrtPriceLimitX96', type: 'uint160' }
  ]}],
  outputs: [
    { name: 'amountIn', type: 'uint256' },
    { name: 'sqrtPriceX96After', type: 'uint160' },
    { name: 'initializedTicksCrossed', type: 'uint32' },
    { name: 'gasEstimate', type: 'uint256' }
  ]
}] as const;

async function fetchSpotPrice(): Promise<number> {
  const client = createPublicClient({ chain: bscTestnet, transport: http(process.env.BSC_TESTNET_RPC_URL) });

  // Quote: how much WBNB to get 1 USDC exactly
  const SAMPLE_USDC = 1_000_000n; // 1 USDC (6 decimals)
  const result = await client.readContract({
    address: QUOTER_ADDRESS,
    abi: quoterAbi,
    functionName: 'quoteExactOutputSingle',
    args: [{
      tokenIn: process.env.WBNB_ADDRESS_BSC as `0x${string}`,
      tokenOut: process.env.USDC_ADDRESS_BSC_TESTNET as `0x${string}`,
      amount: SAMPLE_USDC,
      fee: 500,  // 0.05% pool
      sqrtPriceLimitX96: 0n
    }]
  });

  // amountIn = WBNB wei needed for 1 USDC
  // spotPrice = 1 / (amountIn / 1e18) = 1e18 / amountIn
  const wbnbWeiPer1USDC = result[0]; // amountIn
  return Number(10n ** 18n * 1_000_000n / wbnbWeiPer1USDC) / 1_000_000; // USDC per BNB
}
```

### Step 4 — Implement `updateSessionStatus()` in `frontend/lib/agent.ts`

```typescript
export async function updateSessionStatus(
  sessionId: string,
  status: SessionStatus,
  bridgeMode?: BridgeMode,
  swapParams?: SwapParams
): Promise<void> {
  const supabase = getSupabaseClient();
  const update: Record<string, unknown> = { status };
  if (bridgeMode) update.bridge_mode = bridgeMode;
  if (swapParams) update.swap_params = {
    amountInMaximumWei: swapParams.amountInMaximumWei.toString(),
    grossUSDCRequired: swapParams.grossUSDCRequired.toString(),
    aigServiceFee: swapParams.aigServiceFee.toString(),
    netUSDCToMerchant: swapParams.netUSDCToMerchant.toString(),
    poolFee: swapParams.poolFee,
    spotPriceUSDCPerBNB: swapParams.spotPriceUSDCPerBNB,
  };

  const { error } = await supabase
    .from('payment_sessions')
    .upsert({ session_id: sessionId, ...update }, { onConflict: 'session_id' });

  if (error) throw new Error(`updateSessionStatus failed: ${error.message}`);
}

// Add singleton Supabase client to agent.ts
let _supabase: SupabaseClient | null = null;
function getSupabaseClient(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Supabase env vars not set');
    _supabase = createClient(url, key);
  }
  return _supabase;
}
```

### Step 5 — Refactor `route.ts`: split into `/quote` + `/execute`

Delete the current single `POST` export and replace with:

**New file: `frontend/app/api/agent/quote/route.ts`**
```typescript
// POST /api/agent/quote — sync, returns SwapParams JSON
export async function POST(req: NextRequest) {
  const body: AgentRequest = await req.json();
  const { sessionId, merchantWallet, targetUSDC } = body;

  const swapParams = await calculateSwapParams(targetUSDC);

  // Cache to Supabase so /execute can retrieve without recalculating
  await updateSessionStatus(sessionId, 'PENDING', undefined, swapParams);

  return Response.json({
    amountInMaximumWei: swapParams.amountInMaximumWei.toString(),
    grossUSDCRequired: swapParams.grossUSDCRequired.toString(),
    aigServiceFee: swapParams.aigServiceFee.toString(),
    netUSDCToMerchant: swapParams.netUSDCToMerchant.toString(),
    poolFee: swapParams.poolFee,
    spotPriceUSDCPerBNB: swapParams.spotPriceUSDCPerBNB,
  });
}
```

**New file: `frontend/app/api/agent/execute/route.ts`**
```typescript
// POST /api/agent/execute — SSE stream, starts from swap_executing
export async function POST(req: NextRequest) {
  const { sessionId, swapTxHash, merchantWallet, targetUSDC } = await req.json();
  // ... SSE setup + runAgentPipeline (Phase 2/3 wires in here)
}
```

Delete `frontend/app/api/agent/route.ts` after creating both new route files.

## Todo List

- [ ] Run Supabase SQL to create `payment_sessions` table
- [ ] Fill smoke test Step 1: initial Arc USDC balance read
- [ ] Fill smoke test Step 2: approve TokenMessenger
- [ ] Fill smoke test Step 3: depositForBurn
- [ ] Fill smoke test Step 4: extract message hash
- [ ] Fill smoke test Step 6: receiveMessage on Arc
- [ ] Fill smoke test Step 7: verify balance
- [ ] Run smoke test: `cd scripts && npx ts-node test-cctp-domain7.ts`
- [ ] Record result: set `BRIDGE_MODE=CCTP` or `BRIDGE_MODE=ADMIN_RELAY` in `.env.local`
- [ ] Implement `fetchSpotPrice()` in agent.ts
- [ ] Implement `updateSessionStatus()` in agent.ts (with swapParams cache support)
- [ ] Create `frontend/app/api/agent/quote/route.ts`
- [ ] Create `frontend/app/api/agent/execute/route.ts`
- [ ] Delete old `frontend/app/api/agent/route.ts`
- [ ] Add `PANCAKESWAP_V3_QUOTER_BSC`, `WBNB_ADDRESS_BSC` to `.env.example`

## Success Criteria

- `npm run dev` starts without TypeScript errors
- `POST /api/agent/quote` returns valid SwapParams JSON for a $10 targetUSDC
- `payment_sessions` row created in Supabase with status=PENDING and swap_params populated
- Smoke test exits 0 or 1 with clear PASS/FAIL + ACTION log

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| PancakeSwap V3 BSC Testnet pool has no liquidity | Medium | Test with ≤$1 USDC first; if Quoter reverts, check pool address via Quoter factory |
| BSC Testnet RPC timeout | Low | Use reliable RPC (Ankr/QuickNode BSC Testnet endpoint) |
| Arc chain definition not in viem/chains | Medium | Define custom chain object: `{ id: <arc_chain_id>, name: 'Arc Testnet', nativeCurrency: {…}, rpcUrls: {…} }` |

## Security Considerations

- `SUPABASE_SERVICE_ROLE_KEY` must never be exposed client-side — only used in API routes / server-side
- Never log private keys or tx signatures — only log hashes
- `upsert` on `session_id` prevents duplicate rows but caller must validate `sessionId` is not reusable across merchants

## Next Steps

After Phase 1:
- Phase 2 (ADMIN_RELAY) and Phase 4 (UI) can start in parallel
- Phase 3 (CCTP) only if smoke test exited 0
