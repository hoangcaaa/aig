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

const wagmiConfig = createConfig({
  chains: [bscTestnet],
  connectors: [injected()],
  transports: {
    [bscTestnet.id]: http(process.env.NEXT_PUBLIC_BSC_TESTNET_RPC_URL),
  },
});

export function Providers({ children }: { children: ReactNode }) {
  // Stable QueryClient per session — avoids re-creation on re-renders
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
