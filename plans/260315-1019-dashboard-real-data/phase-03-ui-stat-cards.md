# Phase 3: UI — Stat Cards + Merchant Auto-Register

## Context
- [Phase 2 API](./phase-02-api-dashboard-route.md) must be working first
- Dashboard: `frontend/app/dashboard/page.tsx` (150 lines, under limit)
- Dashboard already fetches `/api/points` on wallet connect

## Overview
- **Priority:** P1
- **Status:** Complete
- Add analytics stat cards row to dashboard, fetching from GET /api/dashboard
- Merchant auto-registered on first API call (upsert in Phase 2)

## Architecture
- New component `dashboard-stat-cards.tsx` receives stats as props
- Dashboard page fetches `/api/dashboard?wallet=` alongside existing `/api/points` call
- No new state management — simple useState + useEffect pattern (matches existing code)

## Implementation Steps

### 1. Create stat cards component
- **File to create:** `frontend/components/dashboard-stat-cards.tsx`

```typescript
"use client";

interface StatCardsProps {
  totalRevenue: number;
  transactionCount: number;
  successRate: number;
  recentVolume: number;
  loading: boolean;
}

const cards = [
  { key: "totalRevenue", label: "Total Revenue", format: (v: number) => `$${v.toFixed(2)}` },
  { key: "transactionCount", label: "Transactions", format: (v: number) => v.toString() },
  { key: "successRate", label: "Success Rate", format: (v: number) => `${v}%` },
  { key: "recentVolume", label: "7d Volume", format: (v: number) => `$${v.toFixed(2)}` },
] as const;

export function DashboardStatCards({ loading, ...stats }: StatCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div key={card.key} className="bg-white rounded-2xl shadow-sm p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">{card.label}</p>
          <p className="text-xl font-bold text-gray-900 mt-1">
            {loading ? "—" : card.format(stats[card.key])}
          </p>
        </div>
      ))}
    </div>
  );
}
```

### 2. Update dashboard page
- **File:** `frontend/app/dashboard/page.tsx`

Changes:
1. Import `DashboardStatCards`
2. Add `DashboardStats` interface and state
3. Fetch `/api/dashboard?wallet=` in existing `useEffect` (parallel with points)
4. Render `<DashboardStatCards>` between header and grid

```typescript
// Add import
import { DashboardStatCards } from "@/components/dashboard-stat-cards";

// Add interface
interface DashboardStats {
  totalRevenue: number;
  transactionCount: number;
  successRate: number;
  recentVolume: number;
}

// Add state (inside component)
const [dashStats, setDashStats] = useState<DashboardStats | null>(null);
const [statsLoading, setStatsLoading] = useState(true);

// Add to useEffect (alongside existing points fetch)
fetch(`/api/dashboard?wallet=${address}`)
  .then((r) => r.json())
  .then((data) => {
    if (!data.error) setDashStats(data.stats);
  })
  .catch(() => null)
  .finally(() => setStatsLoading(false));

// Add JSX between header div and grid div
<DashboardStatCards
  totalRevenue={dashStats?.totalRevenue ?? 0}
  transactionCount={dashStats?.transactionCount ?? 0}
  successRate={dashStats?.successRate ?? 0}
  recentVolume={dashStats?.recentVolume ?? 0}
  loading={statsLoading}
/>
```

## Files

| Action | Path |
|--------|------|
| Create | `frontend/components/dashboard-stat-cards.tsx` |
| Modify | `frontend/app/dashboard/page.tsx` |

## Success Criteria
- [x] 4 stat cards visible on dashboard after wallet connect
- [x] Cards show "—" while loading, real numbers after fetch
- [x] First visit creates merchant row in `merchants` table
- [x] Revenue/count/rate match actual CONFIRMED payment_sessions data
- [x] Layout responsive: 2 cols mobile, 4 cols desktop

## Risk Assessment
- **Low** — additive UI change, no existing functionality modified
- Component is stateless (props only), easy to test
