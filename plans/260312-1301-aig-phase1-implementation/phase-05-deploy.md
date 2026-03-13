# Phase 5 — Contract Deployment

**Priority:** P0 | **Status:** Complete | **Effort:** ~3h
**Blocked by:** Phase 1 (env vars must be set), Phase 2 or 3 (BRIDGE_MODE determined)

## Context Links
- PRD: `/PRD final.md` — Section 9 (Phase 1 deliverables)
- Code: `contracts/scripts/Deploy.s.sol`, `contracts/src/SwapRouter.sol`
- Foundry docs: `https://book.getfoundry.sh/tutorials/solidity-scripting`

## Key Insights
- SwapRouter.sol constructor needs 5 addresses: wbnb, usdc, pancakeRouter, cctpMessenger, revenuePool
- If `BRIDGE_MODE=ADMIN_RELAY`: pass `address(0)` as `cctpMessenger` — contract checks `address(cctpMessenger) != address(0)` to branch
- `revenuePool` = a simple EOA wallet for Phase 1 is fine (fee accumulation only, no distribution yet)
- Deploy script uses `vm.envAddress()` to read addresses — no hardcoded values
- After deploy: `SWAP_ROUTER_ADDRESS_BSC` must be set in `.env.local` AND `NEXT_PUBLIC_SWAP_ROUTER_ADDRESS_BSC`

## Known BSC Testnet Addresses

| Contract | Address |
|---|---|
| WBNB | `0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd` |
| USDC (testUSDC) | confirm via BSC Testnet faucet or Circle docs |
| PancakeSwap V3 Router | `0x1b81D678ffb9C0263b24A97847620C99d213eB14` |
| CCTP TokenMessenger (BSC) | from `CCTP_TOKEN_MESSENGER_BSC` env var |

## Requirements

### Functional
- `Deploy.s.sol` reads all constructor args from environment — no hardcoded addresses
- Script deploys SwapRouter.sol and logs the deployed address
- Deployment verified with a `forge verify-contract` call (optional but recommended)
- Deployed address saved to project `.env.local`

### Non-Functional
- Deploy wallet must have enough tBNB for gas (~0.01 tBNB sufficient)
- Use `--broadcast` flag only when ready — dry-run first with just `forge script`

## Related Code Files

**Modify:**
- `contracts/scripts/Deploy.s.sol` — fill in constructor args from env vars

## Implementation Steps

### Step 1 — Read current `Deploy.s.sol` state

Check what's already in `contracts/scripts/Deploy.s.sol` before editing.

### Step 2 — Complete `Deploy.s.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SwapRouter} from "../src/SwapRouter.sol";

contract Deploy is Script {
    function run() external {
        // Read all addresses from environment — no hardcoded values
        address wbnb         = vm.envAddress("WBNB_ADDRESS_BSC");
        address usdc         = vm.envAddress("USDC_ADDRESS_BSC_TESTNET");
        address pancakeRouter = vm.envAddress("PANCAKESWAP_V3_ROUTER_BSC");
        address revenuePool  = vm.envAddress("AIG_REVENUE_POOL_ADDRESS");

        // CCTP messenger: pass address(0) if ADMIN_RELAY mode
        address cctpMessenger;
        string memory bridgeMode = vm.envString("BRIDGE_MODE");
        if (keccak256(bytes(bridgeMode)) == keccak256(bytes("ADMIN_RELAY"))) {
            cctpMessenger = address(0);
        } else {
            cctpMessenger = vm.envAddress("CCTP_TOKEN_MESSENGER_BSC");
        }

        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(deployerKey);
        SwapRouter router = new SwapRouter(
            wbnb,
            usdc,
            pancakeRouter,
            cctpMessenger,
            revenuePool
        );
        vm.stopBroadcast();

        console.log("SwapRouter deployed at:", address(router));
        console.log("Bridge mode:", bridgeMode);
        console.log("CCTP messenger:", cctpMessenger);
    }
}
```

### Step 3 — Add required env vars to `.env.local`

```bash
WBNB_ADDRESS_BSC=0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd
PANCAKESWAP_V3_ROUTER_BSC=0x1b81D678ffb9C0263b24A97847620C99d213eB14
AIG_REVENUE_POOL_ADDRESS=<deployer_wallet_or_dedicated_revenue_eoa>
DEPLOYER_PRIVATE_KEY=<private_key_with_0x_prefix>
# USDC_ADDRESS_BSC_TESTNET already in .env.example
```

### Step 4 — Dry-run (no broadcast)

```bash
cd contracts
forge script scripts/Deploy.s.sol \
  --rpc-url $BSC_TESTNET_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY
