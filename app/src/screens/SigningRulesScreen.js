/*
 * SigningRulesScreen.js — "Extra confirmation" settings
 * ====================================================
 *
 * Opened from Settings. Here you choose when a transaction needs a second,
 * stricter confirmation (password only, typing the receiver address ending,
 * optional wait). The rules themselves and what they mean are explained in
 * security/extraConfirmation.js. Nothing here ever blocks a transaction.
 *
 * SAVING
 *   - Changes that make the Signer STRICTER are saved straight away.
 *   - Changes that make it LESS strict (switching a rule off, raising the
 *     amount, shorter wait, adding a trusted receiver) need your password,
 *     never the fingerprint. So someone who can use your finger, but doesn't
 *     know your password, can't quietly switch the protection off.
 * The password is checked like any other password try (wrong tries count).
 */

import React, { useEffect, useState } from 'react';
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

/**
 * @param {object} props
 * @param {string} props.walletAddress  your own address (can't be a "trusted receiver" of itself)
 * @param {() => void} props.onDone
 */
export default function SigningRulesScreen({ walletAddress, onDone }) {
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

  const set = (patch) => { setDraft((prev) => ({ ...prev, ...patch })); setDone(''); };
  const busy = pw.busy;
  const amountOn = draft.klvThreshold !== null;
  const amountChoices = klvCandidates(amountText);           // what the typed number could mean
  const amountAmbiguous = amountOn && amountChoices.length === 2;
  const amountBad = amountOn && amountChoices.length !== 1;

  // The rules as they'd be saved (amount taken from its text box).
  const candidate = { ...draft, klvThreshold: amountOn && !amountBad ? parseKlv(amountText).toString() : draft.klvThreshold };
  const changed = JSON.stringify(candidate) !== JSON.stringify(saved);
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
      return;
    }
    setSaved(candidate);
    setDraft(candidate);
    setLoadProblem('');
    setDone('Saved.');
  }

  const rule = (key, title, subtitle, last) => (
    <ListRow title={title} subtitle={subtitle} toggle={{ value: !!draft[key], onChange: (v) => set({ [key]: v }) }} disabled={busy} last={last} />
  );

  return (
    <Screen>
      <ScreenHeader title="Extra confirmation" onBack={pw.busy ? undefined : onDone} />
      <Body muted>
        When a transaction matches a rule, the Signer asks for your password (no fingerprint) and the last 6
        characters of the receiver, and can make you wait first. Nothing is ever blocked.
      </Body>
      {loadProblem ? <Notice kind="danger">{loadProblem}</Notice> : null}

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
              set({ klvThreshold: on ? (parseKlv(amountText) || 100000000n).toString() : null });
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
        {rule('burst', 'Many requests quickly', '3 or more signing requests within 2 minutes', true)}
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

      {relaxing ? (
        <>
          <Notice kind="warning">These changes make the Signer less strict, so they need your password (not the fingerprint).</Notice>
          {pw.message ? <Notice kind="danger">{pw.message}</Notice> : null}
          {pw.wait > 0 ? <Notice kind="warning">Too many wrong passwords. You can try again in {pw.waitText}.</Notice> : null}
          <Field
            label="App password"
            value={password}
            secret
            editable={!pw.busy && pw.wait === 0}
            onChangeText={(t) => { setPassword(t); pw.clearMessage(); }}
          />
        </>
      ) : (
        <Body muted style={styles.note}>Making it stricter saves straight away. Relaxing a rule asks for your password.</Body>
      )}
      {done ? <Notice kind="info">{done}</Notice> : null}
      <Button
        title={pw.busy ? 'Checking…' : 'Save'}
        onPress={save}
        busy={pw.busy}
        disabled={!changed || amountBad || (relaxing && (!password || pw.wait > 0))}
      />
      <Button title={changed ? 'Back without saving' : 'Back'} kind="secondary" onPress={onDone} disabled={pw.busy} />
      <Body muted style={styles.note}>
        The Signer has no internet, so it can't know your balance or prices: amounts are in KLV. The history it uses
        (receivers and apps you've signed for) stays on this phone.
      </Body>
      <Button title="Reset to recommended" kind="secondary" disabled={busy} onPress={() => { setDraft({ ...DEFAULT_RULES }); setAmountText(''); setDone(''); }} />
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
});
