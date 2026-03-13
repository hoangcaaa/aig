# Phase 2 — ADMIN_RELAY Path

**Priority:** P0 | **Status:** Complete | **Effort:** ~4h
**Blocks:** Working demo (guaranteed path regardless of CCTP result)
**Blocked by:** Phase 1

## Context Links
- PRD: `/PRD final.md` — Section 6.2 (fallback architecture), F-002 (agent orchestrator)
- Code: `frontend/lib/mock-bridge.ts`, `frontend/app/api/agent/execute/route.ts`

## Key Insights
- ADMIN_RELAY is the safe path — build it first regardless of smoke test result
- `adminRelay()` idempotency guard already implemented (Supabase status check + atomic update)
- `pollSwapCompleted()` must parse `SwapCompleted(bytes32, uint256, address)` event from BSC Testnet receipt
- Admin wallet on Arc Testnet must be pre-funded with testUSDC before any relay can execute
- `verifyAdminWalletBalance()` is a warning, not a blocker — should not throw if balance is low

## Requirements

### Functional
- `pollSwapCompleted()` returns event data within 30s timeout or null
- `adminRelay()` transfers exact `usdcAmount` from admin wallet to merchant on Arc Testnet
- `adminRelay()` is idempotent — duplicate calls for same `sessionId` are no-ops
- `verifyAdminWalletBalance()` logs warning when balance < 50 USDC, does not throw
- `/api/agent/execute` SSE stream emits: `swap_executing` → `bridging` → `confirmed` (or `bridge_delayed`)

### Non-Functional
- Admin wallet private key only from `AIG_ADMIN_WALLET_PRIVATE_KEY` env var — never hardcoded
- Transfer must confirm within 30s on Arc Testnet (1 retry on timeout then `BRIDGE_DELAYED`)

## Architecture

```
POST /api/agent/execute { sessionId, swapTxHash, merchantWallet, targetUSDC }
    │
    ├─ emit: swap_executing
    │
    ├─ pollSwapCompleted(sessionId, swapTxHash, 30_000)
    │       └─ viem: waitForTransactionReceipt(swapTxHash) on BSC Testnet
    │              then parse SwapCompleted event from receipt.logs
    │
    ├─ emit: bridging { mode: "ADMIN_RELAY" }
    │
    ├─ adminRelay(merchantWallet, netUSDCAmount, sessionId)
    │       ├─ Supabase: check status === "PENDING"
    │       ├─ Supabase: atomic update to "SWAP_EXECUTING" (.eq("status","PENDING"))
    │       ├─ verifyAdminWalletBalance()
    │       └─ viem walletClient: USDC.transfer(merchantWallet, usdcAmount) on Arc
    │
    ├─ updateSessionStatus(sessionId, "CONFIRMED", "ADMIN_RELAY")
    ├─ emit: confirmed { txHash, bridgeMode: "ADMIN_RELAY" }
    └─ awardPoints(...)
```

## Related Code Files

**Modify:**
- `frontend/lib/mock-bridge.ts` — implement all 3 TODO functions
- `frontend/app/api/agent/execute/route.ts` — wire ADMIN_RELAY branch (created in Phase 1)

## Implementation Steps

### Step 1 — Implement `pollSwapCompleted()` in `mock-bridge.ts`

```typescript
import { createPublicClient, http, decodeEventLog, keccak256, toHex } from 'viem';
import { bscTestnet } from 'viem/chains';

// SwapCompleted event ABI (must match SwapRouter.sol exactly)
const SWAP_COMPLETED_ABI = [{
  name: 'SwapCompleted',
  type: 'event',
  inputs: [
    { name: 'sessionId', type: 'bytes32', indexed: true },
    { name: 'netUSDCAmount', type: 'uint256', indexed: false },
    { name: 'merchantWallet', type: 'address', indexed: false }
  ]
}] as const;

export async function pollSwapCompleted(
  sessionId: string,
  txHash: string,
  timeoutMs = 30_000
): Promise<{ netUSDCAmount: bigint; merchantWallet: string } | null> {
  const client = createPublicClient({
    chain: bscTestnet,
    transport: http(process.env.BSC_TESTNET_RPC_URL)
  });

  // waitForTransactionReceipt handles polling internally
  let receipt;
  try {
    receipt = await client.waitForTransactionReceipt({
      hash: txHash as `0x${string}`,
      timeout: timeoutMs
    });
  } catch {
    console.warn(`pollSwapCompleted: tx ${txHash} not confirmed within ${timeoutMs}ms`);
    return null;
  }

  // Parse SwapCompleted logs from the receipt
  const swapRouterAddress = (process.env.SWAP_ROUTER_ADDRESS_BSC ?? '').toLowerCase();
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== swapRouterAddress) continue;
    try {
      const decoded = decodeEventLog({
        abi: SWAP_COMPLETED_ABI,
        data: log.data,
        topics: log.topics
      });
      if (decoded.eventName === 'SwapCompleted') {
        return {
          netUSDCAmount: decoded.args.netUSDCAmount,
          merchantWallet: decoded.args.merchantWallet
        };
      }
    } catch {
      // Not a SwapCompleted log — skip
    }
  }

  console.warn(`pollSwapCompleted: SwapCompleted event not found in tx ${txHash}`);
  return null;
}
```

### Step 2 — Implement `verifyAdminWalletBalance()` in `mock-bridge.ts`

