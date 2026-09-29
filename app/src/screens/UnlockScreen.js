/*
 * UnlockScreen.js — the lock screen: asks for your app password
 * =============================================================
 *
 * Shown whenever the Signer opens with a wallet already set up, and after it
 * locks itself (when you leave the app or tap "Lock now").
 *
 * WHAT HAPPENS WHEN YOU TAP "UNLOCK"
 *   1. We check whether you're in a waiting period after too many wrong
 *      passwords (see security/wrongPasswordPolicy.js).
 *   2. We try to unscramble the key with what you typed (crypto/vault.js).
 *   3. Right password: the counter resets, and the key is wiped from memory
 *      straight away. In Stage 1 there's nothing to sign yet, so unlocking
 *      only proves the password works. From Stage 2 on, this is the moment
 *      the key is used to sign, then wiped.
 *   4. Wrong password: the counter goes up, and past the free tries you must
 *      wait before trying again. The waiting time survives closing the app,
 *      because the counter is saved.
 */

import React, { useEffect, useState } from 'react';
import { Keyboard, StyleSheet, Text } from 'react-native';
import { Body, Button, Field, NetworkBadge, Notice, Screen, Title, colors } from '../components/ui.js';
import RemoveWallet from '../components/RemoveWallet.js';
import { unlockKey, WrongPasswordError } from '../crypto/vault.js';
import { engineName } from '../crypto/passwordKey.js';
import { wipeBytes } from '../crypto/wallet.js';
import { loadAttempts, loadVault, saveAttempts } from '../storage/secureStore.js';
import { FRESH_STATE, recordFailure, secondsLeft } from '../security/wrongPasswordPolicy.js';

/** Turns 75 into "1 min 15 s", for the waiting message. */
function formatWait(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m} min ${s} s` : `${s} s`;
}

/**
 * @param {object} props
 * @param {string} props.address
 * @param {(info: {seconds: number, engine: string}) => void} props.onUnlocked
 *        called after a correct password, with how long it took (test info)
 * @param {() => void} props.onRemoved   called if the wallet is removed ("I forgot my password")
 */
export default function UnlockScreen({ address, onUnlocked, onRemoved }) {
  const [showRemove, setShowRemove] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempts, setAttempts] = useState(FRESH_STATE);
  const [message, setMessage] = useState('');
  // `() => Date.now()` (not `Date.now()`) so the clock is read once, when the screen opens.
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

  async function unlock() {
    // Re-read the counter from storage, in case the screen's copy is stale.
    const current = await loadAttempts();
    if (secondsLeft(current, Date.now()) > 0) {
      setAttempts(current);
      return;
    }

    setBusy(true);
    setMessage('');
    const started = Date.now();
    try {
      const vault = await loadVault();
      const privateKey = await unlockKey(vault, password);
      // Stage 1: nothing to sign yet, so wipe the key immediately.
      wipeBytes(privateKey);
      await saveAttempts(FRESH_STATE);
      setPassword('');
      onUnlocked({ seconds: (Date.now() - started) / 1000, engine: engineName() });
    } catch (error) {
      if (error instanceof WrongPasswordError) {
        const next = recordFailure(current, Date.now());
        await saveAttempts(next);
        // If a waiting period just started, close the keyboard so the
        // "try again in …" message isn't hidden behind it.
        if (secondsLeft(next, Date.now()) > 0) Keyboard.dismiss();
        setAttempts(next);
        setPassword('');
        setMessage('Wrong password.');
      } else {
        setMessage(`Something went wrong: ${error.message}`);
      }
      setBusy(false);
    }
  }

  return (
    <Screen>
      <NetworkBadge />
      <Title>Unlock</Title>
      <Body muted>Wallet</Body>
      <Text selectable style={styles.address}>{address}</Text>

      {/* Messages sit ABOVE the password box: below it, the phone's keyboard
          can cover them (that's how the 30-second message got hidden in testing). */}
      {message ? <Notice kind="danger">{message}</Notice> : null}
      {wait > 0 ? (
        <Notice kind="warning">
          Too many wrong passwords. You can try again in {formatWait(wait)}.
        </Notice>
      ) : null}

      <Field
        label="App password"
        value={password}
        secret
        editable={!busy && wait === 0}
        onChangeText={(value) => { setPassword(value); setMessage(''); }}
        onSubmitEditing={unlock}
        returnKeyType="go"
      />

      <Button
        title={busy ? 'Checking…' : 'Unlock'}
        onPress={unlock}
        busy={busy}
        disabled={!password || wait > 0}
      />
      {busy ? <Body muted>Checking takes a moment on purpose. It's what makes guessing slow.</Body> : null}

      {/* Forgot-password route: remove the wallet here, then restore it from the phrase. */}
      {showRemove ? (
        <RemoveWallet onRemoved={onRemoved} onCancel={() => setShowRemove(false)} />
      ) : (
        <>
          <Body muted style={{ marginTop: 24 }}>
            Forgot your password? Nobody can recover it, but your recovery phrase can: remove the wallet from the
            Signer, then restore it with a new password.
          </Body>
          <Button title="I forgot my password" kind="secondary" onPress={() => setShowRemove(true)} disabled={busy} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  address: { color: colors.accent, fontSize: 14, fontFamily: 'monospace', marginBottom: 16 },
});
