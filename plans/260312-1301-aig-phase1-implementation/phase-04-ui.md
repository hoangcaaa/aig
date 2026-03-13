# Phase 4 — UI (Payment Page + Merchant Dashboard)

**Priority:** P0 | **Status:** Complete | **Effort:** ~8h
**Can run in parallel with:** Phase 2 and Phase 3
**Blocked by:** Phase 1 (quote endpoint must exist for payment page)

## Context Links
- PRD: `/PRD final.md` — F-003 (QR), F-010 (dashboard), F-020 (payment page), F-040 (fee breakdown)
- Code: `frontend/app/pay/[id]/page.tsx`, `frontend/app/dashboard/page.tsx`

## Key Insights
- Payment page is **mobile-first** — most customers scan QR on phone
- SSE connection to `/api/agent/execute` drives real-time progress bar
- Fee breakdown must be shown BEFORE customer signs — not after
- QR encodes: `{ merchantWallet, targetUSDC, expiry, sessionId }` — refresh every 60s
- Dashboard QR and payment feed are the minimum viable merchant interface
- No wallet library is installed yet — need to add `wagmi` + `viem` for wallet connect or use a simpler approach

## Requirements

### Functional — Payment Page (`/pay/[id]`)
- Auto-detect connected wallet and chain (BSC Testnet)
- Call `POST /api/agent/quote` on load to show fee breakdown
- Display before signing:
  - "Merchant receives: $Y USDC"
  - "AIG service fee (0.1%): $Z"
  - "You pay: ~X tBNB (includes 0.5% slippage buffer)"
  - "Unused slippage buffer will be auto-refunded"
- One-tap approve + send (calls SwapRouter.sol `swapAndBridge()`)
- Real-time progress bar: Swap → Bridge → Confirmed (fed by SSE)
- Receipt screen: txHash, sessionId, refund amount, final fee paid

### Functional — Dashboard (`/dashboard`)
- QR code generator: encode payment session as QR, refresh every 60s
- Real-time payment feed: source chain, amount received, bridge mode, tx hash, timestamp
- Points balance and current tier display
- Minimum viable: no auth required for Phase 1 (merchant identified by wallet address)

### Non-Functional
- Mobile-first CSS (pay page must look good at 390px width)
- SSE reconnect on connection drop (EventSource auto-reconnects)
- No server-side wallet signing — all contract calls client-side via browser wallet

## Architecture

```
/pay/[id]
  1. Parse sessionId from URL params
  2. Fetch merchant info from Supabase (merchantWallet, targetUSDC)
  3. POST /api/agent/quote → show fee breakdown
  4. Customer connects wallet (wagmi/window.ethereum)
  5. Customer clicks "Pay" → writeContract SwapRouter.swapAndBridge()
  6. POST /api/agent/execute { sessionId, swapTxHash, merchantWallet, targetUSDC }
  7. EventSource SSE stream → update progress bar
  8. On "confirmed" event → show receipt screen

/dashboard
  1. Connect wallet → identify merchant by address
  2. Load payment_sessions from Supabase (real-time subscription)
  3. Generate QR code (sessionId + merchantWallet + targetUSDC + expiry)
  4. Display points balance via getPointsBalance(wallet)
```

## Related Code Files

**Modify:**
- `frontend/app/pay/[id]/page.tsx` — full implementation
- `frontend/app/dashboard/page.tsx` — full implementation
- `frontend/app/layout.tsx` — add wagmi provider if needed

**Create:**
- `frontend/components/payment-progress-bar.tsx` — SSE-driven progress steps
- `frontend/components/fee-breakdown-card.tsx` — quote display before signing
- `frontend/components/qr-code-generator.tsx` — QR refresh logic
- `frontend/components/payment-feed-table.tsx` — real-time feed

## Implementation Steps

### Step 1 — Install UI dependencies

```bash
cd frontend
npm install wagmi viem @tanstack/react-query qrcode.react
```

- `wagmi` — wallet connect + contract writes
- `qrcode.react` — QR code rendering
- `@tanstack/react-query` — required by wagmi v2

### Step 2 — Wagmi provider in `layout.tsx`

```typescript
// frontend/app/layout.tsx
import { WagmiProvider, createConfig, http } from 'wagmi';
import { bscTestnet } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { injected } from 'wagmi/connectors';

const wagmiConfig = createConfig({
  chains: [bscTestnet],
  connectors: [injected()],
  transports: { [bscTestnet.id]: http(process.env.NEXT_PUBLIC_BSC_TESTNET_RPC_URL) }
});
const queryClient = new QueryClient();

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html><body>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </WagmiProvider>
    </body></html>
  );
}
```

### Step 3 — `fee-breakdown-card.tsx` component

Displays quote data returned from `/api/agent/quote`:
```typescript
interface FeeBreakdownProps {
  grossUSDC: string;    // in USDC units
  aigFee: string;       // 0.1%
  netUSDC: string;      // merchant receives
  amountBNB: string;    // formatted BNB
  targetUSDC: number;
}
// Shows 4 line items + "Unused slippage buffer auto-refunded" note
// CTA: "Pay ~X tBNB" button
```

### Step 4 — `payment-progress-bar.tsx` component

