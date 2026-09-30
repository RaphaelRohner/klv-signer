/*
 * vault.js — scrambling and unscrambling the private key with your password
 * =========================================================================
 *
 * WHAT THIS FILE DOES
 *   lockKey(privateKey, password, address)  → a "sealed vault" (safe to store)
 *   unlockKey(vault, password)              → the private key again,
 *                                             or a WrongPasswordError
 *
 * THE RECIPE (see also HOW-IT-WORKS.md, section 5)
 *   1. Pick a random SALT (16 bytes) and a random NONCE (12 bytes).
 *      Neither is secret. They just make every vault unique.
 *   2. password + salt → (slow scrypt, see passwordKey.js) → 32-byte scrambling key
 *   3. Scramble the private key with **AES-256-GCM** using that key and nonce.
 *      AES-GCM is the standard used for secure websites and messaging. The
 *      "GCM" part adds a tamper seal: if even one byte of the vault is
 *      changed, or the password is wrong, unscrambling fails loudly instead
 *      of producing garbage.
 *   4. The vault stores: format version, stretching settings, salt, nonce,
 *      the scrambled key, and the wallet address. **Never the password.**
 *
 * EXTRA SAFETY DETAIL
 * The wallet address is "glued" to the seal (as so-called associated data).
 * Swapping in a different address without the password breaks the seal.
 * And after unlocking we double-check that the key really belongs to the
 * stored address.
 *
 * This file only calculates. Saving the vault to the phone is done by
 * storage/secureStore.js.
 */

import { gcm } from '@noble/ciphers/aes';
import { randomBytes, bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { keyFromPassword } from './passwordKey.js';
import { addressFromPrivateKey, wipeBytes } from './wallet.js';

/** The vault format version. Bump this if the recipe ever changes. */
const VAULT_VERSION = 1;

/**
 * WrongPasswordError — what unlockKey() throws when the password is wrong
 * (or the stored vault has been damaged; from the outside the two look the
 * same, on purpose).
 */
export class WrongPasswordError extends Error {
  constructor() {
    super('Wrong password');
    this.name = 'WrongPasswordError';
  }
}

/** The "glue" text that ties a vault to its wallet address (see top of file). */
function sealLabel(address) {
  return new TextEncoder().encode(`klv-signer-vault-v${VAULT_VERSION}:${address}`);
}

/**
 * lockKey — scrambles the private key with the password.
 *
 * @param {Uint8Array} privateKey  the 32-byte wallet secret
 * @param {string} password        the app password the user chose
 * @param {string} address         the wallet's klv1… address
 * @param {{N:number,r:number,p:number}} stretching  see config.js
 * @returns {Promise<object>} the sealed vault: a small object of plain text
 *   fields, ready to be saved
 */
export async function lockKey(privateKey, password, address, stretching) {
  const salt = randomBytes(16);
  const nonce = randomBytes(12);
  const scramblingKey = await keyFromPassword(password, salt, stretching);
  try {
    const scrambled = gcm(scramblingKey, nonce, sealLabel(address)).encrypt(privateKey);
    return {
      version: VAULT_VERSION,
      kdf: 'scrypt',
      N: stretching.N,
      r: stretching.r,
      p: stretching.p,
      salt: bytesToHex(salt),
      nonce: bytesToHex(nonce),
      scrambledKey: bytesToHex(scrambled),
      address,
    };
  } finally {
    wipeBytes(scramblingKey);
  }
}

/**
 * unlockKey — unscrambles the private key with the password.
 * Throws WrongPasswordError if the password is wrong (or the vault damaged).
 * The caller must wipe the returned key (wipeBytes) as soon as it's done.
 *
 * It's two steps, also used separately by the fingerprint/face option:
 *   1. scramblingKeyFromPassword: the slow password step (scrypt).
 *   2. openVault: unscramble with the resulting 32-byte "scrambling key".
 */
export async function unlockKey(vault, password) {
  const scramblingKey = await scramblingKeyFromPassword(vault, password);
  try {
    return openVault(vault, scramblingKey);
  } finally {
    wipeBytes(scramblingKey);
  }
}

/**
 * scramblingKeyFromPassword — the slow password step on its own.
 * Returns the vault's 32-byte scrambling key (NOT yet checked: openVault
 * tells whether it's right). The caller must wipe it.
 */
export async function scramblingKeyFromPassword(vault, password) {
  checkVaultFormat(vault);
  return keyFromPassword(password, hexToBytes(vault.salt), { N: vault.N, r: vault.r, p: vault.p });
}

/**
 * openVault — unscrambles the private key with the scrambling key.
 *
 * The fingerprint/face option keeps a copy of the scrambling key in Android's
 * fingerprint-protected storage (see storage/biometricStore.js), so it can
 * open the vault without the password. That copy opens only THIS vault: it
 * doesn't reveal the password.
 *
 * Throws WrongPasswordError if the key doesn't fit. The caller must wipe the
 * returned private key; the scrambling key stays the caller's to wipe.
 */
export function openVault(vault, scramblingKey) {
  checkVaultFormat(vault);
  let privateKey;
  try {
    privateKey = gcm(scramblingKey, hexToBytes(vault.nonce), sealLabel(vault.address)).decrypt(hexToBytes(vault.scrambledKey));
  } catch {
    // The tamper seal didn't match: wrong password (or damaged vault).
    throw new WrongPasswordError();
  }

  // Double-check: does this key really belong to the stored address?
  if (addressFromPrivateKey(privateKey) !== vault.address) {
    wipeBytes(privateKey);
    throw new WrongPasswordError();
  }
  return privateKey;
}

/**
 * isWeakerThan — true if this vault was made with lighter password settings
 * than `stretching` (e.g. a Stage 1–3 wallet), so it's worth upgrading.
 */
export function isWeakerThan(vault, stretching) {
  if (!vault) return false;
  return vault.N < stretching.N || vault.r < stretching.r || vault.p < stretching.p;
}

function checkVaultFormat(vault) {
  if (!vault || vault.version !== VAULT_VERSION || vault.kdf !== 'scrypt') {
    throw new Error('This vault was made by a different version of the Signer.');
  }
}
