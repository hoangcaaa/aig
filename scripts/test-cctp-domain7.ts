#!/usr/bin/env ts-node
// =============================================================================
// test-cctp-domain7.ts — CCTP Domain 7 Smoke Test
// PRD Section 6.1 — MUST run FIRST before any feature development.
//
// GO   (exit 0): proceed with BRIDGE_MODE=CCTP
// NO-GO (exit 1): activate BRIDGE_MODE=ADMIN_RELAY fallback
//
// Usage:
//   cd scripts && npx ts-node test-cctp-domain7.ts
// =============================================================================

import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  decodeAbiParameters,
  keccak256,
  defineChain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bscTestnet } from "viem/chains";

// Required env vars (see .env.example)
const {
  BSC_TESTNET_RPC_URL,
  ARC_TESTNET_RPC_URL,
  ARC_CHAIN_ID,
  CCTP_TOKEN_MESSENGER_BSC,
  CCTP_MESSAGE_TRANSMITTER_ARC,
  USDC_ADDRESS_BSC_TESTNET,
  USDC_ADDRESS_ARC_TESTNET,
  TEST_PRIVATE_KEY,
  CIRCLE_ATTESTATION_API = "https://iris-api-sandbox.circle.com/attestations",
  ARC_CCTP_DOMAIN_ID = "7",
} = process.env;

// Validate all required vars are present
function validateEnv() {
  const required = [
    "BSC_TESTNET_RPC_URL",
    "ARC_TESTNET_RPC_URL",
    "ARC_CHAIN_ID",
    "CCTP_TOKEN_MESSENGER_BSC",
    "CCTP_MESSAGE_TRANSMITTER_ARC",
    "USDC_ADDRESS_BSC_TESTNET",
    "USDC_ADDRESS_ARC_TESTNET",
    "TEST_PRIVATE_KEY",
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

function log(step: string, detail: string) {
  console.log(`[${new Date().toISOString()}] [${step}] ${detail}`);
}

// Arc Testnet is not in viem built-in chains — define from env
function getArcChain() {
  const chainId = parseInt(ARC_CHAIN_ID!, 10);
  return defineChain({
    id: chainId,
    name: "Arc Testnet",
    nativeCurrency: { name: "Arc", symbol: "ARC", decimals: 18 },
    rpcUrls: { default: { http: [ARC_TESTNET_RPC_URL!] } },
  });
}

// Minimal ERC-20 ABI fragments
const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

// CCTP TokenMessenger ABI fragment
const TOKEN_MESSENGER_ABI = [
  {
    name: "depositForBurn",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "destinationDomain", type: "uint32" },
      { name: "mintRecipient", type: "bytes32" },
      { name: "burnToken", type: "address" },
    ],
    outputs: [{ type: "uint64" }],
  },
] as const;

