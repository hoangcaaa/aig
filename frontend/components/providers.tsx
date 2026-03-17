"use client";

// =============================================================================
// providers.tsx — Client-side providers (Wagmi + TanStack Query)
// Extracted from layout.tsx to keep root layout as a server component,
// preventing hydration mismatches with wagmi state.
// =============================================================================

import { type ReactNode, useState } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { bscTestnet } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { injected } from "wagmi/connectors";

// Use public BSC Testnet RPC as fallback
const bscRpc = process.env.NEXT_PUBLIC_BSC_TESTNET_RPC_URL || "https://data-seed-prebsc-1-s1.binance.org:8545";

export function Providers({ children }: { children: ReactNode }) {
  // Stable configs per session — avoids re-creation on re-renders
  // wagmiConfig created inside component to avoid SSR connector issues
  const [wagmiConfig] = useState(() =>
    createConfig({
      chains: [bscTestnet],
      connectors: [injected()],
      transports: { [bscTestnet.id]: http(bscRpc) },
    })
  );
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
