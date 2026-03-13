# ARC Invisible Gateway (AIG)

> Pay with anything. Receive USDC. Invisibly.

Cross-chain payment infrastructure: customers pay with any token on BSC, merchants receive exact USDC on Arc Network. An AI agent handles swap + bridge automatically.

## Monorepo Structure

```
/aig_project
├── /frontend                          # Next.js 16 (App Router) + AI Agent API
│   ├── app/
│   │   ├── page.tsx                   # Landing page
│   │   ├── dashboard/page.tsx         # Merchant dashboard
│   │   ├── pay/[id]/page.tsx          # Customer payment page
│   │   └── api/
│   │       ├── agent/quote/route.ts   # POST /api/agent/quote
│   │       ├── agent/execute/route.ts # POST /api/agent/execute (SSE)
│   │       └── points/route.ts        # POST /api/points
│   ├── lib/
│   │   ├── agent.ts                   # calculateSwapParams, updateSessionStatus
│   │   ├── cctp.ts                    # pollAttestation, receiveMessage
│   │   ├── mock-bridge.ts             # adminRelay (ADMIN_RELAY fallback)
│   │   ├── points.ts                  # awardPoints, getPointsBalance
│   │   └── chains.ts                  # Arc Testnet chain definition
│   └── supabase/migrations/           # SQL migrations (run before starting)
├── /contracts                         # Foundry — SwapRouter.sol (BSC Testnet)
├── /scripts                           # Standalone scripts + smoke tests
│   ├── test-cctp-domain7.ts           # CCTP Domain 7 smoke test (run first)
│   └── setup.sh                       # One-shot project setup
├── .env.example                       # All required env vars documented here
└── README.md
```

## Quick Start

```bash
# From repo root — sets up everything
bash scripts/setup.sh
```

Then fill in all values in `frontend/.env.local`, run the migrations, and start:

```bash
cd frontend && npm run dev
```

### Manual steps (if not using setup.sh)

**1. Copy env vars**
```bash
cp .env.example frontend/.env.local
# Fill in all values before running anything
```

**2. Run Supabase migrations** (in your Supabase SQL editor)
```
frontend/supabase/migrations/001_create_payment_sessions.sql
frontend/supabase/migrations/002_create_points_tables.sql
```

**3. CCTP Domain 7 Gate** (run before any feature dev)
```bash
cd scripts && npm run test:cctp
# EXIT 0 = PASS -> set BRIDGE_MODE=CCTP in .env.local
# EXIT 1 = FAIL -> set BRIDGE_MODE=ADMIN_RELAY in .env.local
```

**4. Contracts** (requires Foundry)
```bash
cd contracts && forge build && forge test
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/agent/quote` | Returns `SwapParams` JSON, caches to Supabase |
| `POST` | `/api/agent/execute` | SSE stream — executes swap + bridge pipeline |
| `POST` | `/api/points` | Award or query points for a wallet |

**Quote request body:**
```json
{ "sessionId": "...", "merchantWallet": "0x...", "targetUSDC": 10, "customerWallet": "0x...", "sourceChain": "bsc", "sourceToken": "BNB" }
```

**Execute request body:**
```json
{ "sessionId": "...", "swapTxHash": "0x...", "merchantWallet": "0x...", "targetUSDC": 10 }
```

## Pages

| Path | Description |
|------|-------------|
| `/` | Landing page |
| `/pay/[id]` | Customer payment page (session-scoped) |
| `/dashboard` | Merchant dashboard |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `BSC_TESTNET_RPC_URL` | BSC Testnet RPC endpoint |
| `ARC_TESTNET_RPC_URL` | Arc Testnet RPC endpoint |
| `ARC_CHAIN_ID` | Arc Network chain ID |
| `BRIDGE_MODE` | `CCTP` or `ADMIN_RELAY` (set after smoke test) |
| `CCTP_TOKEN_MESSENGER_BSC` | CCTP TokenMessenger on BSC |
| `CCTP_MESSAGE_TRANSMITTER_ARC` | CCTP MessageTransmitter on Arc |
| `USDC_ADDRESS_BSC_TESTNET` | testUSDC on BSC Testnet |
| `USDC_ADDRESS_ARC_TESTNET` | testUSDC on Arc Testnet |
| `PANCAKESWAP_V3_ROUTER_BSC` | PancakeSwap V3 SwapRouter |
| `PANCAKESWAP_V3_QUOTER_BSC` | PancakeSwap V3 QuoterV2 |
| `WBNB_ADDRESS_BSC` | Wrapped BNB on BSC Testnet |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (client-safe) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only) |
| `AIG_ADMIN_WALLET_PRIVATE_KEY` | Admin relay wallet (ADMIN_RELAY mode only) |
| `SWAP_ROUTER_ADDRESS_BSC` | Deployed SwapRouter.sol address (after Phase 5) |
| `TEST_PRIVATE_KEY` | Testnet-only key for smoke test |

See `.env.example` for the full list with descriptions.

## Architecture

- **Primary path** (`BRIDGE_MODE=CCTP`): BSC swap via PancakeSwap V3 → CCTP burn → Arc mint → merchant receives USDC
- **Fallback path** (`BRIDGE_MODE=ADMIN_RELAY`): BSC swap → admin wallet relays testUSDC on Arc (PoC only, disabled on mainnet)
- Arc CCTP Domain ID: **7**

See `PRD final.md` for full specification.
