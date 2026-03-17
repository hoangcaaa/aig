// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// =============================================================================
// SwapRouter.sol — AIG Phase 1 MVP
// Network: BSC Testnet
// DEX: PancakeSwap V3 (exactOutputSingle ONLY)
//
// CRITICAL RULES (from PRD Fix #1 + implementation rules):
//   1. NO floating-point math. All spotPrice / slippage calculations happen
//      off-chain in /api/agent/route.ts. This contract receives final integers.
//   2. Refund mechanism is MANDATORY: any unspent WBNB after the swap MUST be
//      returned to msg.sender in the same transaction.
// =============================================================================

import {IERC20} from "./interfaces/IERC20.sol";
import {IWBNB} from "./interfaces/IWBNB.sol";
import {IPancakeV3Router} from "./interfaces/IPancakeV3Router.sol";
import {ICCTPTokenMessenger} from "./interfaces/ICCTPTokenMessenger.sol";

contract SwapRouter {
    // -------------------------------------------------------------------------
    // Immutables
    // -------------------------------------------------------------------------
    address public immutable wbnb;
    address public immutable usdc;
    IPancakeV3Router public immutable pancakeRouter;
    ICCTPTokenMessenger public immutable cctpMessenger; // zero address in ADMIN_RELAY mode
    address public immutable revenuePool;
    address public immutable owner;

    // Arc Testnet CCTP Domain ID (confirmed via Arc community — see PRD Section 6)
    uint32 public constant ARC_DOMAIN = 7;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------
    event SwapAndBridgeInitiated(
        bytes32 indexed sessionId,
        address indexed customer,
        uint256 amountIn,          // WBNB consumed (after refund)
        uint256 grossUSDCRequired, // swap output = netUSDC + aigFee
        uint256 netUSDCToMerchant, // forwarded to CCTP / emitted for ADMIN_RELAY
        address merchantWallet
    );

    // Emitted in ADMIN_RELAY mode so the agent can pick up the event
    event SwapCompleted(
        bytes32 indexed sessionId,
        uint256 netUSDCAmount,
        address merchantWallet
    );

    // Emitted whenever unspent WBNB is returned to the customer
    event RefundIssued(
        bytes32 indexed sessionId,
        address indexed customer,
        address token,
        uint256 refundAmount
    );

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------
    error InsufficientOutput(uint256 received, uint256 required);
    error ZeroAmount();
    error Unauthorized();

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------
    constructor(
        address _wbnb,
        address _usdc,
        address _pancakeRouter,
        address _cctpMessenger, // pass address(0) when BRIDGE_MODE=ADMIN_RELAY
        address _revenuePool
    ) {
        wbnb = _wbnb;
        usdc = _usdc;
        pancakeRouter = IPancakeV3Router(_pancakeRouter);
        cctpMessenger = ICCTPTokenMessenger(_cctpMessenger);
        revenuePool = _revenuePool;
        owner = msg.sender;
    }

    // -------------------------------------------------------------------------
    // Core: swapAndBridge
    //
    // Parameters (all computed OFF-CHAIN in /api/agent/route.ts):
    //   sessionId          — unique payment session identifier
    //   grossUSDCRequired  — amountOut for exactOutputSingle (netUSDC + aigFee)
    //   aigServiceFee      — 0.1% of targetUSDC, deducted to revenuePool
    //   amountInMaximum    — pre-calculated max WBNB to spend (includes 0.5% slippage buffer)
    //                        Formula (off-chain): grossUSDC / spotPrice / 0.995
    //                        Passed as integer wei. NO math done in this contract.
    //   poolFee            — PancakeSwap V3 pool fee tier (e.g. 500 = 0.05%)
    //   merchantWallet     — Arc Testnet address to receive USDC (bytes32 for CCTP)
    //   merchantWalletAddr — Arc Testnet address (plain address for ADMIN_RELAY event)
    // -------------------------------------------------------------------------
    function swapAndBridge(
        bytes32 sessionId,
        uint256 grossUSDCRequired,
        uint256 aigServiceFee,
        uint256 amountInMaximum, // final integer from agent — no math here
        uint24  poolFee,
        bytes32 merchantWallet,       // CCTP format
        address merchantWalletAddr    // plain format for event
    ) external payable {
        if (amountInMaximum == 0 || grossUSDCRequired == 0) revert ZeroAmount();

        // 1. Wrap incoming BNB → WBNB
        IWBNB(wbnb).deposit{value: msg.value}();

        // 2. Approve PancakeSwap router to spend WBNB
        IERC20(wbnb).approve(address(pancakeRouter), amountInMaximum);

        // 3. Record WBNB balance before swap to calculate exact consumption
        uint256 wbnbBefore = IERC20(wbnb).balanceOf(address(this));

        // 4. Execute exactOutputSingle — buy exactly grossUSDCRequired USDC
        IPancakeV3Router.ExactOutputSingleParams memory params = IPancakeV3Router.ExactOutputSingleParams({
            tokenIn: wbnb,
            tokenOut: usdc,
            fee: poolFee,
            recipient: address(this),
            deadline: block.timestamp + 300, // 5 min deadline
            amountOut: grossUSDCRequired,
            amountInMaximum: amountInMaximum,
            sqrtPriceLimitX96: 0
        });
        uint256 actualWbnbConsumed = pancakeRouter.exactOutputSingle(params);

        // 5. Verify output meets minimum threshold (guard against extreme slippage)
        uint256 usdcReceived = IERC20(usdc).balanceOf(address(this));
        uint256 minimumAcceptable = (grossUSDCRequired * 995) / 1000; // 0.5% tolerance
        if (usdcReceived < minimumAcceptable) {
            revert InsufficientOutput(usdcReceived, minimumAcceptable);
        }

        // 6. MANDATORY REFUND: return unspent WBNB to customer in this same tx
        uint256 wbnbAfter = IERC20(wbnb).balanceOf(address(this));
        uint256 unspentWbnb = wbnbAfter - (wbnbBefore - amountInMaximum);
        // Simpler: unspentWbnb = amountInMaximum - actualWbnbConsumed
        uint256 refundAmount = amountInMaximum - actualWbnbConsumed;
        if (refundAmount > 0) {
            IERC20(wbnb).transfer(msg.sender, refundAmount);
            emit RefundIssued(sessionId, msg.sender, wbnb, refundAmount);
        }

        // 7. Deduct AIG service fee to Revenue Pool
        IERC20(usdc).transfer(revenuePool, aigServiceFee);
        uint256 netUSDCToMerchant = grossUSDCRequired - aigServiceFee;

        // 8. Bridge or emit (determined by CCTP messenger address)
        if (address(cctpMessenger) != address(0)) {
            // PRIMARY PATH: CCTP burn → mint on Arc (Domain 7)
            IERC20(usdc).approve(address(cctpMessenger), netUSDCToMerchant);
            cctpMessenger.depositForBurn(
                netUSDCToMerchant,
                ARC_DOMAIN,
                merchantWallet,
                usdc
            );
        } else {
            // FALLBACK PATH: ADMIN_RELAY — agent detects this event and relays
            emit SwapCompleted(sessionId, netUSDCToMerchant, merchantWalletAddr);
        }

        emit SwapAndBridgeInitiated(
            sessionId,
            msg.sender,
            actualWbnbConsumed,
            grossUSDCRequired,
            netUSDCToMerchant,
            merchantWalletAddr
        );
    }

    // -------------------------------------------------------------------------
    // Admin: withdraw accumulated fees (owner only)
    // -------------------------------------------------------------------------
    function withdrawFees(address token, uint256 amount) external {
        if (msg.sender != owner) revert Unauthorized();
        IERC20(token).transfer(owner, amount);
    }

    // Accept BNB (needed for wrapping)
    receive() external payable {}
}
