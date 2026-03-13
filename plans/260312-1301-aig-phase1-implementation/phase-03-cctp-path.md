# Phase 3 — CCTP Path

**Priority:** P0 (conditional) | **Status:** Complete | **Effort:** ~4h
**Condition:** Only implement if smoke test (`scripts/test-cctp-domain7.ts`) exits 0 (PASS)
**Blocked by:** Phase 1

## Context Links
- PRD: `/PRD final.md` — Section 6.1, F-002
- Code: `frontend/lib/cctp.ts`, `frontend/app/api/agent/execute/route.ts`
- Circle docs: `https://developers.circle.com/stablecoins/docs/bridge-kit`

## Key Insights
- `pollAttestation()` is already fully implemented — do not modify it
- `extractMessageHash()` requires parsing the `MessageSent(bytes)` event log from BSC Testnet receipt
  - The event emits the raw message bytes; keccak256 of those bytes = the attestation lookup key
- `receiveMessage()` needs both raw message bytes AND the attestation signature — both come from different sources
- `extractRawMessage()` in route.ts returns the raw bytes (not the hash) — needed as first arg to `receiveMessage()`
- Arc Testnet must be defined as a custom viem chain (same `getArcChain()` from Phase 2 / `chains.ts`)

## Requirements

### Functional
- `extractMessageHash()` returns `keccak256(messageBytes)` from a BSC Testnet tx receipt
- `receiveMessage()` calls `MessageTransmitter.receiveMessage(message, attestation)` on Arc Testnet and returns confirmed txHash
- `extractRawMessage()` in route.ts returns the raw message bytes hex string from the same receipt
- Full CCTP pipeline: BSC burn → attestation poll → Arc mint → confirmed SSE event

### Non-Functional
- CCTP attestation timeout: 120s (already set in `pollAttestation()`) → `BRIDGE_DELAYED` on timeout
- Arc RPC confirmed stable before implementing (see Risk section)

## Architecture

```
POST /api/agent/execute (CCTP branch)
    │
    ├─ extractMessageHash(swapTxHash)
    │       └─ parse MessageSent event from BSC receipt → keccak256(messageBytes)
    │
    ├─ extractRawMessage(swapTxHash)      ← same receipt, different output
    │       └─ return raw bytes from MessageSent log data
    │
    ├─ pollAttestation(messageHash, 120_000)   ← already implemented
    │       └─ Circle API: GET /attestations/{messageHash}
    │          polls every 5s until status=complete
    │
    ├─ receiveMessage(rawMessage, attestation)
    │       └─ viem walletClient on Arc Testnet
    │          MessageTransmitter.receiveMessage(bytes, bytes)
    │
    ├─ updateSessionStatus(sessionId, "CONFIRMED", "CCTP")
    └─ emit: confirmed { txHash, bridgeMode: "CCTP" }
```

## Related Code Files

**Modify:**
- `frontend/lib/cctp.ts` — implement `extractMessageHash()`, `receiveMessage()`
- `frontend/app/api/agent/execute/route.ts` — implement `extractRawMessage()`, wire CCTP branch
- `frontend/lib/chains.ts` — reuse `getArcChain()` from Phase 2 (do not duplicate)

## Implementation Steps

### Step 1 — Shared receipt parsing helper

Both `extractMessageHash()` and `extractRawMessage()` parse the same log. To avoid two RPC calls for the same receipt, extract a shared helper or fetch once in route.ts and pass bytes to both functions.

**Recommended approach:** Add an internal helper `extractMessageBytesFromReceipt()` in `cctp.ts`:

```typescript
import { createPublicClient, http, decodeAbiParameters, keccak256 } from 'viem';
import { bscTestnet } from 'viem/chains';

// Topic0 of MessageSent(bytes) — precomputed
// keccak256("MessageSent(bytes)") = 0x8c5261668696ce22758910d05bab8f186d6eb247ceac2af2e82c7dc17669b036
const MESSAGE_SENT_TOPIC = '0x8c5261668696ce22758910d05bab8f186d6eb247ceac2af2e82c7dc17669b036' as `0x${string}`;

async function extractMessageBytesFromReceipt(txHash: string): Promise<`0x${string}`> {
  const client = createPublicClient({
    chain: bscTestnet,
    transport: http(process.env.BSC_TESTNET_RPC_URL)
  });

  const receipt = await client.waitForTransactionReceipt({
    hash: txHash as `0x${string}`,
    timeout: 60_000
  });

  // Find the MessageSent log emitted by the CCTP MessageTransmitter contract on BSC
  const msgLog = receipt.logs.find(
    l => l.topics[0]?.toLowerCase() === MESSAGE_SENT_TOPIC.toLowerCase()
  );
  if (!msgLog) throw new Error(`extractMessageBytes: MessageSent log not found in tx ${txHash}`);

  // The log data is ABI-encoded bytes: abi.encode(bytes message)
  const [messageBytes] = decodeAbiParameters([{ type: 'bytes' }], msgLog.data);
  return messageBytes as `0x${string}`;
}
```

### Step 2 — Implement `extractMessageHash()` in `cctp.ts`

