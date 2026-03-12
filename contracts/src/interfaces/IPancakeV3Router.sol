// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// PancakeSwap V3 SwapRouter — exactOutputSingle interface only (Phase 1)
interface IPancakeV3Router {
    struct ExactOutputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24  fee;
        address recipient;
        uint256 amountOut;
        uint256 amountInMaximum;
        uint160 sqrtPriceLimitX96;
    }

    /// @notice Swaps as little tokenIn as possible for an exact amount of tokenOut
    /// @return amountIn The amount of tokenIn actually spent
    function exactOutputSingle(ExactOutputSingleParams calldata params)
        external
        payable
        returns (uint256 amountIn);
}
