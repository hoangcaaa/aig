# AIG System Architecture

Overview of AIG Phase 1 MVP architecture, component interactions, and data flow.

## High-Level Architecture

```
Customer (MetaMask on BSC Testnet)
    ↓ calls SwapRouter.swapAndBridge()
    ↓ submits sessionId + amount
    ↓
BSC Testnet SwapRouter.sol
    ├─ wraps BNB → WBNB
    ├─ swaps WBNB → USDC via PancakeSwap V3 (exactOutputSingle)
    ├─ accumulates fee
    ├─ → bridge branch (CCTP or ADMIN_RELAY)
    ↓
Frontend API Routes (/api/agent/*)
    ├─ /quote: fetch spot price, cache swap params
    ├─ /execute: SSE stream, poll swap, initiate bridge
    ↓
Bridge Layer (Conditional)
    ├─ CCTP Path (Primary):
    │   ├─ Extract MessageSent log from BSC receipt
    │   ├─ Poll Circle attestation API
    │   └─ Call MessageTransmitter.receiveMessage() on Arc
    │
    └─ ADMIN_RELAY Path (Fallback):
        ├─ Poll SwapCompleted event on BSC
        ├─ Check idempotency guard (Supabase status)
        └─ Transfer USDC from admin wallet to merchant on Arc
    ↓
Arc Network
    ├─ Mint USDC on chain (CCTP)
    └─ Receive transfer from admin (ADMIN_RELAY)
    ↓
Merchant Dashboard
    ├─ Real-time payment feed (Supabase subscription)
    ├─ Points balance (awardPoints trigger)
    └─ QR code for next payment session
```

## Component Breakdown

### 1. Smart Contracts (BSC Testnet)

**SwapRouter.sol**
- `swapAndBridge(sessionId, grossUSDC, aigFee, amountInMax, poolFee, merchantBytes32, merchantAddr)`
- Executable only by contract owner (initial tests)
- Future: integrate with CCTP TokenMessenger or relayer

Logic:
1. Receive BNB value
2. Wrap BNB → WBNB
3. Approve WBNB to PancakeSwap V3 Router
4. Call `exactOutputSingle` for USDC (amount = grossUSDC)
5. Store swap params in contract event log
6. Emit SwapCompleted(sessionId, netUSDCAmount, merchantWallet)
7. Refund unused WBNB to caller

Dual-mode:
- CCTP enabled: emit bridge flag
- ADMIN_RELAY mode: skip bridge, rely on off-chain relay

### 2. Backend API Routes (Next.js)

**POST /api/agent/quote**
- Body: `{ sessionId, merchantWallet, targetUSDC, customerWallet, sourceChain, sourceToken }`
- Returns: SwapParams JSON
- Side effects: cache to Supabase `payment_sessions` table

Flow:
```typescript
1. calculateSwapParams(targetUSDC)
   └─ fetchSpotPrice() → PancakeSwap V3 Quoter
   └─ apply 0.5% slippage
   └─ apply 0.1% AIG fee
2. updateSessionStatus(sessionId, "PENDING", undefined, swapParams)
   └─ upsert to Supabase with JSONB cache
3. return swapParams
```

**POST /api/agent/execute** (SSE Stream)
- Body: `{ sessionId, swapTxHash, merchantWallet, targetUSDC }`
- Streams SSE events: swap_executing → bridging → confirmed (or bridge_delayed)

Flow:
```typescript
1. Load swap_params from Supabase
2. emit: swap_executing
3. await pollSwapCompleted(swapTxHash, 30s)
   └─ viem: getTransactionReceipt → parse SwapCompleted event
4. emit: bridging { mode: BRIDGE_MODE }
5. IF BRIDGE_MODE === "CCTP":
   └─ extractMessageHash(swapTxHash) → Circle API pollAttestation(hash, 120s)
   └─ receiveMessage(message, attestation) on Arc
   ELSE:
   └─ adminRelay(merchantWallet, netUSDC, sessionId)
      └─ Supabase idempotency check (status === PENDING)
      └─ USDC.transfer on Arc Testnet
6. emit: confirmed { txHash, bridgeMode }
7. awardPoints(merchantWallet, targetUSDC)
```

**GET /api/points**
- Query param: `?wallet=0x...`
- Returns: `{ totalPoints, tier }`
- Reads from Supabase points_balance table

