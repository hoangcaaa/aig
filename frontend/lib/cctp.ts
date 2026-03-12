// =============================================================================
// cctp.ts — CCTP helper (primary bridge path)
// Uses Circle BridgeKit / CCTP contracts directly
//
// Activated when: BRIDGE_MODE=CCTP (Domain 7 smoke test PASS)
// Arc Testnet CCTP Domain ID: 7
// =============================================================================

import {
  createPublicClient,
  createWalletClient,
  http,
  decodeAbiParameters,
  keccak256,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bscTestnet } from "viem/chains";
import { getArcChain } from "./chains";

// Circle CCTP MessageSent(bytes) topic0 — precomputed keccak256
// keccak256("MessageSent(bytes)") = 0x8c5261668696ce22758910d05bab8f186d6eb247ceac2af2e82c7dc17669b036
const MESSAGE_SENT_TOPIC =
  "0x8c5261668696ce22758910d05bab8f186d6eb247ceac2af2e82c7dc17669b036" as `0x${string}`;

// Circle Attestation API response shape
interface AttestationResponse {
  status: "complete" | "pending_confirmations";
  attestation: string | null;
}

// -------------------------------------------------------------------------
// extractMessageBytesFromReceipt (internal)
//
// Fetches BSC Testnet tx receipt and extracts the raw CCTP message bytes
// from the MessageSent(bytes) event log. Single RPC call — used by both
// extractMessageHash() and extractRawMessage() to avoid duplicate fetches.
// -------------------------------------------------------------------------
async function extractMessageBytesFromReceipt(txHash: string): Promise<`0x${string}`> {
  const client = createPublicClient({
    chain: bscTestnet,
    transport: http(process.env.BSC_TESTNET_RPC_URL),
  });

  const receipt = await client.waitForTransactionReceipt({
    hash: txHash as `0x${string}`,
    timeout: 60_000,
  });

  const msgLog = receipt.logs.find(
    (l) => l.topics[0]?.toLowerCase() === MESSAGE_SENT_TOPIC.toLowerCase()
  );

  if (!msgLog) {
    throw new Error(`extractMessageBytes: MessageSent log not found in tx ${txHash}`);
  }

  // Log data is ABI-encoded: abi.encode(bytes message)
  const [messageBytes] = decodeAbiParameters([{ type: "bytes" }], msgLog.data);
  return messageBytes as `0x${string}`;
}

// -------------------------------------------------------------------------
// extractMessageHash
//
// Returns keccak256(messageBytes) — used as the Circle attestation lookup key.
// -------------------------------------------------------------------------
export async function extractMessageHash(txHash: string): Promise<string> {
  const messageBytes = await extractMessageBytesFromReceipt(txHash);
  return keccak256(messageBytes);
}

// -------------------------------------------------------------------------
// extractRawMessage
//
// Returns the raw message bytes hex string — first arg to receiveMessage().
// -------------------------------------------------------------------------
export async function extractRawMessage(txHash: string): Promise<string> {
  return extractMessageBytesFromReceipt(txHash);
}

// -------------------------------------------------------------------------
// pollAttestation
//
// Polls Circle Attestation API until attestation is available or timeout.
// Called after depositForBurn() tx is confirmed on BSC Testnet.
// -------------------------------------------------------------------------
export async function pollAttestation(
  messageHash: string,
  timeoutMs = 120_000 // PRD F-002: 120s timeout before BRIDGE_DELAYED
): Promise<string> {
  const apiBase = process.env.CIRCLE_ATTESTATION_API;
  if (!apiBase) throw new Error("CIRCLE_ATTESTATION_API not set");

  const deadline = Date.now() + timeoutMs;
  const pollInterval = 5_000; // 5s between polls

  while (Date.now() < deadline) {
    const res = await fetch(`${apiBase}/${messageHash}`);
    if (res.ok) {
      const data: AttestationResponse = await res.json();
      if (data.status === "complete" && data.attestation) {
        return data.attestation;
      }
    }
    await new Promise((r) => setTimeout(r, pollInterval));
  }

  throw new Error(`pollAttestation: timeout after ${timeoutMs}ms for ${messageHash}`);
}

// -------------------------------------------------------------------------
// receiveMessage
//
// Calls MessageTransmitter.receiveMessage() on Arc Testnet to mint USDC.
// Called after attestation is confirmed via pollAttestation().
// -------------------------------------------------------------------------
export async function receiveMessage(
  message: string,
  attestation: string
): Promise<{ txHash: string }> {
  const account = privateKeyToAccount(
    process.env.AIG_ADMIN_WALLET_PRIVATE_KEY as `0x${string}`
  );
  const arcChain = getArcChain();

  const walletClient = createWalletClient({
    account,
    chain: arcChain,
    transport: http(process.env.ARC_TESTNET_RPC_URL),
  });
  const publicClient = createPublicClient({
    chain: arcChain,
    transport: http(process.env.ARC_TESTNET_RPC_URL),
  });

  const messageTransmitterAbi = [
    {
      name: "receiveMessage",
      type: "function",
      stateMutability: "nonpayable",
      inputs: [
        { name: "message", type: "bytes" },
        { name: "attestation", type: "bytes" },
      ],
      outputs: [{ name: "success", type: "bool" }],
    },
  ] as const;

  const txHash = await walletClient.writeContract({
    address: process.env.CCTP_MESSAGE_TRANSMITTER_ARC as `0x${string}`,
    abi: messageTransmitterAbi,
    functionName: "receiveMessage",
    args: [message as `0x${string}`, attestation as `0x${string}`],
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 60_000 });
  return { txHash };
}
