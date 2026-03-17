---
title: "Dashboard Real Data — Merchants + Analytics"
description: "Add merchants table, dashboard analytics API, and wire stat cards to real Supabase data"
status: complete
priority: P1
effort: 3h
branch: main
tags: [supabase, dashboard, api, merchants]
created: 2026-03-15
completed: 2026-03-15
---

# Dashboard Real Data

Replace static dashboard with real merchant analytics from Supabase.

## Phases

| # | Phase | Status | Effort | File |
|---|-------|--------|--------|------|
| 1 | Schema — merchants table + migration 003 | Complete | 30m | [phase-01](./phase-01-schema-migration.md) |
| 2 | API — GET /api/dashboard analytics endpoint | Complete | 1h | [phase-02](./phase-02-api-dashboard-route.md) |
| 3 | UI — Stat cards + merchant auto-register | Complete | 1.5h | [phase-03](./phase-03-ui-stat-cards.md) |

## Dependencies

- Supabase project with existing migrations 001 (payment_sessions) and 002 (points)
- `@supabase/supabase-js` already in frontend deps
- wagmi wallet connection already working in dashboard

## Key Decisions

1. **No separate merchant auth** — wallet address = merchant identity (PRD Phase 1)
2. **Upsert on connect** — merchant row created automatically on first dashboard visit
3. **Server-side aggregation** — analytics computed via Supabase SQL, not client-side
4. **customer_wallet column** — added to payment_sessions for future customer-facing features
