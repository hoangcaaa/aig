# AIG Project Changelog

All significant changes, features, and fixes documented here.

## [Phase 1 MVP] — 2026-03-13

### Implementation Complete

**Phase 1 Foundation** ✓
- Smoke test implementation: `scripts/test-cctp-domain7.ts` — 7-step CCTP validation flow
- `fetchSpotPrice()` — PancakeSwap V3 QuoterV2 integration for real-time spot price quotes
- `updateSessionStatus()` — Supabase atomic upsert with swap params caching (JSONB)
- Route refactor: split `/api/agent/route.ts` → `/api/agent/quote/route.ts` + `/api/agent/execute/route.ts`
- Payment sessions table schema created with idempotency guard via `session_id` unique constraint
- TypeScript config: ES2020 target, strict mode, path aliases

**Phase 2 ADMIN_RELAY Path** ✓
- `pollSwapCompleted()` — viem receipt parsing for SwapCompleted event on BSC Testnet
- `adminRelay()` — atomic idempotency: checks Supabase `status === 'PENDING'` before transfer on Arc Testnet
- `verifyAdminWalletBalance()` — warns (non-blocking) when balance < 50 USDC
- `getArcChain()` helper — custom viem chain definition for Arc Testnet (ID: 212)
- SSE stream implementation: swap_executing → bridging → confirmed flow

**Phase 3 CCTP Path** ✓
- `extractMessageHash()` — parses MessageSent(bytes) event log from BSC receipt, returns keccak256 hash
- `receiveMessage()` — viem walletClient.writeContract on Arc Testnet (MessageTransmitter)
- `extractRawMessage()` — exports raw message bytes from same receipt fetch
- `pollAttestation()` — Circle API integration (already implemented, 120s timeout)
- Full CCTP pipeline: BSC burn → attestation → Arc mint → confirmed

**Phase 4 UI Components** ✓
- Landing page: `/frontend/app/page.tsx`
- Payment page: `/frontend/app/pay/[id]/page.tsx` — mobile-first, fee breakdown, SSE progress bar
- Merchant dashboard: `/frontend/app/dashboard/page.tsx` — QR generator (60s refresh), payment feed, points balance
- Components created:
  - `fee-breakdown-card.tsx` — quote display with line items
  - `payment-progress-bar.tsx` — SSE-driven 3-step progress (Swap → Bridge → Confirmed)
  - `qr-code-generator.tsx` — QR encode + auto-refresh logic
  - `payment-feed-table.tsx` — real-time payment feed with timestamps
- wagmi provider setup in layout.tsx (v2 compatible)
- Points balance API: `/frontend/app/api/points/route.ts`

**Phase 5 Contract Deployment** ✓
- `Deploy.s.sol` — Foundry script with BRIDGE_MODE branch logic
- Constructor args read from env vars (no hardcoding): WBNB, USDC, PancakeRouter, CCTP messenger (or 0x0 for ADMIN_RELAY), revenue pool
- Deployment flow: dry-run → broadcast → save address to `.env.local` + `NEXT_PUBLIC_SWAP_ROUTER_ADDRESS_BSC`

### Dependencies Installed
- Frontend: `viem`, `@supabase/supabase-js`, `wagmi`, `@tanstack/react-query`, `qrcode.react`
- Scripts: `viem`, Circle CCTP integration tested

### Configuration
- `.env.example` updated with all Phase 1 vars: RPC URLs, contract addresses, BRIDGE_MODE, auth keys
- TypeScript strict mode, ES2020 target
- Tailwind 4 CSS framework

### Security Fixes
- Atomic idempotency in `adminRelay()`: `status === 'PENDING'` check + `.eq("status", "PENDING")` atomic update prevents race conditions
- Private key validation: only from env vars, never hardcoded
- Input validation: sessionId, walletAddress, amountUSDC all validated in API routes
- Service role key (Supabase) never exposed client-side

### Known Limitations (Phase 1 PoC)
- ADMIN_RELAY mode disabled on mainnet (fallback only for testnet)
- No authentication on dashboard (wallet-based identity sufficient for PoC)
- QR payload includes expiry (60s window) — no persistent storage of generated sessions
- Points system placeholder — awaiting Phase 2 reward distribution logic

---

## Legend

- ✓ = Complete
- ⚠ = In Progress / Pending
- ✗ = Blocked / Deferred
