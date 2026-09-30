/*
 * signingRules.js — saving the "extra confirmation" rules and signing history
 * ==========================================================================
 * Both are kept in the phone's secure storage (like the vault), never leave
 * the phone, and are deleted when the wallet is removed.
 *   - RULES: what you chose on the settings screen (security/extraConfirmation.js)
 *   - HISTORY: which receivers and apps this Signer has signed for, and the
 *     times of recent requests (for the "burst" rule). No amounts are kept.
 */

import * as SecureStore from 'expo-secure-store';
import { DEFAULT_RULES, EMPTY_HISTORY, checkRules } from '../security/extraConfirmation.js';

// Names under which things are saved. Never change these.
const RULES = 'klvsigner.rules.v1';
const HISTORY = 'klvsigner.history.v1';

/**
 * Nothing saved yet → the defaults. But a read or format ERROR is passed on
 * (not quietly replaced by the defaults), so the approval screen can ask for
 * the extra confirmation to be safe, and the settings screen can say so.
 */
async function loadJson(key, fallback) {
  const text = await SecureStore.getItemAsync(key);
  return text ? { ...fallback, ...JSON.parse(text) } : { ...fallback };
}

export const loadRules = async () => checkRules(await loadJson(RULES, DEFAULT_RULES));
export const saveRules = (rules) => SecureStore.setItemAsync(RULES, JSON.stringify(rules));
// History: if it can't be read, start empty. That only makes the Signer
// stricter (every receiver and app counts as new again).
export const loadHistory = () => loadJson(HISTORY, EMPTY_HISTORY).catch(() => ({ ...EMPTY_HISTORY }));
export const saveHistory = (history) => SecureStore.setItemAsync(HISTORY, JSON.stringify(history));

/** Deletes rules and history (when the wallet is removed). */
export async function clearSigningData() {
  await SecureStore.deleteItemAsync(RULES);
  await SecureStore.deleteItemAsync(HISTORY);
}
