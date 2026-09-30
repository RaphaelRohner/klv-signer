/*
 * connectedApps.js — saving the list of apps you've allowed
 * =========================================================
 *
 * Kept in expo-secure-store (Android Keystore protected), like the vault.
 * The list itself isn't secret, but keeping it there means no other app can
 * quietly add itself to it. The rules live in requests/appTrust.js.
 */

import * as SecureStore from 'expo-secure-store';

const KEY = 'klvsigner.apps.v1';

/** Read the list: { [package]: { label, certSha256, allowedAt } }. */
export async function loadConnectedApps() {
  const text = await SecureStore.getItemAsync(KEY);
  return text ? JSON.parse(text) : {};
}

/** Save the whole list. */
export async function saveConnectedApps(apps) {
  await SecureStore.setItemAsync(KEY, JSON.stringify(apps));
}

/** Forget all connected apps (used when the wallet is removed). */
export async function clearConnectedApps() {
  await SecureStore.deleteItemAsync(KEY);
}
