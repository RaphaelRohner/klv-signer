/*
 * biometricStore.js — the fingerprint/face copy of the vault's key
 * ===============================================================
 *
 * WHAT IT KEEPS
 * When you switch on "fingerprint or face", the Signer puts a copy of the
 * vault's 32-byte scrambling key (see crypto/vault.js) into a special part of
 * Android's Keystore that only opens after a successful fingerprint or face
 * check. With that copy the Signer can open the vault without the password.
 * The copy opens only this vault; it doesn't reveal your password.
 *
 * HOW ANDROID PROTECTS IT (expo-secure-store's "requireAuthentication")
 *   - Every single read needs a fresh fingerprint/face check, done by the
 *     phone's secure hardware. (Another app could draw a look-alike prompt,
 *     but it would gain nothing: only a real check unlocks the key.)
 *   - Only "strong" (Class 3) biometrics count, never the phone PIN: most
 *     fingerprint readers, and face unlock only on phones with a secure face
 *     sensor. Phones without one simply don't get the option.
 *   - If anyone ADDS a fingerprint or face to the phone (or all of them are
 *     removed, or the screen lock is switched off), Android makes the copy
 *     unusable for good. That stops someone who learns your phone PIN from
 *     adding their own finger. The Signer then asks for the password and
 *     you can switch the option on again.
 *
 * The on/off state and "when was the password last used" are kept separately
 * in normal secure storage (no fingerprint needed to read them).
 */

import * as SecureStore from 'expo-secure-store';
import { BIOMETRIC_OFF } from '../security/biometricPolicy.js';

// Names under which things are saved. Never change these.
export const BIOMETRIC_KEY = 'klvsigner.biometrickey.v1';
export const BIOMETRIC_STATE = 'klvsigner.biometric.v1';
// A separate "keychain" (own Keystore key) just for the fingerprint-protected copy.
export const BIOMETRIC_KEYCHAIN = 'klvsigner.biometric';

/** Can this phone use fingerprint/face for this (strong biometrics set up)? */
export function canUseBiometrics() {
  try {
    return SecureStore.canUseBiometricAuthentication();
  } catch {
    return false;
  }
}

/** On/off state and when the password was last used. */
export async function loadBiometricState() {
  try {
    const text = await SecureStore.getItemAsync(BIOMETRIC_STATE);
    return text ? { ...BIOMETRIC_OFF, ...JSON.parse(text) } : { ...BIOMETRIC_OFF };
  } catch {
    return { ...BIOMETRIC_OFF };
  }
}

export async function saveBiometricState(state) {
  await SecureStore.setItemAsync(BIOMETRIC_STATE, JSON.stringify(state));
}

/**
 * Saves the scrambling key (hex) behind fingerprint/face. Android shows its
 * fingerprint/face prompt to allow the saving. Throws if you cancel.
 */
export async function saveBiometricKey(scramblingKeyHex, prompt) {
  await SecureStore.setItemAsync(BIOMETRIC_KEY, scramblingKeyHex, {
    requireAuthentication: true,
    authenticationPrompt: prompt,
    keychainService: BIOMETRIC_KEYCHAIN,
  });
}

/**
 * Reads the scrambling key (hex) after a fingerprint/face check.
 * Returns null if the copy is gone (e.g. a fingerprint was added to the phone).
 * Throws if you cancel or the check fails.
 */
export async function readBiometricKey(prompt) {
  return SecureStore.getItemAsync(BIOMETRIC_KEY, {
    requireAuthentication: true,
    authenticationPrompt: prompt,
    keychainService: BIOMETRIC_KEYCHAIN,
  });
}

/** Switches the option off and deletes the fingerprint-protected copy. */
export async function removeBiometric() {
  try {
    await SecureStore.deleteItemAsync(BIOMETRIC_KEY, { keychainService: BIOMETRIC_KEYCHAIN });
  } catch {
    // Already gone: fine.
  }
  await SecureStore.deleteItemAsync(BIOMETRIC_STATE);
}