```typescript
export async function verifyAdminWalletBalance(): Promise<void> {
  const arcChain = getArcChain();
  const client = createPublicClient({ chain: arcChain, transport: http(process.env.ARC_TESTNET_RPC_URL) });

  const erc20Abi = [{
    name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }]
  }] as const;

  const balance = await client.readContract({
    address: process.env.USDC_ADDRESS_ARC_TESTNET as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [process.env.AIG_ADMIN_WALLET_ADDRESS as `0x${string}`]
  });

  if (balance < MIN_ADMIN_BALANCE_USDC) {
    console.warn(
      `⚠️  ADMIN WALLET LOW: ${Number(balance) / 1e6} USDC remaining. ` +
      `Top up ${process.env.AIG_ADMIN_WALLET_ADDRESS} on Arc Testnet.`
    );
  }
}
```

### Step 3 — Implement `adminRelay()` transfer in `mock-bridge.ts`

Replace the `throw new Error("adminRelay: transfer not yet implemented")` with:

```typescript
import { createWalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// (inside adminRelay(), after the idempotency guard and balance check)

const account = privateKeyToAccount(process.env.AIG_ADMIN_WALLET_PRIVATE_KEY as `0x${string}`);
const arcChain = getArcChain();
const walletClient = createWalletClient({
  account,
  chain: arcChain,
  transport: http(process.env.ARC_TESTNET_RPC_URL)
});
const publicClient = createPublicClient({
  chain: arcChain,
  transport: http(process.env.ARC_TESTNET_RPC_URL)
});

const erc20TransferAbi = [{
  name: 'transfer', type: 'function', stateMutability: 'nonpayable',
  inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
  outputs: [{ type: 'bool' }]
}] as const;

const txHash = await walletClient.writeContract({
  address: process.env.USDC_ADDRESS_ARC_TESTNET as `0x${string}`,
  abi: erc20TransferAbi,
  functionName: 'transfer',
  args: [merchantWallet as `0x${string}`, usdcAmount]
});

await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 30_000 });
return { txHash };
```

### Step 4 — Add `getArcChain()` helper to `mock-bridge.ts`

Arc Testnet is not in viem's built-in chains. Define it once:

```typescript
import { defineChain } from 'viem';

function getArcChain() {
  const chainId = parseInt(process.env.ARC_CHAIN_ID ?? '0', 10);
  if (!chainId) throw new Error('ARC_CHAIN_ID env var not set');
  return defineChain({
    id: chainId,
    name: 'Arc Testnet',
    nativeCurrency: { name: 'Arc', symbol: 'ARC', decimals: 18 },
    rpcUrls: { default: { http: [process.env.ARC_TESTNET_RPC_URL!] } }
  });
}
```

Note: `getArcChain()` is also needed by `cctp.ts` (Phase 3). Extract to `frontend/lib/chains.ts` to avoid duplication.

### Step 5 — Wire ADMIN_RELAY branch in `/api/agent/execute/route.ts`

```typescript
// ADMIN_RELAY branch inside runAgentPipeline:
const swapEvent = await pollSwapCompleted(sessionId, swapTxHash);
if (!swapEvent) {
  await updateSessionStatus(sessionId, 'BRIDGE_DELAYED');
  await emit('bridge_delayed', { reason: 'SwapCompleted event not found within 30s' });
  return;
}

const { txHash: relayTxHash } = await adminRelay(
  merchantWallet,
  swapEvent.netUSDCAmount,
  sessionId
);

if (!relayTxHash) return; // idempotency guard fired

await updateSessionStatus(sessionId, 'CONFIRMED', 'ADMIN_RELAY');
await emit('confirmed', { txHash: relayTxHash, bridgeMode: 'ADMIN_RELAY' });
```

## Todo List

- [ ] Implement `pollSwapCompleted()` with viem receipt parsing
- [ ] Implement `verifyAdminWalletBalance()` with Arc Testnet balance read
- [ ] Implement `adminRelay()` ERC-20 transfer via viem walletClient
- [ ] Extract `getArcChain()` to `frontend/lib/chains.ts`
- [ ] Wire ADMIN_RELAY branch in `/api/agent/execute/route.ts`
- [ ] Add `ARC_CHAIN_ID` to `.env.example`
- [ ] Pre-fund admin wallet with testUSDC on Arc Testnet (manual step — operator task)
- [ ] Manual test: trigger a swap on BSC Testnet, verify relay executes on Arc

## Success Criteria

- `pollSwapCompleted()` returns event data after a real BSC Testnet swap tx
- `adminRelay()` transfers correct USDC amount to merchant wallet on Arc Testnet
- Idempotency: calling `adminRelay()` twice with same `sessionId` executes transfer once
- SSE stream emits all expected events in order through to `confirmed`
- `payment_sessions` row shows `status=CONFIRMED, bridge_mode=ADMIN_RELAY`

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Admin wallet runs out of testUSDC | Medium | `verifyAdminWalletBalance()` warns at 50 USDC; keep buffer of 500+ USDC |
| Arc Testnet RPC unstable / unknown chain ID | Medium | Confirm `ARC_CHAIN_ID` and `ARC_TESTNET_RPC_URL` from Arc docs/community before implementing |
| `waitForTransactionReceipt` hangs on testnet reorg | Low | Set `timeout: 30_000` — viem throws on timeout, caught by pipeline error handler |

## Security Considerations

- `AIG_ADMIN_WALLET_PRIVATE_KEY` must be in `.env.local` only — never committed to git
- `BRIDGE_MODE=ADMIN_RELAY` must be removed/disabled before any mainnet deployment (PRD requirement)
- Admin wallet has real signing authority — treat its private key with production-level secrecy even on testnet

## Next Steps

- Phase 3 (CCTP path) can start in parallel if smoke test passed
- Phase 4 (UI) can also start in parallel — no runtime dependency on Phase 2 completion
