/*
 * BiometricSetting.js — the "Fingerprint or face" switch (Settings screen)
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
import { StyleSheet, View } from 'react-native';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { Body, Button, Field, ListRow, Notice } from './ui.js';
import { usePasswordCheck } from '../security/usePasswordCheck.js';
import { PASSWORD_REFRESH_DAYS } from '../security/biometricPolicy.js';

export default function BiometricSetting() {
  const pw = usePasswordCheck();
  const [asking, setAsking] = useState(false);
  const b = pw.biometric;

  // What the grey line under "Fingerprint or face" says.
  const subtitle = b.enabled && !b.supported
    ? 'On, but this phone has no fingerprint or secure face unlock set up right now'
    : b.enabled
      ? `Password still needed after a restart and every ${PASSWORD_REFRESH_DAYS} days`
      : !b.supported
        ? 'Not available: no strong fingerprint or face unlock on this phone'
        : 'Unlock and approve without typing your password';

  function onToggle(on) {
    pw.clearMessage();
    if (on) setAsking(true);
    else { setAsking(false); pw.disableBiometric(); }
  }

  return (
    <View>
      <ListRow
        title="Fingerprint or face"
        subtitle={subtitle}
        toggle={{ value: b.enabled || asking, onChange: onToggle }}
        disabled={!b.supported && !b.enabled}
        last
      />
      {pw.message && !asking ? <View style={styles.inner}><Notice kind="danger">{pw.message}</Notice></View> : null}
      {asking && !b.enabled ? (
        <View style={styles.inner}>
          <EnableForm pw={pw} onDone={() => setAsking(false)} />
        </View>
      ) : null}
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
  inner: { paddingHorizontal: 16, paddingBottom: 12 },
});
