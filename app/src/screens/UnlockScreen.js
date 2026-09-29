/*
 * UnlockScreen.js — the lock screen: asks for your app password
 * =============================================================
 *
 * Shown whenever the Signer opens with a wallet already set up, and after it
 * locks itself (when you leave the app or tap "Lock now").
 *
 * WHAT HAPPENS WHEN YOU TAP "UNLOCK"
 * The shared password check (security/usePasswordCheck.js) does the work:
 *   1. It checks whether you're in a waiting period after too many wrong
 *      passwords (see security/wrongPasswordPolicy.js).
 *   2. It tries to unscramble the key with what you typed (crypto/vault.js).
 *   3. Right password: the counter resets. This screen doesn't need the key
 *      for anything, so it's wiped from memory straight away. Unlocking only
 *      opens the app. Every signature asks for the password again, on the
 *      approval screen.
 *   4. Wrong password: the counter goes up, and past the free tries you must
 *      wait before trying again. The waiting time survives closing the app,
 *      because the counter is saved.
 */

import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { Body, Button, Field, NetworkBadge, Notice, Screen, Title, colors } from '../components/ui.js';
import RemoveWallet from '../components/RemoveWallet.js';
import { usePasswordCheck } from '../security/usePasswordCheck.js';

/**
 * @param {object} props
 * @param {string} props.address
 * @param {(info: {seconds: number, engine: string}) => void} props.onUnlocked
 *        called after a correct password, with how long it took (test info)
 * @param {() => void} props.onRemoved   called if the wallet is removed ("I forgot my password")
 */
export default function UnlockScreen({ address, onUnlocked, onRemoved }) {
  // The "Show" button can put the password on screen, so block screenshots here.
  usePreventScreenCapture('unlock');
  const [showRemove, setShowRemove] = useState(false);
  const [password, setPassword] = useState('');
  const pw = usePasswordCheck();

  async function unlock() {
    // Nothing to do with the key here: the shared check wipes it right after.
    const result = await pw.check(password, () => null);
    setPassword('');
    if (result.ok) onUnlocked(result.info);
  }

  return (
    <Screen>
      <NetworkBadge />
      <Title>Unlock</Title>
      <Body muted>Wallet</Body>
      <Text selectable style={styles.address}>{address}</Text>

      {/* Messages sit ABOVE the password box: below it, the phone's keyboard
          can cover them (that's how the 30-second message got hidden in testing). */}
      {pw.message ? <Notice kind="danger">{pw.message}</Notice> : null}
      {pw.wait > 0 ? (
        <Notice kind="warning">Too many wrong passwords. You can try again in {pw.waitText}.</Notice>
      ) : null}

      <Field
        label="App password"
        value={password}
        secret
        editable={!pw.busy && pw.wait === 0}
        onChangeText={(value) => { setPassword(value); pw.clearMessage(); }}
        onSubmitEditing={unlock}
        returnKeyType="go"
      />

      <Button
        title={pw.busy ? 'Checking…' : 'Unlock'}
        onPress={unlock}
        busy={pw.busy}
        disabled={!password || pw.wait > 0}
      />
      {pw.busy ? <Body muted>Checking takes a moment on purpose. It's what makes guessing slow.</Body> : null}

      {/* Forgot-password route: remove the wallet here, then restore it from the phrase. */}
      {showRemove ? (
        <RemoveWallet onRemoved={onRemoved} onCancel={() => setShowRemove(false)} />
      ) : (
        <>
          <Body muted style={{ marginTop: 24 }}>
            Forgot your password? Nobody can recover it, but your recovery phrase can: remove the wallet from the
            Signer, then restore it with a new password.
          </Body>
          <Button title="I forgot my password" kind="secondary" onPress={() => setShowRemove(true)} disabled={pw.busy} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  address: { color: colors.accent, fontSize: 14, fontFamily: 'monospace', marginBottom: 16 },
});
