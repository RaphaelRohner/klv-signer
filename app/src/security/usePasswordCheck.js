/*
 * usePasswordCheck.js — the shared "check the password, then use the key" logic
 * ============================================================================
 *
 * Used by every screen that opens the vault:
 *   - the lock screen (UnlockScreen.js)
 *   - the approval screen (ApproveScreen.js), before signing
 *   - the fingerprint/face setting on the Home screen (BiometricSetting.js)
 *
 * Keeping it in one place means the wrong-password rules (free tries, then
 * waiting times, see wrongPasswordPolicy.js) work identically everywhere, and
 * a guesser can't dodge the waiting time by switching screens.
 *
 * HOW A SCREEN USES IT
 *   const pw = usePasswordCheck();
 *   ...
 *   const result = await pw.check(password, (privateKey) => doSomething(privateKey));
 *   // or, if pw.biometric.ready:
 *   const result = await pw.checkBiometric('Approve and sign', (privateKey) => doSomething(privateKey));
 *
 * Both unlock the key, run your function with it, and then ALWAYS wipe the
 * key from memory, even if your function fails. The key never leaves this
 * file except as an argument to yours.
 *
 * FINGERPRINT / FACE (optional, see storage/biometricStore.js and
 * security/biometricPolicy.js)
 *   pw.biometric = { supported, enabled, blockedReason, ready }
 *     supported: the phone has strong fingerprint/face set up
 *     enabled:   you switched the option on
 *     blockedReason: why the password is needed this time (restart / 7 days)
 *     ready:     fingerprint/face can be used right now
 *   pw.enableBiometric(password, prompt) / pw.disableBiometric()
 *
 * (A "hook", the "use…" name, is React's way of sharing logic between screens.)
 */

import { useEffect, useRef, useState } from 'react';
import { Keyboard } from 'react-native';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { getBootCount } from '../../modules/klv-signer-requests/index.js';
import { openVault, scramblingKeyFromPassword, WrongPasswordError } from '../crypto/vault.js';
import { engineName } from '../crypto/passwordKey.js';
import { wipeBytes } from '../crypto/wallet.js';
import { loadAttempts, loadVault, saveAttempts } from '../storage/secureStore.js';
import {
  canUseBiometrics, loadBiometricState, readBiometricKey, removeBiometric, saveBiometricKey, saveBiometricState,
} from '../storage/biometricStore.js';
import { FRESH_STATE, formatWait, recordFailure, secondsLeft } from './wrongPasswordPolicy.js';
import { afterPasswordUsed, BIOMETRIC_OFF, biometricBlockedReason } from './biometricPolicy.js';

const KEY_CHANGED_MESSAGE =
  'Fingerprint or face was switched off, because the fingerprints or face data on this phone changed. ' +
  'Use your password. You can switch it on again on the Home screen.';

/** Android's message when you tap Cancel on its fingerprint prompt (not an error worth showing). */
function wasCancelled(error) {
  return /cancel|negative button/i.test(String(error && error.message));
}

/**
 * @returns {{
 *   check: (password: string, withKey: (key: Uint8Array, info: object) => any) =>
 *          Promise<{ ok: boolean, value?: any, info?: {seconds:number, engine:string} }>,
 *   checkBiometric: (prompt: string, withKey: (key: Uint8Array, info: object) => any) => Promise<{ ok: boolean, value?: any }>,
 *   enableBiometric: (password: string, prompt: string) => Promise<boolean>,
 *   disableBiometric: () => Promise<void>,
 *   biometric: { supported: boolean, enabled: boolean, blockedReason: string|null, ready: boolean },
 *   busy: boolean,        // true while checking (show a spinner)
 *   wait: number,         // seconds before the next password try is allowed (0 = now)
 *   waitText: string,     // the same, as "1 min 15 s"
 *   message: string,      // "Wrong password." or a problem, '' if none
 *   clearMessage: () => void,
 * }}
 */
