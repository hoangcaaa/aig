"use client";

// =============================================================================
// payment-progress-bar.tsx — SSE-driven 3-step payment progress display
// Steps: Swap → Bridge → Confirmed
// PRD F-020: real-time status feedback
// =============================================================================

export type PaymentStep =
  | "idle"
  | "swap_executing"
  | "bridging"
  | "confirmed"
  | "bridge_delayed"
  | "error";

interface ReceiptData {
  txHash: string;
  bridgeMode: string;
}

interface PaymentProgressBarProps {
  step: PaymentStep;
  receipt?: ReceiptData;
  errorMessage?: string;
  swapTxHash?: string;
}

const STEPS = [
  { key: "swap_executing", label: "Swap" },
  { key: "bridging", label: "Bridge" },
  { key: "confirmed", label: "Confirmed" },
] as const;

function stepIndex(step: PaymentStep): number {
  if (step === "swap_executing") return 0;
  if (step === "bridging") return 1;
  if (step === "confirmed") return 2;
  return -1;
}

export function PaymentProgressBar({
  step,
  receipt,
  errorMessage,
  swapTxHash,
}: PaymentProgressBarProps) {
  const current = stepIndex(step);

  if (step === "idle") return null;

  return (
    <div className="w-full max-w-sm mx-auto mt-6">
      {/* Step indicators */}
      <div className="flex items-center justify-between mb-4">
        {STEPS.map((s, i) => {
          const done = current > i;
          const active = current === i;
          return (
            <div key={s.key} className="flex flex-col items-center flex-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                  done
                    ? "bg-green-500 text-white"
                    : active
                    ? "bg-blue-600 text-white animate-pulse"
                    : "bg-gray-200 text-gray-400"
                }`}
              >
                {done ? "✓" : i + 1}
              </div>
              <span
                className={`mt-1 text-xs ${
                  done || active ? "text-gray-800 font-medium" : "text-gray-400"
                }`}
              >
                {s.label}
              </span>
              {i < STEPS.length - 1 && (
                <div
                  className={`absolute h-0.5 w-full top-4 left-1/2 ${
                    done ? "bg-green-500" : "bg-gray-200"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Status message */}
      {step === "bridge_delayed" && (
        <p className="text-center text-sm text-amber-600 bg-amber-50 rounded-lg p-3">
          Taking longer than expected... Bridge confirmation may take a few minutes.
        </p>
      )}

      {step === "error" && errorMessage && (
        <p className="text-center text-sm text-red-600 bg-red-50 rounded-lg p-3">
          {errorMessage}
        </p>
      )}

      {/* Receipt */}
      {step === "confirmed" && receipt && (
        <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-4 text-sm space-y-2">
          <p className="text-green-700 font-semibold text-center">Payment Confirmed ✓</p>
          <div className="flex justify-between text-gray-600">
            <span>Bridge</span>
            <span className="font-medium">{receipt.bridgeMode}</span>
          </div>
          <div className="text-gray-600">
            <span>Tx: </span>
            <span className="font-mono text-xs break-all">{receipt.txHash}</span>
          </div>
          {swapTxHash && (
            <div className="text-gray-600">
              <span>Swap: </span>
              <span className="font-mono text-xs break-all">{swapTxHash}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
