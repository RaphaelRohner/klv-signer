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
 * Note: we deliberately do NOT use secure-store's own "require fingerprint"
 * option. Its documentation warns the data becomes unreadable forever if
 * you ever add a fingerprint or change your face unlock. And you chose a
 * password instead.
 */

import * as SecureStore from 'expo-secure-store';
import { FRESH_STATE } from '../security/wrongPasswordPolicy.js';

// The names ("keys") under which each item is saved. Never change these, or
// the app won't find wallets that were saved under the old names.
const VAULT = 'klvsigner.vault.v1';
const ADDRESS = 'klvsigner.address.v1';
const ATTEMPTS = 'klvsigner.attempts.v1';

/** Save the sealed vault (and its address) after wallet setup. */
export async function saveVault(vault) {
  await SecureStore.setItemAsync(VAULT, JSON.stringify(vault));
  await SecureStore.setItemAsync(ADDRESS, vault.address);
  await saveAttempts(FRESH_STATE);
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
 * removeWallet — deletes the vault, address and counter from this phone.
 * After this, only the recovery phrase can bring the wallet back.
 */
export async function removeWallet() {
  await SecureStore.deleteItemAsync(VAULT);
  await SecureStore.deleteItemAsync(ADDRESS);
  await SecureStore.deleteItemAsync(ATTEMPTS);
}
