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
 *   pw.biometric = { loaded, supported, enabled, blockedReason, ready }
 *     loaded:    the saved setting has been read (until then, enabled is false)
 *     supported: the phone has strong fingerprint/face set up
 *     enabled:   you switched the option on
 *     blockedReason: why the password is needed this time (restart / 7 days)
 *     ready:     fingerprint/face can be used right now
 *   pw.enableBiometric(password, prompt) / pw.disableBiometric()
 *
 * UPGRADING OLDER WALLETS
 * Wallets set up before Stage 4 use lighter password settings (config.js,
 * PASSWORD_STRETCHING). After a successful PASSWORD check, the key is
 * scrambled again with the current settings and the same password, once.
 * That makes this one unlock take a bit longer. If fingerprint/face is on,
 * this waits (its copy belongs to the current vault) and happens instead when
 * you next switch fingerprint/face on, or change the password.
 *
 * (A "hook", the "use…" name, is React's way of sharing logic between screens.)
 */

import { useEffect, useRef, useState } from 'react';
import { AppState, Keyboard } from 'react-native';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { getBootCount, getElapsedRealtime } from '../../modules/klv-signer-requests/index.js';
import { isWeakerThan, openVault, scramblingKeyFromPassword, WrongPasswordError, lockKeyChecked } from '../crypto/vault.js';
import { PASSWORD_STRETCHING } from '../config.js';
import { engineName } from '../crypto/passwordKey.js';
import { wipeBytes } from '../crypto/wallet.js';
import { loadAttempts, loadVault, saveAttempts, saveVault } from '../storage/secureStore.js';
import {
  canUseBiometrics, loadBiometricState, readBiometricKey, removeBiometric, saveBiometricKey, saveBiometricState,
} from '../storage/biometricStore.js';
import { FRESH_STATE, formatWait, recordFailure, restartIfRebooted, secondsLeft } from './wrongPasswordPolicy.js';
import { afterPasswordUsed, BIOMETRIC_OFF, biometricBlockedReason } from './biometricPolicy.js';

/** Now, by the wall clock AND the stopwatch the user can't change (see wrongPasswordPolicy.js). */
function clock() {
  return { now: Date.now(), elapsed: getElapsedRealtime(), boot: getBootCount() };
}

/**
 * Only ONE password or fingerprint check at a time, across all screens
 * (second review, 1 Oct 2026). A screen that opens while another screen's
 * check is still running can't start a second one in parallel; otherwise
 * several guesses could run at once and be counted as one.
 */
let checkRunning = false;

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
  const [bioLoaded, setBioLoaded] = useState(false); // fingerprint setting read yet?
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
  // Read again whenever the Signer comes back to the front (e.g. after a
  // visit to Android's settings), so the countdown always matches what's saved.
  useEffect(() => {
    const reload = () => loadAttempts()
      .then((a) => setAttempts(restartIfRebooted(a, clock())))
      .catch(() => setAttempts(FRESH_STATE));
    reload();
    loadBiometricState().then((state) => { setBioState(state); setBioLoaded(true); });
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') reload(); });
    return () => sub.remove();
  }, []);

  // Tick once a second, so a waiting-period countdown updates on screen.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Exactly the same clock reading as the check itself uses (clock()), so the
  // countdown on screen and the real wait can never disagree. `now` changes
  // every second and makes the screen redraw.
  const wait = now ? secondsLeft(attempts, clock()) : 0;
  const blockedReason = biometricBlockedReason(bioState, { now, bootCount });
  const biometric = {
    loaded: bioLoaded,
    supported,
    enabled: bioState.enabled,
    blockedReason: blockedReason === 'off' ? null : blockedReason,
    ready: supported && blockedReason === null,
  };

  /**
   * beginPasswordTry — before a password is checked: refuse during a waiting
   * time, and COUNT THE TRY AS WRONG IN ADVANCE ("pessimistic"). A correct
   * password resets the counter afterwards. So a check that's interrupted
   * (app closed mid-check) still counts, and nothing can be guessed for free.
   * @returns {Promise<{ allowed: boolean, before?: object, assumed?: object }>}
   */
  async function beginPasswordTry() {
    const c = clock();
    const before = restartIfRebooted(await loadAttempts(), c);
    const left = secondsLeft(before, c);
    if (left > 0) {
      await saveAttempts(before).catch(() => {});
      setAttempts(before);
      Keyboard.dismiss();
      setMessage(`Still waiting: you can try again in ${formatWait(left)}.`);
      return { allowed: false };
    }
    const assumed = recordFailure(before, c);
    await saveAttempts(assumed);
    return { allowed: true, before, assumed };
  }

  /** A wrong password: it's already counted (beginPasswordTry); show it. */
  function showWrongPassword(state) {
    // If a waiting period just started, close the keyboard so the
    // "try again in …" message isn't hidden behind it.
    if (secondsLeft(state, clock()) > 0) Keyboard.dismiss();
    setAttempts(state);
    setMessage('Wrong password.');
  }

  /** Something other than a wrong password went wrong before the password was checked: undo the advance count. */
  async function undoTry(attempt, verified) {
    if (!verified && attempt && attempt.before) await saveAttempts(attempt.before).catch(() => {});
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

  /**
   * upgradeIfOld — re-scrambles an older, lighter vault with the current
   * settings (same password). Returns the vault now in use. Never fails the
   * unlock: if anything goes wrong, the old vault simply stays.
   */
  async function upgradeIfOld(vault, privateKey, password) {
    if (!isWeakerThan(vault, PASSWORD_STRETCHING)) return vault;
    try {
      // Only if the saved vault is still the one we opened. (Change password
      // saves a new one inside withKey: that must never be overwritten here.)
      const saved = await loadVault();
      if (!saved || saved.salt !== vault.salt) return saved || vault;
      const upgraded = await lockKeyChecked(privateKey, password, vault.address, PASSWORD_STRETCHING);
      await saveVault(upgraded);
      return upgraded;
    } catch {
      return vault;
    }
  }

  async function check(password, withKey) {
    if (running.current || checkRunning) return { ok: false };
    running.current = true;
    checkRunning = true;
    setBusy(true);
    setMessage('');
    const started = Date.now();
    let privateKey = null;
    let scramblingKey = null;
    let attempt = null;
    let verified = false;
    try {
      // Re-read the counter from storage (this screen's copy may be stale).
      attempt = await beginPasswordTry();
      if (!attempt.allowed) return { ok: false };
      const vault = await loadVault();
      scramblingKey = await scramblingKeyFromPassword(vault, password);
      privateKey = openVault(vault, scramblingKey);
      verified = true;
      await recordSuccess(true);
      const info = { seconds: (Date.now() - started) / 1000, engine: engineName() };
      const value = await withKey(privateKey, info);
      // Older wallet? Upgrade it now (not while fingerprint/face is on, see top of file).
      if (!(await loadBiometricState()).enabled) await upgradeIfOld(vault, privateKey, password);
      return { ok: true, value, info };
    } catch (error) {
      if (error instanceof WrongPasswordError) {
        showWrongPassword(attempt.assumed);
      } else {
        await undoTry(attempt, verified);
        setMessage(`Something went wrong: ${error.message}`);
      }
      return { ok: false };
    } finally {
      wipeBytes(privateKey); // always, whatever happened
      wipeBytes(scramblingKey);
      setBusy(false);
      running.current = false;
      checkRunning = false;
    }
  }

  /**
   * checkBiometric — like check(), but Android asks for your fingerprint or
   * face instead of the password. `prompt` is the title Android shows.
   */
  async function checkBiometric(prompt, withKey) {
    if (!biometric.ready || running.current || checkRunning) return { ok: false };
    running.current = true;
    checkRunning = true;
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
      checkRunning = false;
    }
  }

  /**
   * enableBiometric — switches the option on. Needs the password (counted like
   * any password try), then Android asks for a fingerprint/face to save the copy.
   * @returns {Promise<boolean>} true if it's now on
   */
  async function enableBiometric(password, prompt) {
    if (running.current || checkRunning) return false;
    running.current = true;
    checkRunning = true;
    setBusy(true);
    setMessage('');
    let scramblingKey = null;
    let privateKey = null;
    let attempt = null;
    let verified = false;
    try {
      attempt = await beginPasswordTry();
      if (!attempt.allowed) return false;
      let vault = await loadVault();
      scramblingKey = await scramblingKeyFromPassword(vault, password);
      privateKey = openVault(vault, scramblingKey); // proves the password is right
      verified = true;
      await recordSuccess(false);
      // Older wallet? Upgrade it first, so the fingerprint copy belongs to the new vault.
      if (isWeakerThan(vault, PASSWORD_STRETCHING)) {
        vault = await upgradeIfOld(vault, privateKey, password);
        wipeBytes(scramblingKey);
        scramblingKey = await scramblingKeyFromPassword(vault, password);
      }
      wipeBytes(privateKey);
      privateKey = null;
      // Note: the hex text copy can't be wiped from memory (JavaScript text
      // can't be overwritten); it's dropped straight after and cleaned up by
      // JavaScript's memory manager.
      await saveBiometricKey(bytesToHex(scramblingKey), prompt);
      const next = afterPasswordUsed({ ...BIOMETRIC_OFF, enabled: true }, { now: Date.now(), bootCount });
      await saveBiometricState(next);
      setBioState(next);
      return true;
    } catch (error) {
      if (error instanceof WrongPasswordError && !verified) {
        showWrongPassword(attempt.assumed);
      } else {
        await undoTry(attempt, verified);
        if (!wasCancelled(error)) setMessage(`Couldn't switch on fingerprint or face: ${error.message}`);
      }
      return false;
    } finally {
      wipeBytes(privateKey);
      wipeBytes(scramblingKey);
      setBusy(false);
      running.current = false;
      checkRunning = false;
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