```typescript
export async function extractMessageHash(txHash: string): Promise<string> {
  const messageBytes = await extractMessageBytesFromReceipt(txHash);
  return keccak256(messageBytes);
}
```

### Step 3 — Implement `receiveMessage()` in `cctp.ts`

```typescript
import { createWalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getArcChain } from './chains';  // from Phase 2

export async function receiveMessage(
  message: string,
  attestation: string
): Promise<{ txHash: string }> {
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

  const messageTransmitterAbi = [{
    name: 'receiveMessage',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'message', type: 'bytes' },
      { name: 'attestation', type: 'bytes' }
    ],
    outputs: [{ name: 'success', type: 'bool' }]
  }] as const;

  const txHash = await walletClient.writeContract({
    address: process.env.CCTP_MESSAGE_TRANSMITTER_ARC as `0x${string}`,
    abi: messageTransmitterAbi,
    functionName: 'receiveMessage',
    args: [message as `0x${string}`, attestation as `0x${string}`]
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 60_000 });
  return { txHash };
}
```

### Step 4 — Implement `extractRawMessage()` in `execute/route.ts`

Since `extractMessageBytesFromReceipt()` is internal to `cctp.ts`, export it or duplicate the receipt fetch. Recommended: export it as `extractRawMessage` from `cctp.ts` directly:

```typescript
// In cctp.ts — export the raw bytes extractor
export async function extractRawMessage(txHash: string): Promise<string> {
  return extractMessageBytesFromReceipt(txHash);
}
```

Then in `execute/route.ts`, import and call:
```typescript
import { extractMessageHash, extractRawMessage, pollAttestation, receiveMessage } from '@/lib/cctp';

// CCTP branch:
const [messageHash, rawMessage] = await Promise.all([
  extractMessageHash(swapTxHash),
  extractRawMessage(swapTxHash)     // same receipt — but two separate RPC calls
]);
// Note: to avoid 2 RPC calls, fetch receipt once and derive both — see optimization below
```

**Optimization** (optional, reduces RPC calls by 1):
Export `extractMessageHashAndBytes(txHash)` returning both hash and raw bytes from one receipt fetch.

### Step 5 — Wire CCTP branch in `/api/agent/execute/route.ts`

```typescript
if (BRIDGE_MODE === 'CCTP') {
  const [messageHash, rawMessage] = await Promise.all([
    extractMessageHash(swapTxHash),
    extractRawMessage(swapTxHash)
  ]);

  const attestation = await pollAttestation(messageHash, 120_000);

  const { txHash: arcTxHash } = await receiveMessage(rawMessage, attestation);

  await updateSessionStatus(sessionId, 'CONFIRMED', 'CCTP');
  await emit('confirmed', { txHash: arcTxHash, bridgeMode: 'CCTP' });
}
```

## Todo List

- [ ] Confirm smoke test passed (BRIDGE_MODE=CCTP) before starting this phase
- [ ] Confirm Arc Testnet RPC URL is stable and chain ID is known
- [ ] Add `extractMessageBytesFromReceipt()` internal helper to `cctp.ts`
- [ ] Implement `extractMessageHash()` using internal helper
- [ ] Implement `extractRawMessage()` as exported alias
- [ ] Implement `receiveMessage()` with viem walletClient on Arc Testnet
- [ ] Wire CCTP branch in `execute/route.ts`
- [ ] Verify `MESSAGE_SENT_TOPIC` hash matches Circle CCTP MessageTransmitter ABI
- [ ] End-to-end test: BSC deposit → attestation → Arc mint → confirmed SSE

## Success Criteria

- `extractMessageHash()` returns a valid 0x-prefixed 32-byte hash from a real depositForBurn tx
- `pollAttestation()` resolves with a valid attestation string within 120s
- `receiveMessage()` confirms on Arc Testnet and returns a valid txHash
- SSE stream shows `confirmed { bridgeMode: "CCTP" }` after end-to-end flow
- `payment_sessions` row shows `status=CONFIRMED, bridge_mode=CCTP`

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Arc Testnet CCTP Domain 7 not actually supported | High | This is why smoke test is mandatory first — skip entire phase if FAIL |
| `MESSAGE_SENT_TOPIC` hash is wrong | Low | Verify against Circle's MessageTransmitter ABI on Etherscan or Circle docs |
| Arc Testnet RPC offline / unstable | Medium | Confirm RPC URL from Arc community channels before implementing |
| `receiveMessage()` reverts (already used nonce) | Low | Each depositForBurn creates a unique nonce — reuse would only happen on retry |

## Security Considerations

- `AIG_ADMIN_WALLET_PRIVATE_KEY` used to call `receiveMessage()` — wallet needs small amount of Arc native token for gas
- `receiveMessage()` is permissionless on CCTP (anyone can call with valid attestation) — but using admin wallet avoids exposing customer wallets
- Never log raw attestation bytes — log only the hash and txHash

## Next Steps

- Phase 4 (UI) is independent — runs in parallel
- Phase 5 (deploy) is the final gate before real end-to-end testing
