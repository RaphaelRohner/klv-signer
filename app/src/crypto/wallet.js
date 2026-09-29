/*
 * wallet.js — making and restoring Klever wallets
 * ===============================================
 *
 * WHAT THIS FILE DOES
 *   - creates a brand-new recovery phrase (the list of secret words),
 *   - checks whether a typed-in phrase is valid,
 *   - turns a phrase into the wallet's private key and its public address.
 *
 * WHERE THE RECIPE COMES FROM
 * We don't invent anything here. All the real work is done by Klever's own
 * official library, `@klever/connect-crypto`. That matters: it means a phrase
 * made in the Signer gives exactly the same wallet (same address) in the
 * Klever Wallet app, and the other way around.
 *
 * The recipe, for the curious: the words become a "seed" (standard BIP-39),
 * the seed goes down Klever's standard path  m/44'/690'/0'/0'/0'  (690 is
 * Klever's registered number) to produce the private key (standard SLIP-10
 * for Ed25519 keys), and the public half of the key, written in Klever's
 * "klv1…" format, is the address.
 *
 * SAFETY NOTES
 *   - Nothing in this file saves anything. It only calculates.
 *   - Nothing here ever prints or logs a phrase or a key.
 */

import {
  generateMnemonicPhrase,
  isValidMnemonic,
  mnemonicToPrivateKey,
  getPublicKeyFromPrivateSync,
  PublicKeyImpl,
} from '@klever/connect-crypto';

/*
 * Word count → "strength" in bits, as the phrase library expects it.
 * 12 words = 128 bits, 24 words = 256 bits of randomness.
 */
const STRENGTH_FOR_WORD_COUNT = { 12: 128, 15: 160, 18: 192, 21: 224, 24: 256 };

/**
 * createRecoveryPhrase — makes a brand-new, random recovery phrase.
 *
 * @param {number} wordCount  12 or 24 (we use 24, see config.js)
 * @returns {string} the words separated by single spaces
 */
export function createRecoveryPhrase(wordCount) {
  const strength = STRENGTH_FOR_WORD_COUNT[wordCount];
  if (!strength) {
    throw new Error(`Unsupported word count: ${wordCount}`);
  }
  // Uses the phone's secure random generator (see setupRandom.js).
  return generateMnemonicPhrase({ strength });
}

/**
 * tidyPhrase — cleans up a phrase the user typed or pasted:
 * lower-case, no extra spaces, no line breaks. "  Apple   BANANA\n" → "apple banana".
 *
 * @param {string} text
 * @returns {string}
 */
export function tidyPhrase(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .split(/\s+/)          // split on any run of spaces, tabs or line breaks
    .filter(Boolean)       // drop empty bits
    .join(' ');
}

/**
 * isValidRecoveryPhrase — true if the phrase is a real, correctly typed one.
 *
 * The last word of every recovery phrase contains a small built-in check
 * (a "checksum"), so most typos are caught here instead of silently giving
 * you a different, empty wallet.
 *
 * @param {string} phrase  (should already be tidied with tidyPhrase)
 * @returns {boolean}
 */
export function isValidRecoveryPhrase(phrase) {
  try {
    return isValidMnemonic(phrase);
  } catch {
    return false;
  }
}

/**
 * walletFromPhrase — calculates the wallet that belongs to a phrase.
 *
 * @param {string} phrase  a valid, tidied recovery phrase
 * @returns {{ privateKey: Uint8Array, address: string }}
 *   privateKey — the 32-byte secret. Handle with care, and wipe it with
 *                wipeBytes() once it's been locked in the vault.
 *   address    — the public "klv1…" address. Safe to show and share.
 */
export function walletFromPhrase(phrase) {
  const key = mnemonicToPrivateKey(phrase); // Klever's standard path, see top of file
  const privateKey = key.bytes;
  return { privateKey, address: addressFromPrivateKey(privateKey) };
}

/**
 * addressFromPrivateKey — works out the public "klv1…" address from a private key.
 * (The address can always be calculated from the key, but never the other way round.)
 *
 * @param {Uint8Array} privateKey  32 bytes
 * @returns {string}
 */
export function addressFromPrivateKey(privateKey) {
  const publicKeyBytes = getPublicKeyFromPrivateSync(privateKey);
  return new PublicKeyImpl(publicKeyBytes).toAddress();
}

/**
 * wipeBytes — overwrites secret bytes with zeros once we're done with them,
 * so they don't linger in the phone's memory.
 *
 * (Honest limitation: JavaScript can wipe byte arrays like this, but it can't
 * wipe ordinary text. So the recovery phrase, which is text, lingers in
 * memory until the app is closed. That's normal for apps like this, and it's
 * one reason the Signer locks itself when you leave it.)
 *
 * @param {Uint8Array | undefined | null} bytes
 */
export function wipeBytes(bytes) {
  if (bytes && typeof bytes.fill === 'function') {
    bytes.fill(0);
  }
}
