/*
 * signingRules.js — saving the "extra confirmation" rules and signing history
 * ==========================================================================
 * Both are kept in the phone's secure storage (like the vault), never leave
 * the phone, and are deleted when the wallet is removed.
 *   - RULES: what you chose on the settings screen (security/extraConfirmation.js)
 *   - HISTORY: which receivers and apps this Signer has signed for, the
 *     times of recent requests (for the "burst" rule), and the transfers
 *     signed in the last hour (receiver ending, token, amount; for the
 *     "same transfer again" rule; older ones are dropped).
 */

import * as SecureStore from 'expo-secure-store';
import { DEFAULT_RULES, EMPTY_HISTORY, checkRules, isWellFormedHistory } from '../security/extraConfirmation.js';

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
// If it can't be read (or is damaged), the Signer becomes MORE careful, not
// less: "unreadable" makes the approval screen ask for the extra
// confirmation (weekly check, 6 Oct 2026; before, the "same transfer again"
// and "many requests quickly" rules then quietly saw nothing).
export const loadHistory = () => loadJson(HISTORY, EMPTY_HISTORY)
  .then((h) => (isWellFormedHistory(h) ? h : { ...EMPTY_HISTORY, unreadable: true }))
  .catch(() => ({ ...EMPTY_HISTORY, unreadable: true }));
export const saveHistory = (history) => SecureStore.setItemAsync(HISTORY, JSON.stringify(history));

/** Deletes rules and history (when the wallet is removed). */
export async function clearSigningData() {
  await SecureStore.deleteItemAsync(RULES);
  await SecureStore.deleteItemAsync(HISTORY);
}

/**
 * forgetApp — forgets that this app ever had something signed, so its next
 * request counts as "an app's first request" again (third review, T5). Used
 * when an app is removed, and when it's allowed (again), e.g. after its
 * certificate changed: a re-installed or different copy starts fresh.
 * Failing here only means the rule may not ask once more: never stops anything.
 */
export async function forgetApp(packageName) {
  try {
    const history = await loadHistory();
    if (!history.apps || !(packageName in history.apps)) return;
    const apps = { ...history.apps };
    delete apps[packageName];
    await saveHistory({ ...history, apps });
  } catch {
    // see above
  }
}
