// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SwapRouter} from "../src/SwapRouter.sol";

// =============================================================================
// Deploy.s.sol — SwapRouter deployment script (BSC Testnet)
//
// Usage:
//   forge script scripts/Deploy.s.sol \
//     --rpc-url $BSC_TESTNET_RPC_URL \
//     --private-key $TEST_PRIVATE_KEY \
//     --broadcast -vvvv
// =============================================================================
contract DeployScript is Script {
    function run() external {
        // Read addresses from environment (set in .env.local)
        address wbnb    = vm.envAddress("WBNB_ADDRESS_BSC_TESTNET");
        address usdc    = vm.envAddress("USDC_ADDRESS_BSC_TESTNET");
        address pancake = vm.envAddress("PANCAKESWAP_V3_ROUTER_BSC");
        address cctp    = vm.envAddress("CCTP_TOKEN_MESSENGER_BSC"); // or address(0) for ADMIN_RELAY
        address revenue = vm.envAddress("AIG_REVENUE_POOL_ADDRESS");

        vm.startBroadcast();

        SwapRouter router = new SwapRouter(
            wbnb,
            usdc,
            pancake,
            cctp,
            revenue
        );

        console.log("SwapRouter deployed at:", address(router));
        console.log("Bridge mode:", cctp == address(0) ? "ADMIN_RELAY" : "CCTP");

        vm.stopBroadcast();
    }
}
