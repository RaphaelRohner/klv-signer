/*
 * MessageApproveScreen.js — "Do you want to sign this text?"
 * ==========================================================
 *
 * For SIGN_MESSAGE requests (25 Oct 2026; protocol in SIGNER-PROTOCOL.md,
 * signing in klever/signMessage.js). An app asks the wallet to sign a short
 * text, e.g. the Devikins Legacy Hub's chat sign-in, to show you hold this
 * wallet. It is NOT a transaction: nothing is sent, nothing moves, no fee.
 *
 * It shows:
 *   - who is asking (the app's name and ID as ANDROID reports them),
 *   - a clear "not a transaction" header,
 *   - the text itself, in full, in a box labelled as written by the app.
 *     (Here the app's text IS what gets signed – shown exactly, all of it,
 *     after checkMessageText refused anything hidden or reordering.)
 *
 * Approving asks for your app password, or your fingerprint/face if you
 * switched that on (Android's prompt says "Sign a text"). Same rules as for
 * transactions: no signing on a rooted/unlocked phone, fingerprint only while
 * an app with accessibility access could press buttons, screenshots blocked.
 * The extra-confirmation rules (amounts, receivers) are about transactions
 * and don't apply here.
 */

import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { Body, Button, Field, Notice, Screen, Strong, Title, colors } from '../components/ui.js';
import { usePasswordCheck } from '../security/usePasswordCheck.js';
import { signWalletMessage } from '../klever/signMessage.js';
import DeviceWarning from '../components/DeviceWarning.js';
import BiometricButton from '../components/BiometricButton.js';
import {
  fingerprintOnlyText, isFingerprintOnly, isSigningBlocked, SIGNING_BLOCKED_TEXT,
} from '../security/deviceChecks.js';

/**
 * @param {object} props
 * @param {string} props.text         the text to sign (already checked with checkMessageText)
 * @param {string} props.address      this Signer's wallet address
 * @param {{name: string, detail: string}} props.requester  who is asking (from Android)
 * @param {(result: { signatureHex: string }) => boolean|Promise<boolean>} props.onSigned
 * @param {() => void} props.onRejected
 * @param {object[]} [props.deviceFindings]
 * @param {boolean} [props.deviceChecked]
 */
