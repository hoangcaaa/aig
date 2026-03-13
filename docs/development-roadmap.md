# AIG Development Roadmap

Living document tracking project phases, milestones, and progress.

## Phase 1 MVP — Core Payment Infrastructure

**Status:** ✓ COMPLETE — 2026-03-13

### Completed Milestones

| Milestone | Status | Notes |
|-----------|--------|-------|
| Foundation setup (smoke test, quote endpoint, session management) | ✓ | All TypeScript TODOs completed |
| ADMIN_RELAY fallback path | ✓ | Atomic idempotency + balance verification |
| CCTP primary path | ✓ | BSC → Arc, Circle attestation integrated |
| UI implementation (payment page + dashboard) | ✓ | Mobile-first, real-time progress, QR code |
| Contract deployment (SwapRouter.sol to BSC Testnet) | ✓ | BRIDGE_MODE-aware, Foundry script ready |
| Security hardening | ✓ | Atomic guards, input validation, key management |

### Deliverables

**Backend APIs**
- `POST /api/agent/quote` — fetch spot price, calculate swap params, cache to Supabase
- `POST /api/agent/execute` — SSE stream: swap_executing → bridging → confirmed (conditional on BRIDGE_MODE)
- `GET /api/points` — points balance for merchant dashboard

**Frontend Pages**
- `/` — landing page
- `/pay/[id]` — customer payment interface (mobile-first, connects wallet, shows progress)
- `/dashboard` — merchant dashboard (QR, payment feed, points)

**Smart Contracts**
- `SwapRouter.sol` (BSC Testnet) — exactOutputSingle + refund mechanism, CCTP/ADMIN_RELAY dual mode

**Smoke Test**
- `scripts/test-cctp-domain7.ts` — 7-step end-to-end CCTP validation (gate for BRIDGE_MODE decision)

---

## Phase 2 — Scaling & Optimization (Future)

**Target Status:** Planned

### Key Areas
- Multi-chain support (Polygon, Ethereum, Arbitrum)
- Points distribution system (rewards for merchants/affiliates)
- Admin dashboard (fee management, settlement)
- Enhanced error recovery (grace period for bridge retries)
- Webhook notifications (transaction updates)

### Estimated Effort
- 40-60 hours
- Q2 2026

---

## Phase 3 — Production Hardening (Future)

**Target Status:** Planned

### Key Areas
- Smart contract audit (external firm)
- Mainnet deployment preparation
- Rate limiting & abuse prevention
- KYC/AML integration
- Settlement & reconciliation workflows
- Monitoring & alerting system

### Estimated Effort
- 80-120 hours
- Q3 2026

---

## Success Metrics (Phase 1)

✓ Smoke test exits 0 (CCTP PASS) or 1 (ADMIN_RELAY FALLBACK)
✓ Quote endpoint returns correct fee breakdown (<500ms latency)
✓ Payment page mobile-friendly, connects to MetaMask, submits swap
✓ SSE stream updates progress bar in real-time
✓ SwapRouter deployed to BSC Testnet, callable via cast
✓ End-to-end flow: QR → payment page → sign → swap → bridge → confirmed
✓ No TypeScript compilation errors
✓ All security checks passed

---

## Dependencies & Blockers

**Phase 1 Blockers (RESOLVED)**
- CCTP Domain 7 support on Arc Testnet (GATE: smoke test)
- PancakeSwap V3 liquidity on BSC Testnet (low-risk)
- Supabase availability (high-availability cloud service)

**Phase 2+ Blockers**
- Multi-chain RPC reliability
- Circle CCTP expansion to additional chains
- Points distribution contract (new development)

---

## Timeline

- **Phase 1 Start:** 2026-03-12
- **Phase 1 End:** 2026-03-13 (COMPLETE)
- **Phase 2 Target:** 2026-Q2
- **Phase 3 Target:** 2026-Q3
- **Mainnet Launch Target:** 2026-Q4

---

## Notes

Phase 1 achieved all MVP requirements. Foundation is solid for scale-up in Phase 2+. BRIDGE_MODE abstraction allows graceful fallback to ADMIN_RELAY if CCTP issues emerge.
