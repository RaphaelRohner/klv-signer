/*
 * SigningRulesScreen.js — "Extra confirmation" settings
 * ====================================================
 *
 * Opened from Settings. Here you choose when a transaction needs a second,
 * stricter confirmation (password only, typing one box of the receiver address,
 * optional wait). The rules themselves and what they mean are explained in
 * security/extraConfirmation.js. Nothing here ever blocks a transaction.
 *
 * SAVING (new layout, 1 Oct 2026)
 *   As soon as anything is changed, a bar fixed at the bottom of the screen
 *   (it doesn't scroll) says "Unsaved changes" with a Save button.
 *   - Changes that make the Signer STRICTER are saved with that tap.
 *   - Changes that make it LESS strict (switching a rule off, raising the
 *     amount, shorter wait, adding a trusted receiver) need your password,
 *     never the fingerprint. So someone who can use your finger, but doesn't
 *     know your password, can't quietly switch the protection off.
 *     The bar then opens a small panel: the warning and the password box.
 *   - Leaving with unsaved changes (Back, or the phone's back button) asks
 *     "Save your changes?" with Save / Discard / Keep editing.
 * The password is checked like any other password try (wrong tries count).
 */

import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePreventScreenCapture } from 'expo-screen-capture';
import {
  Body, Button, Card, Field, ListRow, Notice, Screen, ScreenHeader, SectionLabel, colors,
} from '../components/ui.js';
import { groupAddress } from '../klever/format.js';
import { usePasswordCheck } from '../security/usePasswordCheck.js';
import {
  DEFAULT_RULES, WAIT_CHOICES, formatKlv, isRelaxing, klvCandidates, parseKlv,
} from '../security/extraConfirmation.js';
import { validAddressOrNull } from '../klever/address.js';
import { loadRules, saveRules } from '../storage/signingRules.js';

/** The rules as they'd be saved: the draft, with the amount taken from its text box. */
function candidateOf(draft, amountText) {
  const amountOn = draft.klvThreshold !== null;
  const amountOk = amountOn && klvCandidates(amountText).length === 1;
  return { ...draft, klvThreshold: amountOk ? parseKlv(amountText).toString() : draft.klvThreshold };
}

/** Is there anything not saved yet? */
function isChanged(draft, saved, amountText) {
  return JSON.stringify(candidateOf(draft, amountText)) !== JSON.stringify(saved);
}

/**
 * @param {object} props
 * @param {string} props.walletAddress  your own address (can't be a "trusted receiver" of itself)
 * @param {() => void} props.onDone
 * @param {{ current: (() => void) | null }} [props.backRef]  App.js calls backRef.current()
 *        for the phone's back button, so unsaved changes aren't lost by accident
 */
