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
 *   - since 2 Nov 2026: a warning under the text when it contains letters
 *     that aren't plain Latin (otherLetters): some alphabets have letters
 *     that look exactly like Latin ones, so a name can look right and be
 *     another one.
 *   - since 21 Nov 2026: a "Show exact characters" switch under the text
 *     (characterView). It shows the text again with every character that
 *     isn't a plain keyboard character written as its code (⟨U+0435⟩ …, in
 *     brackets an app can't fake),
 *     highlighted, plus a list of those characters with their alphabet and
 *     bytes. So you can check exactly what will be signed without trusting
 *     the font. Off by default, so the normal screen stays simple.
 *     (Suggested by jenniferseward, Klever forum.)
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
import {
  CODE_CLOSE, CODE_OPEN, characterView, otherLetters, signWalletMessage,
} from '../klever/signMessage.js';
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
  const alphabets = otherLetters(text);
  // "Show exact characters" (21 Nov 2026): off until the user switches it on.
  const [showCharacters, setShowCharacters] = useState(false);
  const characters = characterView(text);

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

      {/* The exact characters (21 Nov 2026): codes instead of font-drawn letters. */}
      <Button
        title={showCharacters ? 'Hide exact characters' : 'Show exact characters'}
        kind="secondary"
        onPress={() => setShowCharacters((on) => !on)}
      />
      {showCharacters ? <CharacterView view={characters} /> : null}

      {/* Letters that aren't plain Latin: some look exactly like Latin ones (2 Nov 2026). */}
      {alphabets.length > 0 ? (
        <Notice kind="warning">
          <Body>
            <Strong>This text contains letters that aren't plain Latin</Strong> ({alphabets.join(', ')}). Some of them
            look exactly like Latin letters, so a name or word can look right and still be a different one. Read it
            carefully. Who is asking is shown at the top, as Android reports it.
          </Body>
        </Notice>
      ) : null}

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

/**
 * CharacterView — the text with every non-plain character as its code, and a
 * list of those characters (see characterView in klever/signMessage.js).
 * Codes are highlighted, so a single odd letter in a long word stands out.
 */
function CharacterView({ view }) {
  return (
    <View style={styles.charBox}>
      <Text style={styles.cardLabel}>Exact characters · what is signed</Text>
      <Text selectable style={styles.text}>
        {view.parts.map((part, i) => (part.plain !== undefined ? (
          <Text key={i}>{part.plain}</Text>
        ) : (
          // A line break shows its code and then really breaks the line.
          <Text key={i} style={styles.code}>{`${CODE_OPEN}${part.code}${CODE_CLOSE}`}{part.lineBreak ? '\n' : ''}</Text>
        )))}
      </Text>
      {view.special.length === 0 ? (
        <Text style={styles.charNote}>
          Only plain keyboard characters: A–Z, a–z, 0–9, punctuation and normal spaces.
        </Text>
      ) : (
        <>
          <Text style={[styles.charNote, { marginTop: 10 }]}>
            Characters that aren't plain keyboard characters (A–Z, a–z, 0–9, punctuation, normal space):
          </Text>
          {view.special.map((c) => (
            <View key={c.code} style={styles.charRow}>
              {/* The character itself, except a line break (nothing to draw). */}
              <Text style={styles.charGlyph}>{c.char === '\n' ? '⏎' : c.char}</Text>
              <View style={styles.flex}>
                <Text style={styles.code}>{c.code}{c.count > 1 ? `  ×${c.count}` : ''}</Text>
                <Text style={styles.charNote}>{c.what} · bytes {c.bytes}</Text>
              </View>
            </View>
          ))}
        </>
      )}
    </View>
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
  // The exact-characters view (21 Nov 2026)
  charBox: {
    backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 12,
    padding: 12, marginVertical: 8,
  },
  code: { color: colors.warning, fontFamily: 'monospace', fontWeight: '600' },
  charNote: { color: colors.muted, fontSize: 12 },
  charRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  charGlyph: {
    color: colors.text, fontSize: 20, width: 40, height: 40, textAlign: 'center', textAlignVertical: 'center',
    backgroundColor: colors.raised, borderRadius: 8, marginRight: 10,
  },
  buttons: { flexDirection: 'row', marginHorizontal: -5 },
  half: { flex: 1, marginHorizontal: 5 },
});
