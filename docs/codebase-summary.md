# AIG Codebase Summary

Overview of key files, modules, and their responsibilities.

## Directory Structure

```
aig_project/
├── frontend/                              # Next.js 14 App Router
│   ├── app/
│   │   ├── page.tsx                      # Landing page
│   │   ├── layout.tsx                    # Root layout + WagmiProvider
│   │   ├── pay/[id]/page.tsx             # Payment page (mobile-first)
│   │   ├── dashboard/page.tsx            # Merchant dashboard
│   │   └── api/
│   │       ├── agent/
│   │       │   ├── quote/route.ts        # POST /api/agent/quote
│   │       │   └── execute/route.ts      # POST /api/agent/execute (SSE)
│   │       └── points/route.ts           # GET /api/points
│   ├── components/
│   │   ├── fee-breakdown-card.tsx        # Quote display component
│   │   ├── payment-progress-bar.tsx      # SSE-driven progress steps
│   │   ├── qr-code-generator.tsx         # QR code + refresh logic
│   │   ├── payment-feed-table.tsx        # Real-time transaction table
│   │   └── dashboard-stat-cards.tsx      # Analytics stats: revenue, transactions, success rate, volume
│   ├── lib/
│   │   ├── agent.ts                      # fetchSpotPrice, updateSessionStatus, calculateSwapParams
│   │   ├── chains.ts                     # getArcChain() Arc Testnet definition
│   │   ├── mock-bridge.ts                # pollSwapCompleted, adminRelay, verifyAdminWalletBalance
│   │   ├── cctp.ts                       # extractMessageHash, receiveMessage, extractRawMessage, pollAttestation
│   │   ├── points.ts                     # awardPoints, getPointsBalance
│   │   └── merchant.ts                   # upsertMerchant, getMerchantStats
│   ├── tsconfig.json                     # ES2020, strict mode
│   ├── package.json                      # viem, wagmi, react-query, supabase, qrcode.react deps
│   └── .env.example                      # All env vars documented
│
├── contracts/                             # Solidity + Foundry
│   ├── src/
│   │   ├── SwapRouter.sol                # Main contract: exactOutputSingle + refund + CCTP/ADMIN_RELAY branching
│   │   └── interfaces/
│   │       ├── IERC20.sol
│   │       ├── IWBNB.sol
│   │       ├── IPancakeV3Router.sol
│   │       └── ICCTPTokenMessenger.sol
│   ├── test/
│   │   └── SwapRouter.t.sol              # Foundry tests
│   ├── scripts/
│   │   └── Deploy.s.sol                  # Deployment script (BRIDGE_MODE-aware)
│   ├── foundry.toml
│   └── .env.example
│
├── scripts/                               # Standalone validation scripts
│   ├── test-cctp-domain7.ts              # 7-step CCTP smoke test (GATE for BRIDGE_MODE)
│   ├── package.json
│   └── tsconfig.json
│
├── plans/
│   ├── 260312-1301-aig-phase1-implementation/
│   │   ├── plan.md                       # Phase 1 overview + phase status table
│   │   ├── phase-01-foundation.md        # Smoke test, quote, session, route refactor
│   │   ├── phase-02-admin-relay.md       # pollSwapCompleted, adminRelay, balance check
│   │   ├── phase-03-cctp-path.md         # extractMessageHash, receiveMessage
│   │   ├── phase-04-ui.md                # Payment page, dashboard, components
│   │   └── phase-05-deploy.md            # SwapRouter deployment, contract safety
│   └── reports/
│       └── (scout/researcher/reviewer reports)
│
├── docs/
│   ├── project-changelog.md              # Detailed change history + Phase 1 summary
│   ├── development-roadmap.md            # Milestones, timeline, Phase 2/3 planning
│   ├── system-architecture.md            # Architecture diagrams, component breakdown, data flow
│   └── codebase-summary.md               # This file
│
├── .env.example                          # Root-level env var reference
├── .gitignore                            # Excludes .env.local, node_modules, etc.
├── README.md                             # Project overview + quick start
└── CLAUDE.md                             # Instructions for Claude Code
```

---

## Key Files & Responsibilities

### Core Business Logic

**frontend/lib/agent.ts**
- `fetchSpotPrice()` — PancakeSwap V3 Quoter query, returns USDC/BNB price
- `calculateSwapParams()` — applies 0.5% slippage + 0.1% AIG fee
- `updateSessionStatus()` — Supabase upsert with JSONB swap_params cache
- Singleton Supabase client initialization

**frontend/lib/chains.ts**
- `getArcChain()` — viem defineChain for Arc Testnet (ID: 212)
- Used by both mock-bridge.ts and cctp.ts to avoid duplication