**GET /api/dashboard**
- Query param: `?wallet=0x...`
- Returns: Merchant profile + analytics stats
  - `merchantProfile`: { wallet, businessName, createdAt }
  - `analyticsStats`: { totalRevenue, transactionCount, successRate, recentVolume }
- Reads from merchants + payment_sessions tables
- Filters payment_sessions by merchant_wallet, status='CONFIRMED'

### 3. Database Schema (Supabase)

**payment_sessions**
```sql
id              uuid pk default gen_random_uuid()
session_id      text unique not null
status          text default 'PENDING'
bridge_mode     text                        -- 'CCTP' | 'ADMIN_RELAY'
merchant_wallet text fk → merchants.wallet_address
customer_wallet text
target_usdc     numeric
swap_params     jsonb                       -- cached SwapParams
created_at      timestamptz default now()
updated_at      timestamptz default now()
```

**merchants**
```sql
id              uuid pk default gen_random_uuid()
wallet_address  text unique not null       -- merchant's Arc Testnet wallet
business_name   text                       -- merchant business name
created_at      timestamptz default now()
```

**points_ledger**
```sql
id              uuid pk default gen_random_uuid()
merchant_wallet text
txn_type        text                        -- 'SWAP_COMPLETED', 'BRIDGE_COMPLETED'
points_awarded  integer
session_id      text fk → payment_sessions.session_id
created_at      timestamptz default now()
```

**points_balance**
```sql
merchant_wallet text pk
total_points    integer default 0
current_tier    text default 'BRONZE'       -- BRONZE, SILVER, GOLD, PLATINUM
last_updated    timestamptz default now()
```

### 4. Frontend Pages & Components

**Layout (layout.tsx)**
- WagmiProvider (wagmi v2)
- QueryClientProvider (@tanstack/react-query)
- Chain: bscTestnet

**Landing Page (/page.tsx)**
- Hero section
- Feature highlights
- CTA to merchant dashboard

**Payment Page (/pay/[id]/page.tsx)**
- Wagmi `useAccount` hook for wallet connection
- Fetch session from Supabase
- Call `/api/agent/quote` on load → show FeeBreakdownCard
- `useWriteContract` → SwapRouter.swapAndBridge()
- Open EventSource to `/api/agent/execute` on tx submission
- Display ProgressBar driven by SSE events
- Show receipt on confirmed event

**Dashboard (/dashboard/page.tsx)**
- Wagmi connect button
- Merchant profile section with business name
- DashboardStatCards: real-time analytics (total revenue, transaction count, success rate, recent volume)
- QRCodeGenerator (60s refresh)
- Supabase real-time subscription to payment_sessions
- PaymentFeedTable display
- Points balance via `/api/points` endpoint

**Components**
- `fee-breakdown-card.tsx` — display quote data (gross USDC, fee, net, BNB cost)
- `payment-progress-bar.tsx` — SSE-driven steps (idle → swap_executing → bridging → confirmed)
- `qr-code-generator.tsx` — QRCodeSVG + refresh timer
- `payment-feed-table.tsx` — table of confirmed transactions
- `dashboard-stat-cards.tsx` — 4 analytics cards: total revenue, transaction count, success rate, recent volume

### 5. Bridge Modes

**CCTP Path (Primary)**
```
BSC SwapCompleted event
    ↓ extract MessageSent log
    ↓ compute keccak256(message bytes)
    ↓
Circle Attestation API
    GET /attestations/{messageHash}
    ↓ poll every 5s for 120s
    ↓ status === 'complete'
    ↓
Arc MessageTransmitter.receiveMessage(message, attestation)
    ↓ permissionless call
    ↓
Arc USDC Mint to merchant
```

Decision gate: `scripts/test-cctp-domain7.ts` smoke test
- PASS (exit 0) → set `BRIDGE_MODE=CCTP`
- FAIL (exit 1) → set `BRIDGE_MODE=ADMIN_RELAY`

**ADMIN_RELAY Path (Fallback)**
```
BSC SwapCompleted event
    ↓ poll receipt for 30s
    ↓
Supabase Idempotency Guard
    check status === 'PENDING'
    ↓ atomic update to 'SWAP_EXECUTING'
    ↓
Arc Admin Wallet Transfer
    USDC.transfer(merchantWallet, netUSDCAmount)
    ↓
Arc USDC received by merchant
```

