"use client";

// =============================================================================
// fee-breakdown-card.tsx — Displays quote data before customer signs
// Shows all fee components so customer knows exactly what they're paying.
// PRD F-040: fee transparency requirement
// =============================================================================

interface FeeBreakdownCardProps {
  grossUSDCRequired: string;  // raw USDC (6 decimals) as string
  aigServiceFee: string;      // raw USDC (6 decimals) as string
  netUSDCToMerchant: string;  // raw USDC (6 decimals) as string
  amountInMaximumWei: string; // raw BNB wei as string
  spotPriceUSDCPerBNB: number;
  targetUSDC: number;
  onPay: () => void;
  isPaying: boolean;
}

function formatUSDC(raw: string): string {
  return (Number(raw) / 1_000_000).toFixed(2);
}

function formatBNB(wei: string): string {
  return (Number(BigInt(wei)) / 1e18).toFixed(6);
}

export function FeeBreakdownCard({
  netUSDCToMerchant,
  aigServiceFee,
  amountInMaximumWei,
  spotPriceUSDCPerBNB,
  targetUSDC,
  onPay,
  isPaying,
}: FeeBreakdownCardProps) {
  const bnbAmount = formatBNB(amountInMaximumWei);
  const netUSDC = formatUSDC(netUSDCToMerchant);
  const feeUSDC = formatUSDC(aigServiceFee);

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 w-full max-w-sm mx-auto">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Payment Summary</h2>

      <div className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Merchant receives</span>
          <span className="font-medium text-gray-900">${netUSDC} USDC</span>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-500">AIG service fee (0.1%)</span>
          <span className="font-medium text-gray-900">${feeUSDC} USDC</span>
        </div>

        <div className="border-t border-gray-100 pt-3 flex justify-between">
          <span className="text-gray-700 font-medium">You pay</span>
          <span className="font-bold text-gray-900">~{bnbAmount} tBNB</span>
        </div>

        <p className="text-xs text-gray-400 leading-relaxed">
          Includes 0.5% slippage buffer. Rate: {spotPriceUSDCPerBNB.toFixed(2)} USDC/BNB.
          Unused BNB will be auto-refunded to your wallet.
        </p>
      </div>

      <button
        onClick={onPay}
        disabled={isPaying}
        className="mt-6 w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-3 px-4 rounded-xl transition-colors"
      >
        {isPaying ? "Processing..." : `Pay ~${bnbAmount} tBNB`}
      </button>
    </div>
  );
}
