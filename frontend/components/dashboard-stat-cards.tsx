"use client";

// =============================================================================
// dashboard-stat-cards.tsx — Analytics stat cards for merchant dashboard
// Displays: Total Revenue, Transactions, Success Rate, 7d Volume
// =============================================================================

interface StatCardsProps {
  totalRevenue: number;
  transactionCount: number;
  successRate: number;
  recentVolume: number;
  loading: boolean;
}

const cards = [
  {
    key: "totalRevenue" as const,
    label: "Total Revenue",
    format: (v: number) => `$${v.toFixed(2)}`,
  },
  {
    key: "transactionCount" as const,
    label: "Transactions",
    format: (v: number) => v.toString(),
  },
  {
    key: "successRate" as const,
    label: "Success Rate",
    format: (v: number) => `${v}%`,
  },
  {
    key: "recentVolume" as const,
    label: "7d Volume",
    format: (v: number) => `$${v.toFixed(2)}`,
  },
];

export function DashboardStatCards({ loading, ...stats }: StatCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div key={card.key} className="bg-white rounded-2xl shadow-sm p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">
            {card.label}
          </p>
          <p className="text-xl font-bold text-gray-900 mt-1">
            {loading ? "—" : card.format(stats[card.key])}
          </p>
        </div>
      ))}
    </div>
  );
}