export function usePasswordCheck() {
  const [attempts, setAttempts] = useState(FRESH_STATE);
  const [bioState, setBioState] = useState(BIOMETRIC_OFF);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  // `() => Date.now()` so the clock is read once, when the screen opens.
  const [now, setNow] = useState(() => Date.now());
  const [supported] = useState(() => canUseBiometrics());
  const [bootCount] = useState(() => getBootCount());
  // Set at once (not on the next screen update), so a quick double tap can't
  // start two checks at the same time.
  const running = useRef(false);

  // Load the saved wrong-password counter and fingerprint setting when the screen opens.
  useEffect(() => {
    loadAttempts().then(setAttempts).catch(() => setAttempts(FRESH_STATE));
    loadBiometricState().then(setBioState);
  }, []);

  // Tick once a second, so a waiting-period countdown updates on screen.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const wait = secondsLeft(attempts, now);
  const blockedReason = biometricBlockedReason(bioState, { now, bootCount });
  const biometric = {
    supported,
    enabled: bioState.enabled,
    blockedReason: blockedReason === 'off' ? null : blockedReason,
    ready: supported && blockedReason === null,
  };

  /** A wrong password: count it, maybe start a waiting period. */
  async function countWrongPassword(current) {
    const next = recordFailure(current, Date.now());
    await saveAttempts(next);
    // If a waiting period just started, close the keyboard so the
    // "try again in …" message isn't hidden behind it.
    if (secondsLeft(next, Date.now()) > 0) Keyboard.dismiss();
    setAttempts(next);
    setMessage('Wrong password.');
  }

  /** Right password or fingerprint: reset the counter; remember when the password was used. */
  async function recordSuccess(viaPassword) {
    await saveAttempts(FRESH_STATE);
    setAttempts(FRESH_STATE);
    if (viaPassword) {
      const state = await loadBiometricState();
      if (state.enabled) {
        const next = afterPasswordUsed(state, { now: Date.now(), bootCount });
        await saveBiometricState(next);
        setBioState(next);
      }
    }
  }

  async function check(password, withKey) {
    if (running.current) return { ok: false };
    running.current = true;
    // Re-read the counter from storage, in case this screen's copy is stale.
    const current = await loadAttempts();
    if (secondsLeft(current, Date.now()) > 0) {
      setAttempts(current);
      running.current = false;
      return { ok: false };
    }

    setBusy(true);
    setMessage('');
    const started = Date.now();
    let privateKey = null;
    let scramblingKey = null;
    try {
      const vault = await loadVault();
      scramblingKey = await scramblingKeyFromPassword(vault, password);
      privateKey = openVault(vault, scramblingKey);
      await recordSuccess(true);
      const info = { seconds: (Date.now() - started) / 1000, engine: engineName() };
      const value = await withKey(privateKey, info);
      return { ok: true, value, info };
    } catch (error) {
      if (error instanceof WrongPasswordError) {
        await countWrongPassword(current);
      } else {
        setMessage(`Something went wrong: ${error.message}`);
      }
      return { ok: false };
    } finally {
      wipeBytes(privateKey); // always, whatever happened
      wipeBytes(scramblingKey);
      setBusy(false);
      running.current = false;
    }
  }

  /**
   * checkBiometric — like check(), but Android asks for your fingerprint or
   * face instead of the password. `prompt` is the title Android shows.
   */
  async function checkBiometric(prompt, withKey) {
    if (!biometric.ready || running.current) return { ok: false };
    running.current = true;
    setBusy(true);
    setMessage('');
    const started = Date.now();
    let privateKey = null;
    let scramblingKey = null;
    try {
      // Step 1: Android's fingerprint/face prompt. Only errors from HERE are
      // reported as "fingerprint or face didn't work".
      let hex;
      try {
        hex = await readBiometricKey(prompt);
      } catch (error) {
        if (!wasCancelled(error)) setMessage(`Fingerprint or face didn't work: ${error.message} Use your password instead.`);
        return { ok: false };
      }
      if (!hex) {
        // Android made the copy unusable (fingerprints, face or screen lock changed).
        await removeBiometric();
        setBioState(BIOMETRIC_OFF);
        setMessage(KEY_CHANGED_MESSAGE);
        return { ok: false };
      }
      // Step 2: open the vault and do the job (e.g. sign).
      scramblingKey = hexToBytes(hex);
      const vault = await loadVault();
      privateKey = openVault(vault, scramblingKey);
      await recordSuccess(false);
      const info = { seconds: (Date.now() - started) / 1000, engine: 'fingerprint or face' };
      const value = await withKey(privateKey, info);
      return { ok: true, value, info };
    } catch (error) {
      if (error instanceof WrongPasswordError) {
        // The copy doesn't fit this vault any more: switch the option off.
        await removeBiometric();
        setBioState(BIOMETRIC_OFF);
        setMessage(KEY_CHANGED_MESSAGE);
      } else {
        setMessage(`Something went wrong: ${error.message}`);
      }
      return { ok: false };
    } finally {
      wipeBytes(privateKey);
      wipeBytes(scramblingKey);
      setBusy(false);
      running.current = false;
    }
  }

  /**
   * enableBiometric — switches the option on. Needs the password (counted like
   * any password try), then Android asks for a fingerprint/face to save the copy.
   * @returns {Promise<boolean>} true if it's now on
   */
  async function enableBiometric(password, prompt) {
    if (running.current) return false;
    running.current = true;
    const current = await loadAttempts();
    if (secondsLeft(current, Date.now()) > 0) {
      setAttempts(current);
      running.current = false;
      return false;
    }
    setBusy(true);
    setMessage('');
    let scramblingKey = null;
    let privateKey = null;
    try {
      const vault = await loadVault();
      scramblingKey = await scramblingKeyFromPassword(vault, password);
      privateKey = openVault(vault, scramblingKey); // proves the password is right
      wipeBytes(privateKey);
      privateKey = null;
      await recordSuccess(false);
      // Note: the hex text copy can't be wiped from memory (JavaScript text
      // can't be overwritten); it's dropped straight after and cleaned up by
      // JavaScript's memory manager.
      await saveBiometricKey(bytesToHex(scramblingKey), prompt);
      const next = afterPasswordUsed({ ...BIOMETRIC_OFF, enabled: true }, { now: Date.now(), bootCount });
      await saveBiometricState(next);
      setBioState(next);
      return true;
    } catch (error) {
      if (error instanceof WrongPasswordError) {
        await countWrongPassword(current);
      } else if (!wasCancelled(error)) {
        setMessage(`Couldn't switch on fingerprint or face: ${error.message}`);
      }
      return false;
    } finally {
      wipeBytes(privateKey);
      wipeBytes(scramblingKey);
      setBusy(false);
      running.current = false;
    }
  }

  async function disableBiometric() {
    try {
      await removeBiometric();
      setBioState(BIOMETRIC_OFF);
      setMessage('');
    } catch (error) {
      setMessage(`Couldn't switch it off: ${error.message}`);
    }
  }

  return {
    check, checkBiometric, enableBiometric, disableBiometric, biometric,
    busy, wait, waitText: formatWait(wait), message, clearMessage: () => setMessage(''),
  };
}
