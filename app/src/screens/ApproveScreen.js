/*
 * ApproveScreen.js — "Do you want to sign this?"
 * ==============================================
 *
 * The heart of the Signer (HOW-IT-WORKS.md, section 4, steps 3–5).
 *
 * EVERYTHING SHOWN HERE COMES FROM THE SIGNER'S OWN READING of the
 * transaction (klever/readTransaction.js), never from text the requesting
 * app wrote. What you see is exactly what gets signed.
 *
 * It shows:
 *   - who is asking (in Stage 2 that's always you, pasting by hand; in
 *     Stage 3 it's the app's Android-verified name and ID),
 *   - the network,
 *   - every transfer: what, and to which full address,
 *   - the network fee, any attached note, and the transaction number,
 *   - the transaction's fingerprint (so it can be compared if needed).
 *
 * Approving asks for your app password every time, or your fingerprint/face
 * if you switched that on (Android's prompt then names the amount). The key
 * is unlocked, used for this one signature, and wiped
 * (security/usePasswordCheck.js).
 * Rejecting signs nothing.
 *
 * Screenshots are blocked here (the password can be shown with "Show").
 */

import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { Body, Button, Field, Notice, Screen, Strong, Title, colors } from '../components/ui.js';
import { usePasswordCheck } from '../security/usePasswordCheck.js';
import { signTransaction } from '../klever/signTransaction.js';
import DeviceWarning from '../components/DeviceWarning.js';
import BiometricButton from '../components/BiometricButton.js';
import { isSigningBlocked, SIGNING_BLOCKED_TEXT } from '../security/deviceChecks.js';
import { NETWORKS } from '../klever/networks.js';

/**
 * @param {object} props
 * @param {object} props.reading    result of readTransaction()
 * @param {{name: string, detail: string}} props.requester  who is asking
 * @param {(result: object) => void} props.onSigned   called with { signatureHex, signedTransactionHex }
 * @param {() => void} props.onRejected
 * @param {object[]} [props.deviceFindings]  phone-safety warnings, shown in short form
 */
export default function ApproveScreen({ reading, requester, onSigned, onRejected, deviceFindings, deviceChecked = true }) {
  // Rooted or unlocked phone: show the transaction, but no way to sign it.
  // Before the first phone check has finished, "Approve" waits for it.
  const blocked = isSigningBlocked(deviceFindings);
  // The phone check re-runs whenever the Signer comes back to the front. A ref
  // holds its LATEST result, so signing re-checks it at the very last moment
  // (e.g. if the result changed while Android's fingerprint prompt was open).
  const blockedRef = useRef(blocked);
  useEffect(() => { blockedRef.current = blocked; }, [blocked]);
  usePreventScreenCapture('approve');
  const [password, setPassword] = useState('');
  const pw = usePasswordCheck();
  const several = reading.transfers.length > 1;

  /** Signs with the unlocked key, unless signing was switched off meanwhile. */
  function signWithKey(privateKey) {
    if (blockedRef.current) throw new Error(SIGNING_BLOCKED_TEXT);
    return signTransaction(reading, privateKey);
  }

  async function approve() {
    if (blocked || !deviceChecked) return; // the button is hidden/disabled then; this is a second guard
    const result = await pw.check(password, signWithKey);
    setPassword('');
    if (result.ok) onSigned(result.value);
  }

  return (
    <Screen>
      <Title>Approve this transaction?</Title>
      <DeviceWarning findings={deviceFindings} compact />

      {/* Who is asking */}
      <Row label="Requested by">
        <Text style={styles.value}>{requester.name}</Text>
        <Text style={styles.small}>{requester.detail}</Text>
      </Row>

      <Row label="Network">
        <Text style={[styles.value, { color: reading.network === 'mainnet' ? colors.danger : colors.warning }]}>
          {NETWORKS[reading.network].label}
        </Text>
      </Row>

      {several ? (
        <Notice kind="warning">This transaction contains {reading.transfers.length} transfers. Check every one.</Notice>
      ) : null}

      {/* Every transfer, in full */}
      {reading.transfers.map((t, i) => (
        <View key={i} style={styles.card}>
          <Text style={styles.cardLabel}>{several ? `Transfer ${i + 1}: send` : 'Send'}</Text>
          <Text style={styles.amount}>{t.text}</Text>
          {t.note ? <Text style={styles.small}>{t.note}</Text> : null}
          <Text style={[styles.cardLabel, { marginTop: 10 }]}>To</Text>
          <Text selectable style={styles.address}>{t.to}</Text>
        </View>
      ))}

      <Row label="Network fee">
        <Text style={styles.value}>{reading.fee}</Text>
      </Row>

      {reading.notes.map((n, i) => (
        <Row key={i} label="Attached note">
          <Text style={[styles.value, !n.readable && { color: colors.muted }]}>{n.text}</Text>
        </Row>
      ))}

      <Row label="From">
        <Text style={styles.small}>Your wallet · transaction number {reading.nonce.toString()}</Text>
      </Row>
      <Row label="Fingerprint">
        <Text selectable style={styles.small}>{reading.hashHex}</Text>
      </Row>

      <Body muted style={{ marginTop: 8 }}>
        Signing is final: once the app sends it to the network, it can't be undone. If anything here is not what
        you expected, tap <Strong>Reject</Strong>.
      </Body>

      {blocked ? (
        <Notice kind="danger">{SIGNING_BLOCKED_TEXT}</Notice>
      ) : (
        <>
          {/* Password and buttons. Messages above the box, so the keyboard can't hide them. */}
          {pw.message ? <Notice kind="danger">{pw.message}</Notice> : null}
          {pw.wait > 0 ? (
            <Notice kind="warning">Too many wrong passwords. You can try again in {pw.waitText}.</Notice>
          ) : null}
          <BiometricButton
            pw={pw}
            title="Approve with fingerprint or face"
            prompt={several ? `Sign ${reading.transfers.length} transfers` : `Sign: send ${reading.transfers[0].text}`}
            withKey={signWithKey}
            onDone={(result) => onSigned(result.value)}
            disabled={!deviceChecked}
          />
          <Field
            label="App password"
            value={password}
            secret
            editable={!pw.busy && pw.wait === 0}
            onChangeText={(value) => { setPassword(value); pw.clearMessage(); }}
          />
          <Button
            title={pw.busy ? 'Signing…' : deviceChecked ? 'Approve and sign' : 'Checking the phone…'}
            onPress={approve}
            busy={pw.busy}
            disabled={!password || pw.wait > 0 || !deviceChecked}
          />
        </>
      )}
      <Button title="Reject" kind="danger" onPress={onRejected} disabled={pw.busy} />
    </Screen>
  );
}

/** Row — a small grey label with its value underneath. */
function Row({ label, children }) {
  return (
    <View style={styles.row}>
      <Text style={styles.cardLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginVertical: 8 },
  card: {
    backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 12,
    padding: 14, marginVertical: 8,
  },
  cardLabel: { color: colors.muted, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  amount: { color: colors.text, fontSize: 26, fontWeight: '700' },
  value: { color: colors.text, fontSize: 17, fontWeight: '600' },
  address: { color: colors.accent, fontSize: 15, fontFamily: 'monospace' },
  small: { color: colors.muted, fontSize: 13, fontFamily: 'monospace' },
});
