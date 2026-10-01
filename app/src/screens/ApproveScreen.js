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
 * EXTRA CONFIRMATION (security/extraConfirmation.js, settings on Home)
 * If the transaction hits one of your rules (large amount, new receiver, an
 * app's first request, …), the screen says why and asks for more: the
 * fingerprint shortcut isn't offered, you type the last 6 characters of each
 * receiver address, and "Approve" may wait a few seconds. After a successful
 * signature, the receivers and the app are remembered (on this phone only),
 * so they aren't "new" next time.
 *
 * Screenshots are blocked here (the password can be shown with "Show").
 */

import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { AddressBlocks, Body, Button, Field, Notice, Screen, Strong, Title, colors } from '../components/ui.js';
import { usePasswordCheck } from '../security/usePasswordCheck.js';
import { signTransaction } from '../klever/signTransaction.js';
import DeviceWarning from '../components/DeviceWarning.js';
import BiometricButton from '../components/BiometricButton.js';
import { isSigningBlocked, SIGNING_BLOCKED_TEXT } from '../security/deviceChecks.js';
import { NETWORKS } from '../klever/networks.js';
import {
  ADDRESS_ENDING_LENGTH, WAIT_CHOICES, endingMatches, reasonsForExtraConfirmation, receiversToConfirm, withRequest, withSigned,
} from '../security/extraConfirmation.js';
import { loadHistory, loadRules, saveHistory } from '../storage/signingRules.js';

/**
 * @param {object} props
 * @param {object} props.reading    result of readTransaction()
 * @param {{name: string, detail: string}} props.requester  who is asking
 * @param {(result: object) => boolean|Promise<boolean>} props.onSigned   called with { signatureHex, signedTransactionHex };
 *        returns true if the signature reached the app
 * @param {() => void} props.onRejected
 * @param {object[]} [props.deviceFindings]  phone-safety warnings, shown in short form
 * @param {string|null} [props.appId]  the asking app's ID (null = pasted by hand), for the extra-confirmation rules
 */
export default function ApproveScreen({
  reading, requester, onSigned, onRejected, deviceFindings, deviceChecked = true, appId = null,
}) {
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

  // --- Extra confirmation -------------------------------------------------
  // null = still checking the rules; [] = not needed; otherwise the reasons.
  const [extra, setExtra] = useState(null);
  const [endings, setEndings] = useState({}); // receiver address → what you typed
  const [waitLeft, setWaitLeft] = useState(0);
  const receivers = receiversToConfirm(reading);
  const needExtra = !!extra && extra.length > 0;
  const endingsOk = !needExtra || receivers.every((a) => endingMatches(a, endings[a]));
  const ready = extra !== null && endingsOk && waitLeft === 0;
  const needExtraRef = useRef(true); // until the rules are known, assume extra is needed
  useEffect(() => { needExtraRef.current = extra === null || needExtra; }, [extra, needExtra]);

  // When the screen opens: check the rules against this Signer's own history,
  // then note this request (for the "many requests quickly" rule).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [rules, history] = await Promise.all([loadRules(), loadHistory()]);
      const now = Date.now();
      const reasons = reasonsForExtraConfirmation(reading, rules, history, { appId, now });
      try {
        await saveHistory(withRequest(history, now, reading.hashHex));
      } catch {
        // Couldn't note this request, so the "many requests quickly" rule can't
        // work reliably: ask for the extra confirmation to be safe.
        if (rules.burst && !reasons.some((r) => r.id === 'burst')) {
          reasons.push({ id: 'burst', text: 'The Signer couldn\'t record this request, so it asks for the extra confirmation to be safe.' });
        }
      }
      if (!cancelled) {
        setExtra(reasons);
        if (reasons.length > 0) setWaitLeft(rules.waitSeconds || 0);
      }
    })().catch(() => {
      // Couldn't read the settings: be careful rather than relaxed.
      // The longest wait is used, since the chosen wait can't be read either.
      if (!cancelled) {
        setExtra([{ id: 'unknown', text: 'The Signer couldn\'t read your extra-confirmation settings, so it asks for it to be safe.' }]);
        setWaitLeft(Math.max(...WAIT_CHOICES));
      }
    });
    return () => { cancelled = true; };
  }, [reading, appId]);

  // The optional wait: count down once a second.
  useEffect(() => {
    if (waitLeft <= 0) return undefined;
    const timer = setTimeout(() => setWaitLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [waitLeft]);

  /** Signs with the unlocked key, unless signing was switched off meanwhile. */
  function signWithKey(privateKey) {
    if (blockedRef.current) throw new Error(SIGNING_BLOCKED_TEXT);
    if (!ready) throw new Error('The extra confirmation isn\'t complete.'); // second guard
    return signTransaction(reading, privateKey);
  }

  /** Fingerprint/face path: only allowed when no extra confirmation is needed (checked again here). */
  function signWithKeyBiometric(privateKey) {
    if (needExtraRef.current) throw new Error('This transaction needs the extra confirmation with your password.');
    return signWithKey(privateKey);
  }

  /**
   * After a signature: hand it over, then remember the receivers and the app
   * (on this phone). Only remembered if the signature really reached the app
   * (onSigned returns true); otherwise a receiver you never actually sent to
   * would count as "known" next time (second review).
   */
  async function finish(value) {
    const delivered = await onSigned(value);
    if (delivered !== true) return;
    try {
      await saveHistory(withSigned(await loadHistory(), reading, appId, Date.now()));
    } catch {
      // Not remembering only means "new receiver" may be asked again next time.
    }
  }

  async function approve() {
    if (blocked || !deviceChecked || !ready) return; // the button is hidden/disabled then; this is a second guard
    const result = await pw.check(password, signWithKey);
    setPassword('');
    if (result.ok) await finish(result.value);
  }

  return (
    <Screen>
      {/* Who is asking, and on which network */}
      <View style={styles.requester}>
        <View style={styles.letter}><Text style={styles.letterText}>{(requester.name || '?').slice(0, 1).toUpperCase()}</Text></View>
        <View style={styles.flex}>
          <Text style={styles.requestFrom}>Request from</Text>
          <Text style={styles.value} numberOfLines={2}>{requester.name}</Text>
          <Text style={styles.small} numberOfLines={1}>{requester.detail}</Text>
        </View>
        <View
          style={[styles.netBadge, { backgroundColor: reading.network === 'mainnet' ? colors.danger : colors.warning }]}
          accessibilityLabel={`Network: ${NETWORKS[reading.network].label}`}
        >
          <Text style={styles.netBadgeText}>{reading.network === 'mainnet' ? 'MAINNET' : 'TESTNET'}</Text>
        </View>
      </View>

      <Title>Approve this transaction?</Title>
      <DeviceWarning findings={deviceFindings} compact />

      {several ? (
        <Notice kind="warning">This transaction contains {reading.transfers.length} transfers. Check every one.</Notice>
      ) : null}

      {/* Every transfer, in full */}
      {reading.transfers.map((t, i) => (
        <View key={i} style={styles.card}>
          <Text style={styles.cardLabel}>{several ? `Transfer ${i + 1}: send` : 'Send'}</Text>
          <Text style={styles.amount}>{t.text}</Text>
          {t.note ? <Text style={styles.small}>{t.note}</Text> : null}
          <View style={styles.cardDivider} />
          <Text style={styles.cardLabel}>To</Text>
          {/* In little boxes, easier to compare by eye. When the ending must
              be typed, the last box (exactly those 6 characters) is outlined. */}
          <AddressBlocks address={t.to} markLast={needExtra} muted />
        </View>
      ))}

      <View style={styles.tiles}>
        <View style={styles.tile}>
          <Text style={styles.tileLabel}>Network fee</Text>
          <Text style={styles.tileValue}>{reading.fee}</Text>
        </View>
        <View style={styles.tile}>
          <Text style={styles.tileLabel}>Transaction no.</Text>
          <Text style={styles.tileValue}>{reading.nonce.toString()}</Text>
        </View>
      </View>

      {/* Notes are text the requesting app wrote. Boxed and labelled, so a
          note can't pass itself off as part of the Signer's own screen. */}
      {reading.notes.map((n, i) => (
        <View key={i} style={styles.noteBox}>
          <Text style={styles.cardLabel}>Attached note · written by the app, not checked</Text>
          <Text numberOfLines={8} style={[styles.noteText, !n.readable && { color: colors.muted }]}>{n.text}</Text>
        </View>
      ))}

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

          {needExtra ? (
            <Notice kind="warning">
              <Body><Strong>Extra confirmation needed</Strong></Body>
              {extra.map((r) => <Body key={r.id}>• {r.text}</Body>)}
              {waitLeft > 0 ? (
                <Body><Strong>You can approve in {waitLeft} s.</Strong> Use the time to check the details.</Body>
              ) : null}
              <Body muted>
                Compare with the full address above, type the last {ADDRESS_ENDING_LENGTH} characters
                {receivers.length > 1 ? ' of each receiver (trusted ones too)' : ' of the receiver'} (the outlined box), then approve with your password.
                (You chose these rules under Settings → Extra confirmation.)
              </Body>
            </Notice>
          ) : null}
          {needExtra ? receivers.map((a, i) => (
            <Field
              key={a}
              label={receivers.length > 1
                ? `Last ${ADDRESS_ENDING_LENGTH} characters of receiver ${i + 1} (${a.slice(0, 8)}…)`
                : `Last ${ADDRESS_ENDING_LENGTH} characters of the receiver address`}
              value={endings[a] || ''}
              noLearning
              maxLength={ADDRESS_ENDING_LENGTH + 2}
              onChangeText={(t) => setEndings((prev) => ({ ...prev, [a]: t }))}
              error={(endings[a] || '').trim().length >= ADDRESS_ENDING_LENGTH && !endingMatches(a, endings[a])
                ? 'That doesn\'t match the end of this address. Look again carefully.' : ''}
            />
          )) : null}

          {extra !== null && !needExtra ? (
            <BiometricButton
              pw={pw}
              title="Approve with fingerprint or face"
              prompt={several ? `Sign ${reading.transfers.length} transfers` : `Sign: send ${reading.transfers[0].text}`}
              withKey={signWithKeyBiometric}
              onDone={(result) => finish(result.value)}
              disabled={!deviceChecked}
            />
          ) : null}
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
              title={pw.busy ? 'Signing…'
                : !deviceChecked || extra === null ? 'Checking…'
                  : waitLeft > 0 ? `Approve in ${waitLeft} s` : 'Approve'}
              onPress={approve}
              busy={pw.busy}
              disabled={!password || pw.wait > 0 || !deviceChecked || !ready}
              style={styles.half}
            />
          </View>
        </>
      )}
      {blocked ? <Button title="Reject" kind="danger" onPress={onRejected} disabled={pw.busy} /> : null}
      <Text selectable style={styles.fingerprint}>Transaction fingerprint: {reading.hashHex}</Text>
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
  netBadge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8 },
  netBadgeText: { color: colors.background, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, fontFamily: 'monospace' },
  card: {
    backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 16,
    padding: 18, marginVertical: 8,
  },
  cardDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 12 },
  cardLabel: { color: colors.muted, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  amount: { color: colors.text, fontSize: 30, fontWeight: '700' },
  value: { color: colors.text, fontSize: 16, fontWeight: '600' },
  small: { color: colors.muted, fontSize: 12, fontFamily: 'monospace' },
  tiles: { flexDirection: 'row', marginVertical: 4, marginHorizontal: -5 },
  tile: {
    flex: 1, marginHorizontal: 5, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 12,
  },
  tileLabel: { color: colors.muted, fontSize: 12, marginBottom: 3 },
  tileValue: { color: colors.text, fontSize: 14, fontFamily: 'monospace' },
  buttons: { flexDirection: 'row', marginHorizontal: -5 },
  half: { flex: 1, marginHorizontal: 5 },
  fingerprint: { color: colors.muted, fontSize: 11, fontFamily: 'monospace', textAlign: 'center', marginTop: 16 },
  noteBox: {
    borderColor: '#5A5548', borderWidth: 1, borderStyle: 'dashed', borderRadius: 12,
    padding: 12, marginVertical: 8,
  },
  noteText: { color: colors.text, fontSize: 15 },
});

