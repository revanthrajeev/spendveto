// Multi-wallet connect via EIP-6963 (the multi-provider discovery standard):
// every installed browser wallet (MetaMask, Coinbase Wallet, Brave Wallet,
// Rabby, Rainbow, …) announces itself and shows up in the list with its own
// name and icon. Connecting and signing are real wallet interactions — no
// SDK, no relay service, nothing leaves the page except through the wallet.
export const BASE_SEPOLIA = {
  chainId: "0x14a34",
  chainName: "Base Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: ["https://sepolia.base.org"],
  blockExplorerUrls: ["https://sepolia.basescan.org"],
};

const providers = [];

export function discoverWallets(onUpdate) {
  window.addEventListener("eip6963:announceProvider", (event) => {
    if (!providers.some((p) => p.info.uuid === event.detail.info.uuid)) {
      providers.push(event.detail);
      onUpdate([...providers]);
    }
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  // Legacy fallback: a lone injected provider that predates EIP-6963.
  setTimeout(() => {
    if (providers.length === 0 && window.ethereum) {
      providers.push({
        info: { uuid: "legacy", name: "Browser wallet", icon: null },
        provider: window.ethereum,
      });
      onUpdate([...providers]);
    } else if (providers.length === 0) {
      onUpdate([]);
    }
  }, 500);
}

export async function connectWallet(detail) {
  const [address] = await detail.provider.request({ method: "eth_requestAccounts" });
  return { address, provider: detail.provider, walletName: detail.info.name };
}

// SIWE-lite: prove control of the address with a real signature. The signed
// message is shown verbatim by the wallet — nothing hidden in it.
export async function signIn(connection) {
  const message = [
    "SpendVeto sign-in",
    `wallet: ${connection.address}`,
    `time: ${new Date().toISOString()}`,
    "This signature proves wallet ownership. It costs nothing and authorizes no payment.",
  ].join("\n");
  const signature = await connection.provider.request({
    method: "personal_sign",
    params: [message, connection.address],
  });
  return { message, signature };
}

export async function switchToBaseSepolia(connection) {
  try {
    await connection.provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BASE_SEPOLIA.chainId }] });
    return true;
  } catch (err) {
    if (err?.code === 4902) {
      await connection.provider.request({ method: "wallet_addEthereumChain", params: [BASE_SEPOLIA] });
      return true;
    }
    throw err;
  }
}

export function short(addr) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "";
}

// Static fallback for the chain picker when the local API isn't running
// (e.g. the deployed static site). Mirrors shared-config.js CHAINS.
export const FALLBACK_CHAINS = [
  { id: "base-sepolia", name: "Base Sepolia", status: "live" },
  { id: "base", name: "Base", status: "ready" },
  { id: "ethereum", name: "Ethereum", status: "ready" },
  { id: "polygon", name: "Polygon", status: "ready" },
  { id: "arbitrum", name: "Arbitrum", status: "ready" },
  { id: "optimism", name: "Optimism", status: "ready" },
  { id: "avalanche", name: "Avalanche", status: "ready" },
];

export async function loadChains() {
  try {
    const { chains } = await fetch("http://localhost:8402/api/chains", { signal: AbortSignal.timeout(4000) }).then((r) => r.json());
    return chains;
  } catch {
    return FALLBACK_CHAINS;
  }
}

export async function joinWaitlist({ email, wallet, chains, notes }) {
  const res = await fetch("http://localhost:8402/api/waitlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, wallet, chains, notes }),
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`waitlist API returned ${res.status}`);
  return res.json();
}