export default function MessageApproveScreen({
  text, address, requester, onSigned, onRejected, deviceFindings, deviceChecked = true,
}) {
  // The phone check's LATEST result decides at the last moment (as on ApproveScreen).
  const blocked = isSigningBlocked(deviceFindings);
  const blockedRef = useRef(blocked);
  useEffect(() => { blockedRef.current = blocked; }, [blocked]);
  const fingerprintOnly = isFingerprintOnly(deviceFindings);
  const fingerprintOnlyRef = useRef(fingerprintOnly);
  useEffect(() => { fingerprintOnlyRef.current = fingerprintOnly; }, [fingerprintOnly]);
  const fingerprintOnlyMessage = fingerprintOnlyText(deviceFindings);
  usePreventScreenCapture('approve-message');
  const [password, setPassword] = useState('');
  const pw = usePasswordCheck();

  /** Signs with the unlocked key, unless signing was switched off meanwhile. */
  function signWithKey(privateKey) {
    if (blockedRef.current) throw new Error(SIGNING_BLOCKED_TEXT);
    return signWalletMessage(text, privateKey, address);
  }
  function signWithKeyPassword(privateKey) {
    if (fingerprintOnlyRef.current) throw new Error(fingerprintOnlyMessage);
    return signWithKey(privateKey);
  }

  async function approve() {
    if (blocked || fingerprintOnly || !deviceChecked) return; // second guard (button hidden/disabled then)
    const result = await pw.check(password, signWithKeyPassword);
    setPassword('');
    if (result.ok) await onSigned(result.value);
  }

  return (
    <Screen>
      {/* Who is asking (Android's information, not the app's) */}
      <View style={styles.requester}>
        <View style={styles.letter}><Text style={styles.letterText}>{(requester.name || '?').slice(0, 1).toUpperCase()}</Text></View>
        <View style={styles.flex}>
          <Text style={styles.requestFrom}>Request from</Text>
          <Text style={styles.value} numberOfLines={2}>{requester.name}</Text>
          <Text style={styles.small} numberOfLines={1}>{requester.detail}</Text>
        </View>
      </View>

      <Title>Sign this text?</Title>
      <DeviceWarning findings={deviceFindings} compact />

      <Notice kind="info">
        <Body>
          <Strong>This is not a transaction.</Strong> Nothing is sent and nothing moves, and there's no fee. Signing
          shows the app that you hold this wallet.
        </Body>
      </Notice>

      {/* The text, in full. Written by the app – that's what you sign. */}
      <View style={styles.textBox}>
        <Text style={styles.cardLabel}>The text · written by the app</Text>
        <Text selectable style={styles.text}>{text}</Text>
      </View>

      <Body muted style={{ marginTop: 8 }}>
        Only sign texts you expect, from apps you trust. If the text asks for something you didn't start, or doesn't
        make sense, tap <Strong>Reject</Strong>.
      </Body>

      {blocked ? (
        <>
          <Notice kind="danger">{SIGNING_BLOCKED_TEXT}</Notice>
          <Button title="Reject" kind="danger" onPress={onRejected} disabled={pw.busy} />
        </>
      ) : (
        <>
          {pw.message ? <Notice kind="danger">{pw.message}</Notice> : null}
          {pw.wait > 0 ? (
            <Notice kind="warning">Too many wrong passwords. You can try again in {pw.waitText}.</Notice>
          ) : null}
          {fingerprintOnly ? (
            <Notice kind="warning">
              <Body>{fingerprintOnlyMessage}</Body>
              {pw.biometric.loaded && !pw.biometric.enabled ? (
                <Body>
                  <Strong>Fingerprint or face isn't switched on in the Signer</Strong> (Settings → Unlocking), so this
                  can't be signed right now. Reject it, or switch the accessibility app off and try again.
                </Body>
              ) : null}
            </Notice>
          ) : null}
          <BiometricButton
            pw={pw}
            title="Approve with fingerprint or face"
            prompt="Sign a text (not a transaction)"
            withKey={signWithKey}
            onDone={(result) => onSigned(result.value)}
            disabled={!deviceChecked}
          />
          {fingerprintOnly ? (
            <Button title="Reject" kind="danger" onPress={onRejected} disabled={pw.busy} />
          ) : (
            <>
              <Field
                label="App password"
                value={password}
                secret
                editable={!pw.busy && pw.wait === 0}
                onChangeText={(value) => { setPassword(value); pw.clearMessage(); }}
              />
              <View style={styles.buttons}>
                <Button title="Reject" kind="danger" onPress={onRejected} disabled={pw.busy} style={styles.half} />
                <Button
                  title={pw.busy ? 'Signing…' : !deviceChecked ? 'Checking…' : 'Approve'}
                  onPress={approve}
                  busy={pw.busy}
                  disabled={!password || pw.wait > 0 || !deviceChecked}
                  style={styles.half}
                />
              </View>
            </>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  requester: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border,
    borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 14,
  },
  letter: {
    width: 40, height: 40, borderRadius: 10, backgroundColor: colors.raised, alignItems: 'center',
    justifyContent: 'center', marginRight: 12,
  },
  letterText: { color: colors.warning, fontSize: 17, fontWeight: '600' },
  requestFrom: { color: colors.muted, fontSize: 12 },
  value: { color: colors.text, fontSize: 16, fontWeight: '600' },
  small: { color: colors.muted, fontSize: 12, fontFamily: 'monospace' },
  cardLabel: { color: colors.muted, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  // Dashed like the transaction notes: text written by the app, clearly set apart from the Signer's own screen.
  textBox: {
    borderColor: '#5A5548', borderWidth: 1, borderStyle: 'dashed', borderRadius: 12,
    padding: 12, marginVertical: 8,
  },
  text: { color: colors.text, fontSize: 15, fontFamily: 'monospace' },
  buttons: { flexDirection: 'row', marginHorizontal: -5 },
  half: { flex: 1, marginHorizontal: 5 },
});