// CCTP MessageTransmitter ABI fragment
const MESSAGE_TRANSMITTER_ABI = [
  {
    name: "receiveMessage",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "message", type: "bytes" },
      { name: "attestation", type: "bytes" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

// Topic0 of MessageSent(bytes) — precomputed
const MESSAGE_SENT_TOPIC =
  "0x8c5261668696ce22758910d05bab8f186d6eb247ceac2af2e82c7dc17669b036" as `0x${string}`;

async function main() {
  validateEnv();

  const account = privateKeyToAccount(TEST_PRIVATE_KEY as `0x${string}`);
  const arcDomain = parseInt(ARC_CCTP_DOMAIN_ID!, 10);
  const arcChain = getArcChain();

  const bscClient = createPublicClient({
    chain: bscTestnet,
    transport: http(BSC_TESTNET_RPC_URL),
  });
  const arcPublicClient = createPublicClient({
    chain: arcChain,
    transport: http(ARC_TESTNET_RPC_URL),
  });
  const bscWalletClient = createWalletClient({
    account,
    chain: bscTestnet,
    transport: http(BSC_TESTNET_RPC_URL),
  });

  const TEST_USDC_AMOUNT = parseUnits("1", 6); // burn 1 testUSDC

  log("START", `Wallet: ${account.address}`);
  log("START", `Arc CCTP Domain: ${arcDomain}`);

  // ── Step 1: Check initial USDC balance on Arc ────────────────────────────
  log("STEP 1", "Fetching initial USDC balance on Arc Testnet...");
  const initialBalance = await arcPublicClient.readContract({
    address: USDC_ADDRESS_ARC_TESTNET as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [account.address],
  });
  log("STEP 1", `Initial Arc USDC: ${formatUnits(initialBalance, 6)}`);

  // ── Step 2: Approve TokenMessenger on BSC ───────────────────────────────
  log("STEP 2", `Approving ${formatUnits(TEST_USDC_AMOUNT, 6)} testUSDC to TokenMessenger...`);
  const approveTx = await bscWalletClient.writeContract({
    address: USDC_ADDRESS_BSC_TESTNET as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [CCTP_TOKEN_MESSENGER_BSC as `0x${string}`, TEST_USDC_AMOUNT],
  });
  await bscClient.waitForTransactionReceipt({ hash: approveTx });
  log("STEP 2", `Approve confirmed: ${approveTx}`);

  // ── Step 3: depositForBurn → Arc Domain 7 ───────────────────────────────
  log("STEP 3", "Calling depositForBurn() targeting Arc Testnet (Domain 7)...");
  // Encode recipient as bytes32 (left-pad address with zeros)
  const mintRecipient = `0x${"0".repeat(24)}${account.address.slice(2)}` as `0x${string}`;
  const depositTxHash = await bscWalletClient.writeContract({
    address: CCTP_TOKEN_MESSENGER_BSC as `0x${string}`,
    abi: TOKEN_MESSENGER_ABI,
    functionName: "depositForBurn",
    args: [TEST_USDC_AMOUNT, arcDomain, mintRecipient, USDC_ADDRESS_BSC_TESTNET as `0x${string}`],
  });
  await bscClient.waitForTransactionReceipt({ hash: depositTxHash });
  log("STEP 3", `Deposit tx: ${depositTxHash}`);

  // ── Step 4: Extract message hash from tx receipt ─────────────────────────
  log("STEP 4", "Extracting CCTP message hash from tx receipt...");
  const receipt = await bscClient.getTransactionReceipt({ hash: depositTxHash });
  const msgLog = receipt.logs.find(
    (l) => l.topics[0]?.toLowerCase() === MESSAGE_SENT_TOPIC.toLowerCase()
  );
  if (!msgLog) throw new Error("MessageSent log not found in receipt");

  const [messageBytes] = decodeAbiParameters([{ type: "bytes" }], msgLog.data);
  const messageHash = keccak256(messageBytes as `0x${string}`);
  log("STEP 4", `Message hash: ${messageHash}`);

  // ── Step 5: Poll Circle Attestation API (60s timeout) ───────────────────
  log("STEP 5", `Polling ${CIRCLE_ATTESTATION_API}/${messageHash} for attestation...`);
  const deadline = Date.now() + 60_000;
  let attestation: string | null = null;

  while (Date.now() < deadline) {
    const res = await fetch(`${CIRCLE_ATTESTATION_API}/${messageHash}`);
    if (res.ok) {
      const data = await res.json();
      log("STEP 5", `Status: ${data.status}`);
      if (data.status === "complete" && data.attestation) {
        attestation = data.attestation;
        break;
      }
    }
    await new Promise((r) => setTimeout(r, 5_000));
  }

  if (!attestation) {
    log("FAIL", "Attestation not received within 60s — Domain 7 may not be supported");
    log("ACTION", "Set BRIDGE_MODE=ADMIN_RELAY in your .env.local and proceed");
    process.exit(1);
  }
  log("STEP 5", "Attestation received ✓");

  // ── Step 6: receiveMessage on Arc Testnet ───────────────────────────────
  log("STEP 6", "Calling receiveMessage() on Arc Testnet MessageTransmitter...");
  const arcWalletClient = createWalletClient({
    account,
    chain: arcChain,
    transport: http(ARC_TESTNET_RPC_URL),
  });
  const receiveTx = await arcWalletClient.writeContract({
    address: CCTP_MESSAGE_TRANSMITTER_ARC as `0x${string}`,
    abi: MESSAGE_TRANSMITTER_ABI,
    functionName: "receiveMessage",
    args: [messageBytes as `0x${string}`, attestation as `0x${string}`],
  });
  await arcPublicClient.waitForTransactionReceipt({ hash: receiveTx });
  log("STEP 6", `receiveMessage tx confirmed: ${receiveTx} ✓`);

  // ── Step 7: Verify Arc USDC balance increased ────────────────────────────
  log("STEP 7", "Verifying USDC balance on Arc Testnet increased...");
  const finalBalance = await arcPublicClient.readContract({
    address: USDC_ADDRESS_ARC_TESTNET as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [account.address],
  });

  if (finalBalance <= initialBalance) {
    throw new Error(
      `Balance did not increase — CCTP failed. Before: ${formatUnits(initialBalance, 6)}, After: ${formatUnits(finalBalance, 6)}`
    );
  }
  log("STEP 7", `Arc USDC after: ${formatUnits(finalBalance, 6)} ✓`);

  log("PASS", "CCTP Domain 7 is fully operational — set BRIDGE_MODE=CCTP");
  process.exit(0);
}

main().catch((err) => {
  console.error(`[${new Date().toISOString()}] [ERROR]`, err.message);
  console.error("[ACTION] Set BRIDGE_MODE=ADMIN_RELAY and proceed with development");
  process.exit(1);
});
