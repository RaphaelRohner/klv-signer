/*
 * address.js — is this text a real Klever address?
 * ===============================================
 * Used when you add a "trusted receiver" by hand. A Klever address is
 * "klv1" + 58 characters in a format called bech32, whose last 6 characters
 * are a checksum: a single typo is always caught. We also check that it
 * decodes to a 32-byte public key and turns back into exactly the same text.
 */

import { bech32 } from '@scure/base';
import { PublicKeyImpl } from '@klever/connect-crypto';

/** The address, tidied (trimmed, lower case), or null if it isn't a valid Klever address. */
export function validAddressOrNull(text) {
  const a = String(text || '').trim().toLowerCase();
  if (!/^klv1[02-9ac-hj-np-z]{58}$/.test(a)) return null;
  try {
    const decoded = bech32.decode(a);
    if (decoded.prefix !== 'klv') return null;
    const bytes = Uint8Array.from(bech32.fromWords(decoded.words));
    if (bytes.length !== 32) return null;
    return new PublicKeyImpl(bytes).toAddress() === a ? a : null;
  } catch {
    return null;
  }
}
