/*
 * ConnectAppScreen.js — "Allow this app to use the Signer?"
 * =========================================================
 *
 * Shown the first time an app asks the Signer for something (and again, with
 * a warning, if a remembered app suddenly has a different certificate).
 *
 * What you see comes from Android, not from the app:
 *   - the app's name (note: any app can CALL itself anything),
 *   - its package id (unique on this phone: the thing to check),
 *   - its certificate fingerprint (unique to its developer).
 *
 * Allowing only means the app may SEND requests. It learns your address, and
 * every transaction still needs your approval and password, one by one.
 * You can remove connected apps on Settings at any time.
 *
 * Allowing needs your password or fingerprint/face (third review, 5 Oct
 * 2026): otherwise an app with accessibility access could tap "Allow" for
 * itself. While such an app is on (fingerprint-only mode, see
 * security/deviceChecks.js), only fingerprint/face is accepted.
 */

import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Body, Button, Field, NetworkBadge, Notice, Screen, Strong, Title, colors } from '../components/ui.js';
import BiometricButton from '../components/BiometricButton.js';
import { usePasswordCheck } from '../security/usePasswordCheck.js';
import { FINGERPRINT_ONLY_TEXT, isFingerprintOnly } from '../security/deviceChecks.js';
import { shortFingerprint, cleanLabel } from '../requests/appTrust.js';
import { describeAction } from '../requests/protocol.js';

/**
 * @param {object} props
 * @param {object} props.request   the incoming request (caller details from Android)
 * @param {'unknown'|'certChanged'} props.trust
 * @param {() => void} props.onAllow   called after the password or fingerprint/face was confirmed
 * @param {() => void} props.onDeny
 * @param {object[]} [props.deviceFindings]  phone-safety results (for fingerprint-only mode)
 */
export default function ConnectAppScreen({ request, trust, onAllow, onDeny, deviceFindings }) {
  const changed = trust === 'certChanged';
  const fingerprintOnly = isFingerprintOnly(deviceFindings);
  const pw = usePasswordCheck();
  const [password, setPassword] = useState('');

  // The check unlocks the vault only to prove it's you; the key isn't used.
  async function allowWithPassword() {
    if (fingerprintOnly) return; // the box is hidden then; second guard
    const result = await pw.check(password, () => true);
    setPassword('');
    if (result.ok) onAllow();
  }
  return (
    <Screen>
      <NetworkBadge />
      <Title>{changed ? 'This app has changed' : 'Allow this app?'}</Title>

      {changed ? (
        <Notice kind="danger">
          <Body>
            <Strong>Careful:</Strong> an app with this id was allowed before, but it was signed by a different
            developer certificate. It may be a fake copy. Only allow it if you know it was reinstalled from a
            source you trust.
          </Body>
        </Notice>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.label}>App name</Text>
        <Text style={styles.name}>{cleanLabel(request.callerLabel)}</Text>
        <Text style={[styles.label, { marginTop: 10 }]}>App id (check this)</Text>
        <Text selectable style={styles.mono}>{request.callerPackage}</Text>
        <Text style={[styles.label, { marginTop: 10 }]}>Certificate fingerprint</Text>
        <Text selectable style={styles.monoSmall}>{shortFingerprint(request.callerCertSha256)}</Text>
      </View>

      <Body>
        It wants to <Strong>{describeAction(request.action)}</Strong>.
      </Body>
      <Notice kind="info">
        <Body>
          If you allow it, this app can see your wallet address and send you transactions to approve. It can never
          sign anything by itself: every transaction still needs your approval and password. You can remove it
          under Settings → Connected apps at any time.
        </Body>
      </Notice>

      {pw.message ? <Notice kind="danger">{pw.message}</Notice> : null}
      {pw.wait > 0 ? <Notice kind="warning">Too many wrong passwords. You can try again in {pw.waitText}.</Notice> : null}
      {fingerprintOnly ? (
        <Notice kind="warning">
          <Body>{FINGERPRINT_ONLY_TEXT}</Body>
          {pw.biometric.loaded && !pw.biometric.enabled ? (
            <Body><Strong>Fingerprint or face isn't switched on in the Signer</Strong>, so no app can be allowed right now.</Body>
          ) : null}
        </Notice>
      ) : null}
      <BiometricButton
        pw={pw}
        title="Allow with fingerprint or face"
        prompt={`Allow ${cleanLabel(request.callerLabel)} to use the Signer`}
        withKey={() => true}
        onDone={() => onAllow()}
      />
      {fingerprintOnly ? null : (
        <>
          <Field
            label="App password (to allow it)"
            value={password}
            secret
            editable={!pw.busy && pw.wait === 0}
            onChangeText={(value) => { setPassword(value); pw.clearMessage(); }}
          />
          <Button
            title={pw.busy ? 'Checking…' : 'Allow'}
            onPress={allowWithPassword}
            busy={pw.busy}
            disabled={!password || pw.wait > 0}
          />
        </>
      )}
      <Button title="Don't allow" kind="danger" onPress={onDeny} disabled={pw.busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 12,
    padding: 14, marginVertical: 12,
  },
  label: { color: colors.muted, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  name: { color: colors.text, fontSize: 22, fontWeight: '700' },
  mono: { color: colors.accent, fontSize: 15, fontFamily: 'monospace' },
  monoSmall: { color: colors.muted, fontSize: 13, fontFamily: 'monospace' },
});
