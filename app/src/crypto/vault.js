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

/**
 * checkVaultFormat — refuses a vault that isn't one of ours, or whose stored
 * settings are out of range (third review, C6). The range matters mostly
 * upwards: a damaged or tampered file asking for an enormous setting could
 * otherwise hang the phone. (Lowering them doesn't help an attacker: the key
 * would come out different and the seal wouldn't open.) The floor (N 1024)
 * is what the automated tests use; real vaults use 2^17 (older ones 2^15).
 */
const HEX = (len) => new RegExp(`^[0-9a-f]{${len}}$`);
function checkVaultFormat(vault) {
  if (!vault || vault.version !== VAULT_VERSION || vault.kdf !== 'scrypt') {
    throw new Error('This vault was made by a different version of the Signer.');
  }
  const powerOfTwo = Number.isInteger(vault.N) && vault.N >= 1024 && vault.N <= 2 ** 20 && (vault.N & (vault.N - 1)) === 0;
  const ok = powerOfTwo
    && Number.isInteger(vault.r) && vault.r >= 1 && vault.r <= 16
    && Number.isInteger(vault.p) && vault.p >= 1 && vault.p <= 4
    && HEX(32).test(vault.salt) && HEX(24).test(vault.nonce) && HEX(96).test(vault.scrambledKey)
    && typeof vault.address === 'string';
  if (!ok) throw new Error('The stored wallet file is damaged (its settings are out of range).');
}

/**
 * lockKeyChecked — lockKey, then opens the new vault once with the same
 * password and compares, BEFORE it's saved over the old one (weekly check,
 * 6 Oct 2026). If anything went wrong in between, the old vault stays and
 * nobody has to fall back on the recovery words. Costs one extra password
 * check (a second or so).
 */
export async function lockKeyChecked(privateKey, password, address, stretching) {
  const vault = await lockKey(privateKey, password, address, stretching);
  const reopened = await unlockKey(vault, password);
  const same = reopened.length === privateKey.length && reopened.every((b, i) => b === privateKey[i]);
  wipeBytes(reopened);
  if (!same) throw new Error('The new lock could not be opened again, so it was not saved. Nothing changed.');
  return vault;
}
