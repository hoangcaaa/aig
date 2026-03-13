---
title: "AIG Phase 1 MVP Implementation"
description: "Complete all TypeScript TODOs, split API endpoints, build UI, deploy SwapRouter.sol to BSC Testnet"
status: complete
priority: P0
effort: 24h
issue: ""
branch: ""
tags: [blockchain, viem, supabase, next.js, cctp, pancakeswap]
created: 2026-03-12
---

# AIG Phase 1 MVP Implementation Plan

## Overview

SwapRouter.sol is fully implemented. All remaining work is TypeScript + UI.
Critical path: Foundation → ADMIN_RELAY path → CCTP path (conditional) → UI → Deploy.

## Phases

| # | Phase | Status | Effort | Link |
|---|-------|--------|--------|------|
| 1 | Foundation (smoke test, fetchSpotPrice, updateSession, route refactor) | Complete | 5h | [phase-01](./phase-01-foundation.md) |
| 2 | ADMIN_RELAY Path (pollSwapCompleted, adminRelay transfer, balance check) | Complete | 4h | [phase-02-admin-relay.md](./phase-02-admin-relay.md) |
| 3 | CCTP Path (extractMessageHash, receiveMessage, extractRawMessage) | Complete | 4h | [phase-03-cctp-path.md](./phase-03-cctp-path.md) |
| 4 | UI (payment page, merchant dashboard) | Complete | 8h | [phase-04-ui.md](./phase-04-ui.md) |
| 5 | Contract Deployment (Deploy.s.sol, forge broadcast) | Complete | 3h | [phase-05-deploy.md](./phase-05-deploy.md) |

## Execution Strategy

```
Phase 1 (required first)
    ↓
Phase 2 ──── Phase 4 (parallel — UI has no runtime dep on Phase 2/3)
    ↓
Phase 3 (only if CCTP smoke test PASS — skip if ADMIN_RELAY confirmed)
    ↓
Phase 5 (deploy last — needs SWAP_ROUTER_ADDRESS_BSC)
```

Phase 2 + Phase 4 can be developed in parallel after Phase 1 completes.

## Dependencies

- `viem` installed in frontend workspace
- `@supabase/supabase-js` installed in frontend workspace
- Supabase `payment_sessions` table created (schema in Phase 1)
- All `.env.local` vars populated (see `.env.example`)
- Foundry installed for Phase 5
