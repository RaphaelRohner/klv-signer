/*
 * networks.js — the Klever networks and their ID numbers
 * ======================================================
 *
 * Every Klever transaction contains a "chain ID" saying which network it's
 * for. The Signer refuses transactions for a different network than the one
 * it's set to (NETWORK in config.js), so a practice transaction can never be
 * turned into a real one, or the other way round.
 *
 * Checked on 29 Sep 2026 with each network's node status page
 * (node.mainnet.klever.org and node.testnet.klever.org).
 */

export const NETWORKS = {
  mainnet: { chainId: '108', label: 'Mainnet (real network)' },
  testnet: { chainId: '109', label: 'Testnet (practice network)' },
};

/** networkForChainId — '109' → 'testnet', unknown → null. */
export function networkForChainId(chainId) {
  const match = Object.entries(NETWORKS).find(([, n]) => n.chainId === chainId);
  return match ? match[0] : null;
}
