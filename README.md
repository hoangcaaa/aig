# ARC Invisible Gateway (AIG)

> Pay with anything. Receive USDC. Invisibly.

Cross-chain payment infrastructure: customers pay with any token on BSC, merchants receive exact USDC on Arc Network. An AI agent handles swap + bridge automatically.

## Monorepo Structure

```
/aig
├── /frontend      # Next.js 14 (App Router) — UI + AI Agent API Route
├── /contracts     # Solidity + Foundry — SwapRouter.sol (BSC Testnet)
├── /scripts       # Standalone validation scripts
├── .env.example   # All required env vars documented here
└── README.md
```

## Quick Start

### 1. Copy env vars
```bash
cp .env.example frontend/.env.local
# Fill in all values before running anything
```

### 2. CCTP Domain 7 Gate (run FIRST — required before any feature dev)
```bash
cd scripts
npm install
npm run test:cctp
# EXIT 0 = PASS → set BRIDGE_MODE=CCTP
# EXIT 1 = FAIL → set BRIDGE_MODE=ADMIN_RELAY
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```

### 4. Contracts (requires Foundry)
```bash
cd contracts
forge build
forge test
```

## Architecture

- **Primary path** (`BRIDGE_MODE=CCTP`): BSC swap via PancakeSwap V3 → CCTP burn → Arc mint → merchant receives USDC
- **Fallback path** (`BRIDGE_MODE=ADMIN_RELAY`): BSC swap → Admin Wallet relays testUSDC on Arc (PoC only, disabled on mainnet)

See `PRD final.md` for full specification.