**frontend/lib/mock-bridge.ts**
- `pollSwapCompleted(sessionId, txHash, timeout)` — viem receipt parsing, SwapCompleted event extraction
- `adminRelay(merchantWallet, usdcAmount, sessionId)` — Supabase idempotency + Arc USDC transfer
- `verifyAdminWalletBalance()` — logs warning if balance < 50 USDC

**frontend/lib/cctp.ts**
- `extractMessageBytesFromReceipt()` — internal helper, parses MessageSent(bytes) log
- `extractMessageHash()` — returns keccak256(messageBytes)
- `extractRawMessage()` — returns raw bytes hex string
- `receiveMessage(message, attestation)` — Arc MessageTransmitter.receiveMessage() call
- `pollAttestation()` — Circle API integration (already implemented)

**frontend/lib/points.ts**
- `awardPoints(merchantWallet, targetUSDC)` — inserts points_ledger row + updates points_balance
- `getPointsBalance(wallet)` — returns { totalPoints, tier }
- Trigger on confirmed payments

**frontend/lib/merchant.ts**
- `upsertMerchant(walletAddress, businessName)` — creates or updates merchant profile in merchants table
- `getMerchantStats(walletAddress)` — returns analytics stats (totalRevenue, transactionCount, successRate, recentVolume)
- Queries payment_sessions filtered by merchant_wallet + status='CONFIRMED'

### API Routes

**frontend/app/api/agent/quote/route.ts**
- `POST /api/agent/quote`
- Returns: SwapParams (amountInMaximumWei, grossUSDC, fee, netUSDC, poolFee, spotPrice)
- Caches to Supabase payment_sessions

**frontend/app/api/agent/execute/route.ts**
- `POST /api/agent/execute` (SSE streaming response)
- Body: { sessionId, swapTxHash, merchantWallet, targetUSDC }
- Conditional bridge: CCTP vs ADMIN_RELAY
- Emits: swap_executing → bridging → confirmed (or bridge_delayed)

**frontend/app/api/points/route.ts**
- `GET /api/points?wallet=0x...`
- Returns: { totalPoints, tier }

**frontend/app/api/dashboard/route.ts**
- `GET /api/dashboard?wallet=0x...`
- Returns: { merchantProfile, analyticsStats }
- merchantProfile: { wallet, businessName, createdAt }
- analyticsStats: { totalRevenue, transactionCount, successRate, recentVolume }

### UI Pages

**frontend/app/page.tsx**
- Landing page with hero, features, CTA

**frontend/app/pay/[id]/page.tsx**
- `'use client'` — client-side only
- Wagmi `useAccount`, `useWriteContract`
- Load session from URL [id]
- Call `/api/agent/quote` on mount → FeeBreakdownCard
- Submit SwapRouter.swapAndBridge() tx → open EventSource
- PaymentProgressBar tracks SSE events
- Receipt screen on confirmed

**frontend/app/dashboard/page.tsx**
- `'use client'` — client-side only
- Wagmi connect button
- Display merchant profile (business name from /api/dashboard)
- DashboardStatCards with analytics data (total revenue, transactions, success rate, recent volume)
- QRCodeGenerator with 60s refresh
- Supabase real-time subscription to payment_sessions
- Points balance via `/api/points`

### UI Components

**components/fee-breakdown-card.tsx**
- Props: { grossUSDC, aigFee, netUSDC, amountBNB, targetUSDC }
- Displays quote breakdown before signing

**components/payment-progress-bar.tsx**
- Props: SSE event stream
- Displays: Swap → Bridge → Confirmed steps
- Lights up each step as events arrive

**components/qr-code-generator.tsx**
- Props: { merchantWallet, targetUSDC }
- Uses qrcode.react
- Auto-refresh every 60s
- Encodes: { sessionId, merchantWallet, targetUSDC, expiry }

**components/payment-feed-table.tsx**
- Props: transactions array (from Supabase real-time)
- Columns: timestamp, amount, bridge mode, tx hash, status

### Smart Contracts

**contracts/src/SwapRouter.sol**
- Constructor args: wbnb, usdc, pancakeRouter, cctpMessenger (or 0x0), revenuePool
- `swapAndBridge(sessionId, grossUSDC, aigFee, amountInMax, poolFee, merchantBytes32, merchantAddr)` payable
- Logic:
  1. Wrap BNB → WBNB
  2. Approve WBNB to PancakeSwap V3 Router
  3. Call exactOutputSingle (output = grossUSDC)
  4. Emit SwapCompleted event
  5. Refund unused WBNB
- Dual-mode: CCTP-aware (checks cctpMessenger != address(0))

