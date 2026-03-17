"use client";

// =============================================================================
// points-tier-card.tsx — Points & Tier card, Pencil design
// Shows total points, tier progress bar, multiplier, revenue share
// =============================================================================

interface PointsTierCardProps {
  totalPoints: number;
  tier: string;
}

// Tier thresholds for progress bar
const TIER_THRESHOLDS: Record<string, { current: number; next: number; nextName: string }> = {
  Builder: { current: 0, next: 500, nextName: "Architect" },
  Architect: { current: 500, next: 5000, nextName: "Sovereign" },
  Sovereign: { current: 5000, next: 5000, nextName: "Sovereign" },
};

// Tier perks
const TIER_PERKS: Record<string, { multiplier: string; revenueShare: string }> = {
  Builder: { multiplier: "1.0x", revenueShare: "+5% bonus" },
  Architect: { multiplier: "2.0x (Early Bird)", revenueShare: "+10% bonus" },
  Sovereign: { multiplier: "3.0x (Elite)", revenueShare: "+20% bonus" },
};

function TierBadge({ tier }: { tier: string }) {
  return (
    <span className="rounded-full bg-[#E9E3D8] px-2 py-1 font-[family-name:var(--font-jetbrains-mono)] text-sm text-[#804200] leading-none">
      {tier}
    </span>
  );
}

export function PointsTierCard({ totalPoints, tier }: PointsTierCardProps) {
  const thresholds = TIER_THRESHOLDS[tier] ?? TIER_THRESHOLDS.Builder;
  const perks = TIER_PERKS[tier] ?? TIER_PERKS.Builder;
  const isSovereign = tier === "Sovereign";

  // Progress within current tier band
  const progressPct = isSovereign
    ? 100
    : Math.min(
        100,
        Math.round(
          ((totalPoints - thresholds.current) / (thresholds.next - thresholds.current)) * 100
        )
      );

  return (
    <div className="bg-white border border-[#CBCCC9] shadow-[0_1px_1.75px_0_#0000000d]">
      {/* Card header */}
      <div className="flex flex-row items-center justify-between px-6 py-4 border-b border-[#CBCCC9]">
        <span className="font-[family-name:var(--font-jetbrains-mono)] text-base font-semibold text-[#111111]">
          Points &amp; Tier
        </span>
        <TierBadge tier={tier} />
      </div>

      {/* Card body */}
      <div className="px-6 py-6 flex flex-col gap-4">
        {/* Total Points row */}
        <div className="flex flex-row items-center justify-between">
          <span className="font-[family-name:var(--font-geist-sans)] text-[13px] text-[#666666]">
            Total Points
          </span>
          <span className="font-[family-name:var(--font-jetbrains-mono)] text-[13px] font-semibold text-[#111111]">
            {totalPoints.toLocaleString("en-US")} pts
          </span>
        </div>

        {/* Progress section */}
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-row items-center justify-between">
            <span className="font-[family-name:var(--font-geist-sans)] text-[11px] text-[#666666]">
              {isSovereign ? "Max tier reached" : `Next: ${thresholds.nextName}`}
            </span>
            <span className="font-[family-name:var(--font-geist-sans)] text-[11px] text-[#666666]">
              {isSovereign ? "" : `${thresholds.next.toLocaleString("en-US")} pts`}
            </span>
          </div>
          {/* Progress bar */}
          <div className="h-4 bg-[#E7E8E5] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#FF8400] rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Multiplier row */}
        <div className="flex flex-row items-center justify-between">
          <span className="font-[family-name:var(--font-geist-sans)] text-[13px] text-[#666666]">
            Multiplier
          </span>
          <span className="font-[family-name:var(--font-jetbrains-mono)] text-[13px] font-semibold text-[#FF8400]">
            {perks.multiplier}
          </span>
        </div>

        {/* Revenue Share row */}
        <div className="flex flex-row items-center justify-between">
          <span className="font-[family-name:var(--font-geist-sans)] text-[13px] text-[#666666]">
            Revenue Share
          </span>
          <span className="font-[family-name:var(--font-jetbrains-mono)] text-[13px] font-medium text-[#004D1A]">
            {perks.revenueShare}
          </span>
        </div>
      </div>
    </div>
  );
}