SSE-driven 3-step progress display:
```typescript
type Step = 'idle' | 'swap_executing' | 'bridging' | 'confirmed' | 'bridge_delayed' | 'error';
// Steps: [●] Swap  →  [●] Bridge  →  [●] Confirmed
// Each step lights up as SSE events arrive
// On 'confirmed': show receipt sub-component
// On 'bridge_delayed': show "Taking longer than expected..." message
```

### Step 5 — Payment page (`/pay/[id]/page.tsx`)

```typescript
'use client';
export default function PayPage({ params }: { params: { id: string } }) {
  const sessionId = params.id;
  // 1. Load session from Supabase (merchantWallet, targetUSDC)
  // 2. On load: POST /api/agent/quote → setQuote(data)
  // 3. Show FeeBreakdownCard with quote
  // 4. On "Pay" click:
  //    a. useWriteContract → SwapRouter.swapAndBridge(...)
  //    b. On tx submitted: open EventSource('/api/agent/execute')
  //       POST body sent via fetch before opening SSE
  //    c. Update progress via onmessage handler
  // 5. On confirmed: show receipt
}
```

Key SwapRouter call params (from quote response):
```typescript
writeContract({
  address: process.env.NEXT_PUBLIC_SWAP_ROUTER_ADDRESS_BSC as `0x${string}`,
  abi: SWAP_ROUTER_ABI,
  functionName: 'swapAndBridge',
  args: [
    sessionId as `0x${string}`,     // bytes32
    grossUSDCRequired,               // bigint
    aigServiceFee,                   // bigint
    amountInMaximumWei,              // bigint
    poolFee,                         // number
    merchantWalletBytes32,           // bytes32 (pad address to 32 bytes)
    merchantWallet as `0x${string}`  // address
  ],
  value: amountInMaximumWei  // send BNB = amountInMaximum (contract wraps to WBNB)
});
```

**Important:** `merchantWallet` as bytes32 = `0x000000000000000000000000{address_without_0x}`

### Step 6 — `qr-code-generator.tsx` component

```typescript
interface QRPayload {
  sessionId: string;
  merchantWallet: string;
  targetUSDC: number;
  expiry: number;  // Unix timestamp
}

// Encodes payload as JSON string in QR
// useEffect: refresh sessionId + expiry every 60s
// Display: <QRCodeSVG value={JSON.stringify(payload)} size={256} />
// Show countdown timer: "Refreshes in {n}s"
```

### Step 7 — Dashboard (`/dashboard/page.tsx`)

Minimum viable sections:
1. **Wallet connect** — wagmi `useAccount` + `useConnect`
2. **QR Generator** — `<QRCodeGenerator merchantWallet={address} targetUSDC={amount} />`
3. **Payment Feed** — Supabase real-time subscription to `payment_sessions` filtered by `merchant_wallet`
4. **Points** — call `GET /api/points?wallet={address}` (simple API route wrapping `getPointsBalance()`)

Add `frontend/app/api/points/route.ts`:
```typescript
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get('wallet');
  if (!wallet) return Response.json({ error: 'wallet required' }, { status: 400 });
  const { totalPoints, tier } = await getPointsBalance(wallet);
  return Response.json({ totalPoints, tier });
}
```

## Todo List

- [ ] Install wagmi, qrcode.react, @tanstack/react-query
- [ ] Add WagmiProvider + QueryClientProvider to `layout.tsx`
- [ ] Create `components/fee-breakdown-card.tsx`
- [ ] Create `components/payment-progress-bar.tsx`
- [ ] Create `components/qr-code-generator.tsx`
- [ ] Create `components/payment-feed-table.tsx`
- [ ] Implement `/pay/[id]/page.tsx` — full flow (quote → sign → SSE → receipt)
- [ ] Implement `/dashboard/page.tsx` — QR + feed + points
- [ ] Add `frontend/app/api/points/route.ts`
- [ ] Add `NEXT_PUBLIC_SWAP_ROUTER_ADDRESS_BSC`, `NEXT_PUBLIC_BSC_TESTNET_RPC_URL` to `.env.example`
- [ ] Test payment page at 390px viewport (mobile-first check)

## Success Criteria

- Payment page shows correct fee breakdown for a $10 payment before signing
- Customer can connect MetaMask and sign the swap transaction
- Progress bar advances through Swap → Bridge → Confirmed via SSE
- Receipt screen shows txHash, refund amount, session ID
- Dashboard displays QR that refreshes every 60s
- Dashboard payment feed shows confirmed payments in real-time

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| wagmi v2 breaking changes from v1 | Low | Use wagmi v2 docs; avoid v1 patterns (`useContractWrite` renamed to `useWriteContract`) |
| BSC Testnet not available in user's MetaMask | Medium | Show "Add BSC Testnet to MetaMask" button with `wallet_addEthereumChain` call |
| SSE connection drops mid-payment | Low | EventSource auto-reconnects; display "Reconnecting..." state |
| `bytes32` merchant wallet encoding wrong | Medium | Verify padding: `0x${merchantAddr.slice(2).padStart(64, '0')}` |

## Security Considerations

- `NEXT_PUBLIC_*` vars are client-visible — never put private keys in NEXT_PUBLIC_ vars
- QR expiry prevents replay attacks — 60s window is sufficient for PoC
- No auth on dashboard in Phase 1 — wallet-based identity only; acceptable for testnet PoC

## Next Steps

- Phase 5 (deploy) needed before real end-to-end test on BSC Testnet
- After deploy: update `NEXT_PUBLIC_SWAP_ROUTER_ADDRESS_BSC` in `.env.local`