**contracts/src/interfaces/**
- IERC20.sol — ERC-20 standard (balanceOf, transfer, approve, etc.)
- IWBNB.sol — WBNB deposit/withdraw
- IPancakeV3Router.sol — exactOutputSingle interface
- ICCTPTokenMessenger.sol — CCTP messenger interface

**contracts/scripts/Deploy.s.sol**
- Foundry Script contract
- Reads all constructor args from env vars
- Conditional logic: if BRIDGE_MODE=ADMIN_RELAY, pass address(0) as cctpMessenger
- Logs deployed address

### Test Files

**scripts/test-cctp-domain7.ts**
- 7-step smoke test:
  1. Initial Arc USDC balance
  2. Approve TokenMessenger
  3. depositForBurn on BSC
  4. Extract MessageSent log → compute hash
  5. Poll Circle attestation API (5s interval, 120s timeout)
  6. receiveMessage on Arc
  7. Verify balance increased
- Exit 0 (PASS) → BRIDGE_MODE=CCTP
- Exit 1 (FAIL) → BRIDGE_MODE=ADMIN_RELAY

**contracts/test/SwapRouter.t.sol**
- Foundry unit tests for SwapRouter.sol

---

## Dependencies

### Frontend
- `next@16.1.6` — React 19 framework
- `react@19` — UI library
- `typescript@5` — type safety
- `tailwindcss@4` — CSS framework
- `viem` — blockchain interaction (Ethereum client)
- `wagmi` — wallet connection + contract writes (v2)
- `@supabase/supabase-js` — Supabase client
- `@tanstack/react-query` — required by wagmi v2
- `qrcode.react` — QR code rendering

### Scripts
- `ts-node` — TypeScript runner
- `viem` — blockchain client

### Contracts
- Foundry — Solidity compilation, testing, deployment

---

## Configuration Files

**tsconfig.json** (frontend)
- Target: ES2020
- Strict mode: true
- Path aliases: `@/` → `./`

**foundry.toml** (contracts)
- Solidity version: ^0.8.24
- Optimizer: enabled

**.env.example** (root + frontend)
- RPC URLs: BSC_TESTNET_RPC_URL, ARC_TESTNET_RPC_URL, NEXT_PUBLIC_BSC_TESTNET_RPC_URL
- Contract addresses: WBNB_ADDRESS_BSC, USDC_ADDRESS_BSC_TESTNET, PANCAKESWAP_V3_QUOTER_BSC, PANCAKESWAP_V3_ROUTER_BSC
- CCTP: CCTP_TOKEN_MESSENGER_BSC, CCTP_MESSAGE_TRANSMITTER_ARC
- Supabase: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
- Keys: AIG_ADMIN_WALLET_PRIVATE_KEY, AIG_ADMIN_WALLET_ADDRESS, DEPLOYER_PRIVATE_KEY
- Bridge mode: BRIDGE_MODE (CCTP or ADMIN_RELAY)
- Revenue: AIG_REVENUE_POOL_ADDRESS

---

## Code Standards

### Naming
- Files: kebab-case with descriptive names (e.g., `payment-progress-bar.tsx`)
- Functions: camelCase
- Constants: UPPER_SNAKE_CASE
- Types/Interfaces: PascalCase

### Error Handling
- try/catch for async operations
- Supabase: check for .error before returning
- viem: catches timeouts automatically, wrapped in error handlers
- SSE: emit error event on exception

### Type Safety
- TypeScript strict mode enabled
- Interfaces for API request/response bodies
- Type-safe Supabase queries (generated schema types if available)

### Testing
- Foundry tests for contracts (forge test)
- Smoke test for CCTP (test-cctp-domain7.ts) — gates BRIDGE_MODE

---

## Performance & Optimization

- Quote caching: swap_params stored in Supabase → no recalculation
- Polling intervals: 2-5s for SSE, 5s for Circle attestation, 2s for Quoter cache
- RPC optimization: batch calls where possible (Promise.all)
- Component splitting: pay page and dashboard are separate routes

---

## Security Summary

✓ Private keys in env vars only (never hardcoded)
✓ Service role key server-side only (never client-side)
✓ Atomic idempotency guard in adminRelay()
✓ Input validation on all API endpoints
✓ Transaction finality checks (waitForTransactionReceipt)
✓ Timeout guards on all polling (30-120s)

---

## Known Limitations

- Phase 1 PoC: ADMIN_RELAY disabled on mainnet
- QR expiry: 60s (no persistent session storage)
- Dashboard: wallet-based identity (no auth system)
- Points: placeholder logic (no distribution mechanism yet)
- Multi-chain: BSC Testnet only (Arc Testnet for bridge destination)

---

## Deployment Checklist

- [ ] `.env.local` populated (all vars from .env.example)
- [ ] Supabase tables created (payment_sessions, points_ledger, points_balance)
- [ ] Smoke test passed or acknowledged as FAIL
- [ ] BRIDGE_MODE set (CCTP or ADMIN_RELAY)
- [ ] SwapRouter deployed to BSC Testnet (save address to env)
- [ ] Admin wallet funded with testUSDC on Arc (for ADMIN_RELAY mode)
- [ ] `npm run dev` starts without errors
- [ ] Manual end-to-end test: QR → payment → SSE → confirmed