export default function SigningRulesScreen({ walletAddress, onDone, backRef }) {
  usePreventScreenCapture('signing-rules'); // there's a password box
  const pw = usePasswordCheck();
  const [saved, setSaved] = useState(null);   // what's stored now
  const [draft, setDraft] = useState(null);   // what you're editing
  const [amountText, setAmountText] = useState('');
  const [newTrusted, setNewTrusted] = useState('');
  const [trustedError, setTrustedError] = useState('');
  const [password, setPassword] = useState('');
  const [done, setDone] = useState('');
  const [loadProblem, setLoadProblem] = useState('');
  // What the bottom bar shows: null (just "Unsaved changes · Save"),
  // 'password' (warning + password box) or 'leave' ("Save your changes?").
  const [step, setStep] = useState(null);
  const leaveAfterSave = useRef(false);

  // The phone's back button goes through the same "unsaved changes?" check.
  // (`latest` holds this screen's current values for that check.)
  const latest = useRef({});
  useEffect(() => { latest.current = { draft, saved, amountText, busy: pw.busy }; });
  useEffect(() => {
    if (!backRef) return undefined;
    backRef.current = () => {
      const now = latest.current;
      if (now.busy) return;
      if (now.draft && isChanged(now.draft, now.saved, now.amountText)) {
        leaveAfterSave.current = false;
        setStep('leave');
      } else onDone();
    };
    return () => { backRef.current = null; };
  }, [backRef, onDone]);

  useEffect(() => {
    loadRules()
      .then((r) => {
        setSaved(r);
        setDraft(r);
        setAmountText(r.klvThreshold ? formatKlv(r.klvThreshold) : '');
      })
      .catch(() => {
        // Damaged or unreadable: start from the recommended rules. Until you save,
        // every transaction gets the extra confirmation (the approval screen is careful).
        // "saved" is set to the strictest rules, so saving the recommended ones needs the password.
        setLoadProblem('Your saved settings couldn\'t be read, so every transaction asks for the extra confirmation. Check the rules below and tap Save to fix this.');
        setSaved({ ...DEFAULT_RULES, klvThreshold: '1', nfts: true, otherTokens: true, waitSeconds: 30 });
        setDraft({ ...DEFAULT_RULES });
      });
  }, []);

  if (!draft) return <Screen><ScreenHeader title="Extra confirmation" onBack={onDone} /></Screen>;

  const set = (patch) => { setDraft((prev) => ({ ...prev, ...patch })); setDone(''); setStep(null); };
  const busy = pw.busy;
  const amountOn = draft.klvThreshold !== null;
  const amountChoices = klvCandidates(amountText);           // what the typed number could mean
  const amountAmbiguous = amountOn && amountChoices.length === 2;
  const amountBad = amountOn && amountChoices.length !== 1;

  // The rules as they'd be saved (amount taken from its text box).
  const candidate = candidateOf(draft, amountText);
  const changed = isChanged(draft, saved, amountText);
  const relaxing = isRelaxing(saved, candidate);

  function addTrusted() {
    const a = validAddressOrNull(newTrusted);
    if (!a) { setTrustedError('That isn\'t a valid Klever address. Check every character.'); return; }
    if (a === walletAddress) { setTrustedError('That\'s this wallet\'s own address.'); return; }
    if (draft.trusted.includes(a)) { setTrustedError('Already in the list.'); return; }
    set({ trusted: [...draft.trusted, a] });
    setNewTrusted('');
    setTrustedError('');
  }

  /** Save the rules (the password is checked first if they're less strict). */
  async function save() {
    if (relaxing) {
      const result = await pw.check(password, () => null);
      setPassword('');
      if (!result.ok) return;
    }
    try {
      await saveRules(candidate);
    } catch (error) {
      setDone(`Saving failed: ${error.message}`);
      setStep(null);
      return;
    }
    setSaved(candidate);
    setDraft(candidate);
    setLoadProblem('');
    setStep(null);
    setDone('Saved.');
    if (leaveAfterSave.current) { leaveAfterSave.current = false; onDone(); }
  }

  /** The bar's Save button: straight away if stricter, via the password panel if less strict. */
  function startSave() {
    if (amountBad) return;
    if (relaxing) { pw.clearMessage(); setStep('password'); } else save();
  }

  /** Back (top-left or the phone's button): ask first if something isn't saved. */
  function requestBack() {
    if (busy) return;
    if (changed) { leaveAfterSave.current = false; setStep('leave'); } else onDone();
  }

  const rule = (key, title, subtitle, last) => (
    <ListRow title={title} subtitle={subtitle} toggle={{ value: !!draft[key], onChange: (v) => set({ [key]: v }) }} disabled={busy} last={last} />
  );

  // The bar fixed at the bottom (only while something is unsaved, or a question is open).
  let footer = null;
  if (step === 'password') {
    footer = (
      <>
        <Text style={styles.footerTitle}>These changes make the Signer less strict</Text>
        <Text style={styles.footerText}>So they need your app password (not the fingerprint).</Text>
        {pw.message ? <Notice kind="danger">{pw.message}</Notice> : null}
        {pw.wait > 0 ? <Notice kind="warning">Too many wrong passwords. You can try again in {pw.waitText}.</Notice> : null}
        <Field
          label="App password"
          value={password}
          secret
          editable={!pw.busy && pw.wait === 0}
          onChangeText={(t) => { setPassword(t); pw.clearMessage(); }}
          onSubmitEditing={save}
          returnKeyType="done"
        />
        <View style={styles.footerButtons}>
          <Button
            title="Cancel"
            kind="secondary"
            disabled={pw.busy}
            onPress={() => { setPassword(''); pw.clearMessage(); leaveAfterSave.current = false; setStep(null); }}
            style={styles.half}
          />
          <Button
            title={pw.busy ? 'Checking…' : 'Save'}
            onPress={save}
            busy={pw.busy}
            disabled={!password || pw.wait > 0}
            style={styles.half}
          />
        </View>
      </>
    );
  } else if (step === 'leave') {
    footer = (
      <>
        <Text style={styles.footerTitle}>Save your changes before leaving?</Text>
        <View style={styles.footerButtons}>
          <Button title="Discard" kind="danger" onPress={onDone} style={styles.third} />
          <Button title="Keep editing" kind="secondary" onPress={() => setStep(null)} style={styles.third} />
          <Button
            title="Save"
            disabled={amountBad}
            onPress={() => { leaveAfterSave.current = true; if (relaxing) { pw.clearMessage(); setStep('password'); } else save(); }}
            style={styles.third}
          />
        </View>
      </>
    );
  } else if (changed) {
    footer = (
      <View style={styles.bar}>
        <View style={styles.flex}>
          <Text style={styles.footerTitle}>Unsaved changes</Text>
          <Text style={styles.footerText}>
            {amountBad ? 'Check the amount first.' : relaxing ? 'Less strict: needs your password.' : 'Stricter: saves straight away.'}
          </Text>
        </View>
        <Button title="Save" onPress={startSave} disabled={amountBad || busy} style={styles.barButton} />
      </View>
    );
  }

  return (
    <Screen footer={footer}>
      <ScreenHeader title="Extra confirmation" onBack={pw.busy ? undefined : requestBack} />
      <Body muted>
        When a transaction matches a rule, the Signer asks for your password (no fingerprint) and 6 characters
        of the receiver (an outlined box, a different one each time), and can make you wait first. Nothing is
        ever blocked.
      </Body>
      {loadProblem ? <Notice kind="danger">{loadProblem}</Notice> : null}
      {done ? <Notice kind={done === 'Saved.' ? 'info' : 'danger'}>{done}</Notice> : null}

      <Card>
        {/* Large amounts: the amount box is always visible, and only usable while the rule is on. */}
        <ListRow
          title="Large amounts"
          subtitle="KLV sent in one transaction, network fee included"
          disabled={busy}
          toggle={{
            value: amountOn,
            onChange: (on) => {
              if (on && !parseKlv(amountText)) setAmountText('100');
              set({ klvThreshold: on ? (parseKlv(amountText) || 10000000000n).toString() : null }); // 10,000 KLV if empty
            },
          }}
          last
        />
        <View style={[styles.amount, !amountOn && styles.dim]}>
          <Field
            label={amountOn ? 'Ask extra above (KLV)' : 'Ask extra above (KLV) · switch on to use'}
            value={amountText}
            keyboardType="decimal-pad"
            editable={!busy && amountOn}
            onChangeText={(t) => { setAmountText(t); setDone(''); }}
            placeholder="100"
            error={amountBad && !amountAmbiguous ? 'Please enter an amount like 100 or 12.5.' : ''}
          />
          {amountOn && !amountBad ? <Text style={styles.small}>= {formatKlv(parseKlv(amountText))} KLV</Text> : null}
          {amountAmbiguous ? (
            <Notice kind="warning">
              <Body>&quot;{amountText.trim()}&quot; can be read two ways. Which did you mean?</Body>
              <View style={styles.choices}>
                {amountChoices.map((units) => (
                  <View key={units.toString()} style={styles.choice}>
                    <Button title={`${formatKlv(units)} KLV`} kind="secondary" onPress={() => { setAmountText(formatKlv(units)); setDone(''); }} />
                  </View>
                ))}
              </View>
            </Notice>
          ) : null}
        </View>
        <View style={styles.divider} />
        {rule('newReceiver', 'New receivers', 'An address you\'ve never signed a transfer to')}
        {rule('otherTokens', 'Other tokens', 'Any token other than KLV')}
        {rule('nfts', 'NFTs', 'Any NFT transfer')}
        {rule('firstAppRequest', 'An app\'s first request', 'The first signature a newly allowed app asks for')}
        {rule('multiTransfer', 'Several transfers at once', 'More than one transfer in one transaction')}
        {rule('burst', 'Many requests quickly', '3 or more signing requests within 2 minutes')}
        {rule('repeat', 'The same transfer again', 'Same receiver, token and amount as one you signed in the last hour (a possible double payment)', true)}
      </Card>

      <SectionLabel>Wait before approving</SectionLabel>
      <View style={styles.segment} accessibilityRole="radiogroup">
        {WAIT_CHOICES.map((sec) => {
          const selected = draft.waitSeconds === sec;
          return (
            <Pressable
              key={sec}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: busy }}
              onPress={busy ? undefined : () => set({ waitSeconds: sec })}
              style={[styles.segmentItem, selected && styles.segmentOn]}
            >
              <Text style={[styles.segmentText, selected && styles.segmentTextOn]}>{sec === 0 ? 'No wait' : `${sec} s`}</Text>
            </Pressable>
          );
        })}
      </View>

      <SectionLabel>Trusted receivers · rules skipped</SectionLabel>
      <Text style={styles.small}>
        Transfers to these addresses (e.g. your own other wallets) skip the amount, new-receiver, token and NFT rules.
      </Text>
      <Card>
        {draft.trusted.length === 0 ? (
          <Text style={[styles.small, styles.padded]}>None yet.</Text>
        ) : draft.trusted.map((a, i) => (
          <ListRow
            key={a}
            title={groupAddress(a)}
            last={i === draft.trusted.length - 1}
            right={(
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${a}`}
                disabled={busy}
                onPress={() => set({ trusted: draft.trusted.filter((x) => x !== a) })}
                style={styles.remove}
              >
                <Text style={styles.removeText}>Remove</Text>
              </Pressable>
            )}
          />
        ))}
      </Card>
      <Field
        label="Add an address"
        value={newTrusted}
        noLearning
        onChangeText={(t) => { setNewTrusted(t); setTrustedError(''); }}
        placeholder="klv1…"
        error={trustedError}
      />
      <Button title="Add trusted receiver" kind="secondary" onPress={addTrusted} disabled={busy || !newTrusted.trim()} />

      <Body muted style={styles.note}>
        The Signer has no internet, so it can't know your balance or prices: amounts are in KLV. The history it uses
        (receivers and apps you've signed for) stays on this phone.
      </Body>
      <Button title="Reset to recommended" kind="secondary" disabled={busy} onPress={() => { setDraft({ ...DEFAULT_RULES }); setAmountText(DEFAULT_RULES.klvThreshold ? formatKlv(DEFAULT_RULES.klvThreshold) : ''); setDone(''); }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  amount: { paddingHorizontal: 16, paddingBottom: 12 },
  dim: { opacity: 0.5 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  small: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  padded: { padding: 16 },
  choices: { flexDirection: 'row', marginHorizontal: -4 },
  choice: { flex: 1, paddingHorizontal: 4 },
  segment: {
    flexDirection: 'row', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: 14, padding: 5,
  },
  segmentItem: { flex: 1, minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: colors.accent },
  segmentText: { color: colors.muted, fontSize: 14 },
  segmentTextOn: { color: colors.accentText, fontWeight: '600' },
  remove: {
    minHeight: 40, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  removeText: { color: colors.dangerText, fontSize: 13 },
  note: { marginTop: 12 },
  flex: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center' },
  barButton: { marginTop: 0, minWidth: 110, marginLeft: 12 },
  footerTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  footerText: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 2 },
  footerButtons: { flexDirection: 'row', marginHorizontal: -4 },
  half: { flex: 1, marginHorizontal: 4 },
  third: { flex: 1, marginHorizontal: 4, paddingHorizontal: 6 },
});
