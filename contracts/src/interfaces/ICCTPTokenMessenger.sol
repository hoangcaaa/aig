// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Circle Cross-Chain Transfer Protocol — TokenMessenger interface
interface ICCTPTokenMessenger {
    /// @notice Deposits and burns tokens from sender to be minted on destination domain
    /// @param amount       Amount of tokens to burn
    /// @param destinationDomain  Domain ID of target chain (Arc Testnet = 7)
    /// @param mintRecipient Recipient address on destination chain (bytes32 padded)
    /// @param burnToken    Address of token to burn (USDC on source chain)
    /// @return nonce       Unique nonce for this burn message
    function depositForBurn(
        uint256 amount,
        uint32  destinationDomain,
        bytes32 mintRecipient,
        address burnToken
    ) external returns (uint64 nonce);
}
