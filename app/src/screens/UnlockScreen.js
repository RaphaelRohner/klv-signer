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
 *
 * FINGERPRINT OR FACE (optional)
 * If it's on, a "Unlock with fingerprint or face" button sits above the
 * password box (components/BiometricButton.js). The password always works too.
 * (Switched on in Settings.)
 *
 * PHONE-SAFETY WARNING
 * If the phone looks unsafe for a wallet (rooted, unlocked bootloader, no
 * screen lock …), the warning box is shown right here, BEFORE you unlock, so
 * you see it every time you open the Signer. The checks themselves run once
 * when the app starts (App.js) and are explained in security/deviceChecks.js.
 */

import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { Body, Button, Field, NetworkBadge, Notice, Screen, colors } from '../components/ui.js';
import { shortAddress } from '../klever/format.js';
import RemoveWallet from '../components/RemoveWallet.js';
import DeviceWarning from '../components/DeviceWarning.js';
import BiometricButton from '../components/BiometricButton.js';
import { usePasswordCheck } from '../security/usePasswordCheck.js';

/**
 * @param {object} props
 * @param {string} props.address
 * @param {(info: {seconds: number, engine: string}) => void} props.onUnlocked
 *        called after a correct password, with how long it took (test info)
 * @param {() => void} props.onRemoved   called if the wallet is removed ("I forgot my password")
 */
export default function UnlockScreen({ address, deviceFindings, onUnlocked, onRemoved }) {
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
      <View style={styles.badgeRow}><NetworkBadge /></View>
      <View style={styles.brand}>
        <View style={styles.markBox}>
          <Image source={require('../../assets/seal-mark.png')} style={styles.mark} accessibilityIgnoresInvertColors />
        </View>
        <Text style={styles.title} accessibilityRole="header">Unlock KLV Signer</Text>
        <Text style={styles.address} accessibilityLabel={`Wallet ${address}`}>{shortAddress(address)}</Text>
      </View>

      {/* "This phone may not be safe" box. Shows nothing on a safe phone. */}
      <DeviceWarning findings={deviceFindings} />

      <View style={styles.spacer} />

      {/* Messages sit ABOVE the password box: below it, the phone's keyboard
          can cover them (that's how the 30-second message got hidden in testing). */}
      {pw.message ? <Notice kind="danger">{pw.message}</Notice> : null}
      {pw.wait > 0 ? (
        <Notice kind="warning">Too many wrong passwords. You can try again in {pw.waitText}.</Notice>
      ) : null}

      <BiometricButton
        pw={pw}
        title="Unlock with fingerprint or face"
        prompt="Unlock KLV Signer"
        withKey={() => null}
        onDone={(result) => onUnlocked(result.info)}
      />

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
      {pw.busy ? <Body muted style={styles.center}>Checking takes a moment on purpose. It's what makes guessing slow.</Body> : null}

      {/* Forgot-password route: remove the wallet here, then restore it from the phrase. */}
      {showRemove ? (
        <>
          <Body muted style={styles.forgotText}>
            Nobody can recover the password, but your recovery phrase can: remove the wallet from the Signer, then
            restore it with a new password.
          </Body>
          <RemoveWallet onRemoved={onRemoved} onCancel={() => setShowRemove(false)} />
        </>
      ) : (
        <Pressable accessibilityRole="button" onPress={() => setShowRemove(true)} disabled={pw.busy} style={styles.forgot} hitSlop={6}>
          <Text style={styles.forgotLink}>Forgot your password?</Text>
        </Pressable>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  badgeRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  brand: { alignItems: 'center', paddingTop: 32, paddingBottom: 16 },
  markBox: {
    width: 88, height: 88, borderRadius: 24, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  mark: { width: 68, height: 68 },
  title: { color: colors.text, fontSize: 24, fontWeight: '600' },
  address: { color: colors.muted, fontSize: 14, fontFamily: 'monospace', marginTop: 6 },
  spacer: { flexGrow: 1, minHeight: 16 },
  center: { textAlign: 'center', marginTop: 8 },
  forgot: { alignSelf: 'center', paddingVertical: 14, paddingHorizontal: 12, marginTop: 4 },
  forgotLink: { color: colors.accent, fontSize: 14 },
  forgotText: { marginTop: 16 },
});
