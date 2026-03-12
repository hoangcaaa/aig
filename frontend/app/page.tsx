import Link from "next/link";

// =============================================================================
// page.tsx — AIG Homepage / Landing Page
// =============================================================================

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Nav */}
      <nav className="border-b border-white/5 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <span className="font-bold text-lg tracking-tight">ARC Invisible Gateway</span>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/dashboard" className="text-gray-400 hover:text-white transition-colors">
              Dashboard
            </Link>
            <Link
              href="/dashboard"
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-lg transition-colors font-medium"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-6 pt-24 pb-20 text-center">
        <div className="max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1.5 text-blue-400 text-sm mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            BSC Testnet · Arc Network · Phase 1 MVP
          </div>

          <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-tight mb-6">
            Pay with anything.
            <br />
            <span className="text-blue-400">Receive USDC.</span>
            <br />
            Invisibly.
          </h1>

          <p className="text-lg text-gray-400 max-w-xl mx-auto mb-10 leading-relaxed">
            Cross-chain payment infrastructure for merchants. Customers pay with BNB on BSC —
            your AI agent swaps and bridges automatically. You receive exact USDC on Arc Network.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/dashboard"
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 text-white font-semibold px-8 py-3 rounded-xl transition-colors text-center"
            >
              Open Merchant Dashboard
            </Link>
            <a
              href="#how-it-works"
              className="w-full sm:w-auto text-gray-400 hover:text-white border border-white/10 hover:border-white/20 px-8 py-3 rounded-xl transition-colors text-center"
            >
              How it works
            </a>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="px-6 pb-20">
        <div className="max-w-3xl mx-auto grid grid-cols-3 gap-6 text-center">
          {[
            { value: "0.1%", label: "Service fee" },
            { value: "0.5%", label: "Slippage buffer" },
            { value: "~30s", label: "Bridge time" },
          ].map(({ value, label }) => (
            <div key={label} className="bg-white/5 rounded-2xl p-5 border border-white/5">
              <p className="text-3xl font-bold text-white">{value}</p>
              <p className="text-sm text-gray-500 mt-1">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="px-6 py-20 border-t border-white/5">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">How it works</h2>
          <p className="text-gray-400 text-center mb-12">
            Three steps. Fully automatic. No customer friction.
          </p>

          <div className="space-y-4">
            {[
              {
                step: "01",
                title: "Merchant generates QR",
                description:
                  "Set your USDC amount. The dashboard generates a payment QR that refreshes every 60 seconds. Customer scans it on their phone.",
                icon: "📱",
              },
              {
                step: "02",
                title: "Customer pays in BNB",
                description:
                  "Customer connects their BSC wallet, sees the exact fee breakdown upfront, and signs one transaction. Our AI agent calculates the optimal swap params off-chain.",
                icon: "⚡",
              },
              {
                step: "03",
                title: "You receive exact USDC",
                description:
                  "SwapRouter.sol executes the PancakeSwap V3 swap. The AI agent bridges via CCTP (or Admin Relay fallback) to Arc Network. Unused slippage is auto-refunded.",
                icon: "✅",
              },
            ].map(({ step, title, description, icon }) => (
              <div
                key={step}
                className="flex gap-5 bg-white/5 border border-white/5 rounded-2xl p-6 hover:border-white/10 transition-colors"
              >
                <div className="flex-shrink-0 text-3xl">{icon}</div>
                <div>
                  <div className="text-xs font-mono text-blue-400 mb-1">{step}</div>
                  <h3 className="font-semibold text-white mb-1">{title}</h3>
                  <p className="text-sm text-gray-400 leading-relaxed">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Architecture */}
      <section className="px-6 py-20 border-t border-white/5">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">Technical Stack</h2>
          <p className="text-gray-400 text-center mb-12">
            Built on battle-tested infrastructure.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              {
                title: "PancakeSwap V3",
                subtitle: "BSC Testnet · exactOutputSingle",
                description:
                  "On-chain price quotes via QuoterV2. All math computed off-chain — zero floating-point in Solidity.",
              },
              {
                title: "Circle CCTP",
                subtitle: "Domain 7 · Arc Testnet",
                description:
                  "Primary bridge path. Native USDC burn on BSC → attestation → mint on Arc. 120s timeout.",
              },
              {
                title: "Admin Relay",
                subtitle: "Fallback · PoC only",
                description:
                  "ADMIN_RELAY mode when CCTP Domain 7 is unavailable. Idempotency-guarded to prevent double-spend.",
              },
              {
                title: "Supabase",
                subtitle: "payment_sessions · points_ledger",
                description:
                  "Session state, swap param caching, real-time payment feed, and off-chain points ledger.",
              },
            ].map(({ title, subtitle, description }) => (
              <div
                key={title}
                className="bg-white/5 border border-white/5 rounded-2xl p-5 hover:border-white/10 transition-colors"
              >
                <h3 className="font-semibold text-white">{title}</h3>
                <p className="text-xs text-blue-400 font-mono mt-0.5 mb-2">{subtitle}</p>
                <p className="text-sm text-gray-400 leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-20 border-t border-white/5">
        <div className="max-w-xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to accept crypto?</h2>
          <p className="text-gray-400 mb-8">
            Connect your wallet and generate your first payment QR in under a minute.
          </p>
          <Link
            href="/dashboard"
            className="inline-block bg-blue-600 hover:bg-blue-500 text-white font-semibold px-10 py-3.5 rounded-xl transition-colors"
          >
            Open Dashboard →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 px-6 py-8 text-center text-sm text-gray-600">
        <p>ARC Invisible Gateway · Phase 1 MVP · BSC Testnet + Arc Testnet</p>
        <p className="mt-1">PoC only — not for mainnet use</p>
      </footer>
    </div>
  );
}