```

Review console output — verify all addresses are correct before broadcasting.

### Step 5 — Broadcast deployment

```bash
forge script scripts/Deploy.s.sol \
  --rpc-url $BSC_TESTNET_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --broadcast
```

### Step 6 — Save deployed address

From the console output, copy the deployed address and add to `.env.local`:
```bash
SWAP_ROUTER_ADDRESS_BSC=0x<deployed_address>
NEXT_PUBLIC_SWAP_ROUTER_ADDRESS_BSC=0x<deployed_address>
```

### Step 7 — Smoke test the deployed contract

Call `swapAndBridge()` with a minimal test amount ($1 USDC equivalent):
```bash
cast send $SWAP_ROUTER_ADDRESS_BSC \
  "swapAndBridge(bytes32,uint256,uint256,uint256,uint24,bytes32,address)" \
  <sessionId> <grossUSDC> <aigFee> <amountInMax> 500 <merchantBytes32> <merchantAddr> \
  --value <amountInMaxWei> \
  --rpc-url $BSC_TESTNET_RPC_URL \
  --private-key $TEST_PRIVATE_KEY
```

### Step 8 — (Optional) Clean up SwapRouter.sol dead variable

Remove the dead `unspentWbnb` variable (lines 141-142) before any audit:
```solidity
// Delete these two lines in swapAndBridge():
uint256 wbnbAfter = IERC20(wbnb).balanceOf(address(this));
uint256 unspentWbnb = wbnbAfter - (wbnbBefore - amountInMaximum);
// Keep only line 144:
uint256 refundAmount = amountInMaximum - actualWbnbConsumed;
```

## Todo List

- [ ] Read current `contracts/scripts/Deploy.s.sol` contents
- [ ] Complete Deploy.s.sol with env-driven constructor args + BRIDGE_MODE branch
- [ ] Add `WBNB_ADDRESS_BSC`, `PANCAKESWAP_V3_ROUTER_BSC`, `AIG_REVENUE_POOL_ADDRESS`, `DEPLOYER_PRIVATE_KEY` to `.env.example` (as empty placeholders)
- [ ] Dry-run: `forge script scripts/Deploy.s.sol --rpc-url $BSC_TESTNET_RPC_URL`
- [ ] Confirm all constructor arg addresses are correct
- [ ] Broadcast: add `--broadcast` flag
- [ ] Save `SWAP_ROUTER_ADDRESS_BSC` + `NEXT_PUBLIC_SWAP_ROUTER_ADDRESS_BSC` to `.env.local`
- [ ] Run cast smoke test with $1 USDC equivalent
- [ ] Remove dead `unspentWbnb` variable from SwapRouter.sol (pre-audit cleanup)

## Success Criteria

- `forge build` passes with no errors
- `forge test` passes (all existing tests in `SwapRouter.t.sol`)
- Contract deployed at valid BSC Testnet address
- `cast call $SWAP_ROUTER_ADDRESS_BSC "owner()(address)"` returns deployer address
- End-to-end swap executes without revert on BSC Testnet

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Deployer wallet has insufficient tBNB | Low | Fund wallet from BSC Testnet faucet before deploy |
| Wrong USDC address — swap targets wrong token | Medium | Verify USDC address against a known BSC Testnet USDC transaction on explorer |
| PancakeSwap V3 Router address incorrect | Low | Cross-reference with official PancakeSwap docs / BSC Testnet deployment list |
| Gas estimation failure on dry-run | Low | Check forge version; ensure BSC Testnet RPC is responsive |

## Security Considerations

- `DEPLOYER_PRIVATE_KEY` must never be committed to git — `.gitignore` must cover `.env.local`
- Revenue pool address in Phase 1 can be an EOA; Phase 2 should replace with a contract
- `withdrawFees()` is owner-only — deployer wallet is the owner; keep that wallet secure

## Next Steps

After Phase 5:
- Full end-to-end test: QR scan → payment page → sign → SSE progress → confirmed
- Update `docs/deployment-guide.md` with deployed addresses and network info
- Document `BRIDGE_MODE` in `docs/system-architecture.md`
