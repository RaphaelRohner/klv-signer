/*
 * usePasswordCheck.js — the shared "check the password, then use the key" logic
 * ============================================================================
 *
 * Used by every screen that asks for the app password:
 *   - the lock screen (UnlockScreen.js)
 *   - the approval screen (ApproveScreen.js), before signing
 *
 * Keeping it in one place means the wrong-password rules (free tries, then
 * waiting times, see wrongPasswordPolicy.js) work identically everywhere, and
 * a guesser can't dodge the waiting time by switching screens.
 *
 * HOW A SCREEN USES IT
 *   const pw = usePasswordCheck();
 *   ...
 *   const result = await pw.check(password, (privateKey) => doSomething(privateKey));
 *
 * `check` unlocks the key, runs your function with it, and then ALWAYS wipes
 * the key from memory, even if your function fails. The key never leaves
 * this function except as an argument to yours.
 *
 * (A "hook", the "use…" name, is React's way of sharing logic between screens.)
 */

import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';
import { unlockKey, WrongPasswordError } from '../crypto/vault.js';
import { engineName } from '../crypto/passwordKey.js';
import { wipeBytes } from '../crypto/wallet.js';
import { loadAttempts, loadVault, saveAttempts } from '../storage/secureStore.js';
import { FRESH_STATE, formatWait, recordFailure, secondsLeft } from './wrongPasswordPolicy.js';

/**
 * @returns {{
 *   check: (password: string, withKey: (key: Uint8Array, info: object) => any) =>
 *          Promise<{ ok: boolean, value?: any, info?: {seconds:number, engine:string} }>,
 *   busy: boolean,        // true while checking (show a spinner)
 *   wait: number,         // seconds before the next try is allowed (0 = now)
 *   waitText: string,     // the same, as "1 min 15 s"
 *   message: string,      // "Wrong password." or a problem, '' if none
 *   clearMessage: () => void,
 * }}
 */
export function usePasswordCheck() {
  const [attempts, setAttempts] = useState(FRESH_STATE);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  // `() => Date.now()` so the clock is read once, when the screen opens.
  const [now, setNow] = useState(() => Date.now());

  // Load the saved wrong-password counter when the screen opens.
  useEffect(() => {
    loadAttempts().then(setAttempts).catch(() => setAttempts(FRESH_STATE));
  }, []);

  // Tick once a second, so a waiting-period countdown updates on screen.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const wait = secondsLeft(attempts, now);

  async function check(password, withKey) {
    // Re-read the counter from storage, in case this screen's copy is stale.
    const current = await loadAttempts();
    if (secondsLeft(current, Date.now()) > 0) {
      setAttempts(current);
      return { ok: false };
    }

    setBusy(true);
    setMessage('');
    const started = Date.now();
    let privateKey = null;
    try {
      const vault = await loadVault();
      privateKey = await unlockKey(vault, password);
      await saveAttempts(FRESH_STATE);
      setAttempts(FRESH_STATE);
      const info = { seconds: (Date.now() - started) / 1000, engine: engineName() };
      const value = await withKey(privateKey, info);
      return { ok: true, value, info };
    } catch (error) {
      if (error instanceof WrongPasswordError) {
        const next = recordFailure(current, Date.now());
        await saveAttempts(next);
        // If a waiting period just started, close the keyboard so the
        // "try again in …" message isn't hidden behind it.
        if (secondsLeft(next, Date.now()) > 0) Keyboard.dismiss();
        setAttempts(next);
        setMessage('Wrong password.');
      } else {
        setMessage(`Something went wrong: ${error.message}`);
      }
      return { ok: false };
    } finally {
      wipeBytes(privateKey); // always, whatever happened
      setBusy(false);
    }
  }

  return { check, busy, wait, waitText: formatWait(wait), message, clearMessage: () => setMessage('') };
}
