/*
 * secureStore.js — saving things on the phone, safely
 * ===================================================
 *
 * WHAT THIS FILE DOES
 * It's the only file that saves or reads anything on the phone. It keeps
 * three things:
 *
 *   1. the VAULT: your scrambled private key (see crypto/vault.js),
 *   2. the ADDRESS: your public klv1… address (not secret, but kept here so
 *      we can show it without unlocking),
 *   3. the WRONG-PASSWORD COUNTER (see security/wrongPasswordPolicy.js).
 *
 * WHERE IT'S KEPT
 * In `expo-secure-store`. On Android, that's storage scrambled by the
 * **Android Keystore**, the phone's built-in safe for app secrets. So the
 * vault has two locks: our password lock, and Android's own lock on top.
 * Other apps can't read it, and (because cloud backup is switched off in
 * app.json) it's never copied off the phone by Android backups.
 *
 * The vault itself never needs a fingerprint: the password always opens it.
 * The optional fingerprint/face shortcut keeps its own separate copy of the
 * vault's key (see storage/biometricStore.js). If Android destroys that copy
 * (e.g. when a fingerprint is added to the phone), nothing is lost: the
 * password still works.
 */

import * as SecureStore from 'expo-secure-store';
import { FRESH_STATE } from '../security/wrongPasswordPolicy.js';
import { clearConnectedApps } from './connectedApps.js';
import { removeBiometric } from './biometricStore.js';
import { clearSigningData } from './signingRules.js';

// The names ("keys") under which each item is saved. Never change these, or
// the app won't find wallets that were saved under the old names.
const VAULT = 'klvsigner.vault.v1';
const ADDRESS = 'klvsigner.address.v1';
const ATTEMPTS = 'klvsigner.attempts.v1';

/**
 * saveVault — save the sealed vault (and its address).
 *
 * Order matters (second review, 1 Oct 2026): the address first, the vault
 * LAST. So if anything fails, the old vault (and old password) stays in
 * place; and if the vault write succeeds, everything is done. Resetting the
 * wrong-password counter afterwards is a bonus that may fail without harm.
 *
 * { isNewWallet: true } (wallet setup) refuses to replace an existing
 * wallet: that only ever happens through "Remove wallet" first.
 */
export async function saveVault(vault, { isNewWallet = false } = {}) {
  if (isNewWallet && (await SecureStore.getItemAsync(VAULT))) {
    throw new Error('A wallet is already saved on this phone. Remove it first (Home or Unlock screen).');
  }
  // A new vault has a new scrambling key: any old fingerprint copy is useless.
  await removeBiometric();
  await SecureStore.setItemAsync(ADDRESS, vault.address);
  await SecureStore.setItemAsync(VAULT, JSON.stringify(vault));
  try {
    await saveAttempts(FRESH_STATE);
  } catch {
    // Not critical: the counter resets at the next correct password anyway.
  }
}

/** Read the sealed vault, or null if no wallet is set up. */
export async function loadVault() {
  const text = await SecureStore.getItemAsync(VAULT);
  return text ? JSON.parse(text) : null;
}

/** Read the wallet's public address, or null if no wallet is set up. */
export async function loadAddress() {
  return SecureStore.getItemAsync(ADDRESS);
}

/** Read the wrong-password counter. */
export async function loadAttempts() {
  const text = await SecureStore.getItemAsync(ATTEMPTS);
  return text ? JSON.parse(text) : { ...FRESH_STATE };
}

/** Save the wrong-password counter. */
export async function saveAttempts(state) {
  await SecureStore.setItemAsync(ATTEMPTS, JSON.stringify(state));
}

/**
 * removeWallet — deletes the vault, address, counter, the list of connected
 * apps, the fingerprint/face copy, and the extra-confirmation rules and
 * signing history from this phone. After this, only the
 * recovery phrase can bring the wallet back (and apps have to ask "Allow this
 * app?" again).
 */
export async function removeWallet() {
  // Fingerprint copy first, so it can't be left behind if a later step fails.
  await removeBiometric();
  await SecureStore.deleteItemAsync(VAULT);
  await SecureStore.deleteItemAsync(ADDRESS);
  await SecureStore.deleteItemAsync(ATTEMPTS);
  await clearConnectedApps();
  await clearSigningData(); // extra-confirmation rules and signing history
}