Idempotency: Supabase `.eq("status", "PENDING")` atomic update prevents duplicate transfers on retry.

### 6. Data Flow

**Request Flow: Payment Initiation**
```
1. Customer → /pay/[id]
2. Page loads sessionId from URL
3. POST /api/agent/quote { sessionId, merchantWallet, targetUSDC, ... }
4. Backend:
   a. fetchSpotPrice() → PancakeSwap V3 Quoter on BSC
   b. calculateSwapParams() → apply slippage + fees
   c. updateSessionStatus() → cache to Supabase
   d. return SwapParams JSON
5. Frontend shows FeeBreakdownCard
6. Customer clicks "Pay X tBNB"
```

**Request Flow: Payment Execution**
```
1. Customer signs SwapRouter.swapAndBridge() tx via MetaMask
2. Tx submitted to BSC Testnet
3. Frontend opens EventSource: POST /api/agent/execute { sessionId, swapTxHash, ... }
4. Backend SSE stream:
   a. emit swap_executing
   b. pollSwapCompleted(swapTxHash) → wait 30s
   c. emit bridging
   d. branch on BRIDGE_MODE:
      - CCTP: extractMessageHash → pollAttestation → receiveMessage on Arc
      - ADMIN_RELAY: adminRelay(merchant, netUSDC, sessionId)
   e. emit confirmed
   f. awardPoints()
5. Frontend closes EventSource, shows receipt
```

**Merchant Dashboard Flow**
```
1. Merchant → /dashboard
2. Connect wallet via wagmi
3. Display:
   a. QRCodeGenerator: encodes sessionId + merchantWallet + targetUSDC + expiry (60s)
   b. Supabase real-time: listen to payment_sessions filtered by merchant_wallet
      → PaymentFeedTable updates as new transactions confirmed
   c. GET /api/points?wallet={address} → display points + tier
```

---

## Key Design Decisions

### 1. BRIDGE_MODE Abstraction
Allows graceful fallback without code changes:
- CCTP primary (if smoke test PASS)
- ADMIN_RELAY fallback (if smoke test FAIL or during development)
- Set at deployment time via `.env` variable

### 2. Atomic Idempotency via Supabase
- `session_id` unique constraint prevents duplicate rows
- `status === 'PENDING'` check + `.eq("status", "PENDING")` atomic update in adminRelay()
- Prevents race conditions on network retries

### 3. Quote Caching
- SwapParams cached in `payment_sessions.swap_params` (JSONB)
- `/execute` endpoint retrieves cached params → no recalculation risk
- Ensures signed tx matches quote returned to customer

### 4. Off-Chain Math
- All floating-point calculations in TypeScript (`lib/agent.ts`)
- Final integer `amountInMaximumWei` passed to contract
- Zero floating-point math in Solidity

### 5. Server-Side Rendering Disabled
- Payment page and dashboard are `'use client'` (client-side only)
- Wagmi provider requires browser environment
- No SSR complications for wallet connect

---

## Security Considerations

### Authentication & Authorization
- Phase 1: wallet-based identity (no auth system)
- Dashboard accessed by wallet address only
- No secret keys exposed client-side

### Private Key Management
- Admin wallet key in `AIG_ADMIN_WALLET_PRIVATE_KEY` env var only
- Used server-side in `/api/agent/execute` (Node.js context)
- Never logged or exposed in logs

### Input Validation
- sessionId format validated (hex 32-byte)
- walletAddress validated (checksum, length)
- targetUSDC validated (positive, bounded)

### Transaction Security
- `waitForTransactionReceipt()` confirms finality before bridging
- `pollSwapCompleted()` timeout: 30s (prevents hanging)
- `pollAttestation()` timeout: 120s (CCTP attestation grace period)

---

## Performance Notes

- Quote endpoint: <500ms (PancakeSwap Quoter RPC call)
- SSE polling: every 2-5s (viem default interval)
- Supabase queries: <200ms (indexed on session_id)
- QR refresh: 60s interval (reasonable for PoC)

---

## Future Improvements

- Multi-chain Quoter aggregation (1inch, 0x)
- Batch session processing (reduce RPC calls)
- Persistent QR sessions (replace 60s expiry with DB record)
- Webhook notifications (real-time settlement alerts)
- Points reward distribution contract
