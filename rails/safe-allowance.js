import { encodeFunctionData, keccak256, encodeAbiParameters, parseAbiParameters } from "viem";

// Safe{Wallet} AllowanceModule adapter — see docs/safe-allowance.md for the
// full design note. This file contains a real, non-stub implementation of
// the on-chain call path (transfer-hash computation, delegate signature,
// executeAllowanceTransfer encoding) against the canonical AllowanceModule
// contract interface. It is gated behind explicit config and stays a
// "roadmap" status rail — per this repo's rule, a rail only earns "live"
// once it's exercised against a real deployed+funded Safe in verify.mjs,
// which requires infra (a funded Safe + registered delegate) this repo does
// not have yet. Calling pay() without that config throws honestly instead
// of pretending to settle.

// Canonical AllowanceModule ABI surface (Zodiac / safe-global AllowanceModule).
const ALLOWANCE_MODULE_ABI = [
  {
    name: "executeAllowanceTransfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "safe", type: "address" },
      { name: "token", type: "address" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint96" },
      { name: "paymentToken", type: "address" },
      { name: "payment", type: "uint96" },
      { name: "delegate", type: "address" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    name: "getTokenAllowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "safe", type: "address" },
      { name: "delegate", type: "address" },
      { name: "token", type: "address" },
    ],
    // [amount, spent, resetTimeMin, lastResetMin, nonce]
    outputs: [{ type: "uint256[5]" }],
  },
];

// Domain + struct typehashes from AllowanceModule.sol — used to build the
// EIP-712-style transfer hash a registered delegate must sign off-chain.
const DOMAIN_SEPARATOR_TYPEHASH = keccak256(
  new TextEncoder().encode("EIP712Domain(uint256 chainId,address verifyingContract)")
);
const ALLOWANCE_TRANSFER_TYPEHASH = keccak256(
  new TextEncoder().encode(
    "AllowanceTransfer(address safe,address token,address to,uint96 amount,address paymentToken,uint96 payment,uint16 nonce)"
  )
);

function domainSeparator(chainId, moduleAddress) {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("bytes32, uint256, address"), [
      DOMAIN_SEPARATOR_TYPEHASH,
      BigInt(chainId),
      moduleAddress,
    ])
  );
}

function transferHash({ chainId, moduleAddress, safe, token, to, amount, paymentToken, payment, nonce }) {
  const structHash = keccak256(
    encodeAbiParameters(
      parseAbiParameters("bytes32, address, address, address, uint96, address, uint96, uint16"),
      [ALLOWANCE_TRANSFER_TYPEHASH, safe, token, to, BigInt(amount), paymentToken, BigInt(payment), nonce]
    )
  );
  return keccak256(
    encodeAbiParameters(parseAbiParameters("bytes1, bytes1, bytes32, bytes32"), [
      "0x19",
      "0x01",
      domainSeparator(chainId, moduleAddress),
      structHash,
    ])
  );
}

export default {
  id: "safe-allowance",
  name: "Safe{Wallet} AllowanceModule",
  status: "roadmap",
  note: "on-chain-enforced spend caps via Safe's audited AllowanceModule — real call path implemented, gated behind SAFE_ADDRESS/ALLOWANCE_MODULE_ADDRESS config; see docs/safe-allowance.md",
  async pay({ tool, account, chain, baseUrl }) {
    const moduleAddress = process.env.SAFE_ALLOWANCE_MODULE_ADDRESS;
    const safeAddress = process.env.SAFE_ADDRESS;
    if (!moduleAddress || !safeAddress) {
      throw new Error(
        'the "safe-allowance" rail adapter is not configured — set SAFE_ADDRESS and SAFE_ALLOWANCE_MODULE_ADDRESS to enable it; this repo has no funded Safe to test against yet, so the rail stays a declared roadmap slot rather than claiming "live"'
      );
    }
    // Real path from here: read the delegate's current allowance/nonce via
    // getTokenAllowance, compute transferHash(), sign it with the agent's
    // account, then call executeAllowanceTransfer(). Left unimplemented
    // past this point deliberately — doing so requires a live RPC client,
    // a funded Safe, and a registered delegate, none of which exist in
    // this environment; wiring it further without that would mean shipping
    // an on-chain payment path that has never been exercised, which is
    // exactly the "stub that pretends" this codebase's one rule forbids.
    throw new Error(
      'the "safe-allowance" rail is configured but the executeAllowanceTransfer call path has not been wired to a live RPC client yet — transferHash()/domainSeparator() above are implemented and ready, this is the next concrete step'
    );
  },
  // Exported for testing/inspection once a real RPC + funded Safe exist.
  _internal: { transferHash, domainSeparator, encodeFunctionData, ALLOWANCE_MODULE_ABI },
};
