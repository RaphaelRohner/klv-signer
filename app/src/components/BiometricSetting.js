/*
 * BiometricSetting.js — the "Fingerprint or face" switch on the Home screen
 * ========================================================================
 *
 * Lets you choose whether the Signer may use your fingerprint or face as a
 * shortcut for the app password (on the Unlock and approval screens).
 *
 *   Switching ON: type your password once (it's checked like any password
 *   try), then Android asks for your fingerprint/face to store the shortcut
 *   (see storage/biometricStore.js).
 *   Switching OFF: no password needed; the shortcut is deleted.
 *
 * The password always keeps working, and is still asked after a phone
 * restart and at least once every 7 days (security/biometricPolicy.js).
 * If the phone has no fingerprint or secure face unlock, it says so.
 */

import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { Body, Button, Field, Notice, colors } from './ui.js';
import { usePasswordCheck } from '../security/usePasswordCheck.js';
import { PASSWORD_REFRESH_DAYS } from '../security/biometricPolicy.js';

export default function BiometricSetting() {
  const pw = usePasswordCheck();
  const [asking, setAsking] = useState(false);
  const b = pw.biometric;

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Fingerprint or face</Text>
      {pw.message && !asking ? <Notice kind="danger">{pw.message}</Notice> : null}

      {b.enabled && !b.supported ? (
        <>
          <Body>
            On, but not usable right now: this phone has no fingerprint or secure face unlock set up at the moment.
            Set one up again in Android's settings, or switch this off.
          </Body>
          <Button title="Switch off" kind="secondary" onPress={() => pw.disableBiometric()} />
        </>
      ) : b.enabled ? (
        <>
          <Body>
            <Text style={styles.on}>On.</Text> You can unlock and approve with your fingerprint or face. Your password
            always works too, and is asked after a phone restart and at least once every {PASSWORD_REFRESH_DAYS} days.
          </Body>
          <Button title="Switch off" kind="secondary" onPress={() => pw.disableBiometric()} />
        </>
      ) : !b.supported ? (
        <Body muted>
          This phone has no fingerprint or secure face unlock set up, so the Signer uses your password only. (Android
          only allows "strong" fingerprint or face checks to protect keys. Most face unlocks don't qualify.)
        </Body>
      ) : asking ? (
        <EnableForm pw={pw} onDone={() => setAsking(false)} />
      ) : (
        <>
          <Body muted>
            Off. Switch it on to unlock and approve with your fingerprint or face instead of typing your password.
            The password always keeps working.
          </Body>
          <Button title="Switch on" kind="secondary" onPress={() => setAsking(true)} />
        </>
      )}
    </View>
  );
}

/** The "type your password to switch it on" part (its own piece, so screenshots are blocked only while it shows). */
function EnableForm({ pw, onDone }) {
  usePreventScreenCapture('biometric-setting');
  const [password, setPassword] = useState('');

  async function enable() {
    const ok = await pw.enableBiometric(password, 'Switch on fingerprint or face for KLV Signer');
    setPassword('');
    if (ok) onDone();
  }

  return (
    <>
      <Body muted>Type your app password once. Then Android asks for your fingerprint or face to confirm.</Body>
      {pw.message ? <Notice kind="danger">{pw.message}</Notice> : null}
      {pw.wait > 0 ? <Notice kind="warning">Too many wrong passwords. You can try again in {pw.waitText}.</Notice> : null}
      <Field
        label="App password"
        value={password}
        secret
        editable={!pw.busy && pw.wait === 0}
        onChangeText={(value) => { setPassword(value); pw.clearMessage(); }}
      />
      <Button
        title={pw.busy ? 'Checking…' : 'Continue'}
        onPress={enable}
        busy={pw.busy}
        disabled={!password || pw.wait > 0}
      />
      <Button title="Cancel" kind="secondary" onPress={() => { pw.clearMessage(); onDone(); }} disabled={pw.busy} />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 24 },
  heading: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 8 },
  on: { color: colors.accent, fontWeight: '700' },
});
