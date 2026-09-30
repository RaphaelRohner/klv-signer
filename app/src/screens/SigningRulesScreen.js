/*
 * SigningRulesScreen.js — "Extra confirmation" settings
 * ====================================================
 *
 * Opened from Home. Here you choose when a transaction needs a second,
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
import { StyleSheet, Switch, Text, View } from 'react-native';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { Body, Button, Field, Notice, Screen, Title, colors } from '../components/ui.js';
import { usePasswordCheck } from '../security/usePasswordCheck.js';
import {
  DEFAULT_RULES, WAIT_CHOICES, formatKlv, isRelaxing, klvCandidates, parseKlv,
} from '../security/extraConfirmation.js';
import { validAddressOrNull } from '../klever/address.js';
import { loadRules, saveRules } from '../storage/signingRules.js';

/** One on/off line with an explanation. */
function Rule({ title, text, value, onChange, disabled }) {
  return (
    <View style={styles.rule}>
      <View style={styles.ruleText}>
        <Text style={styles.ruleTitle}>{title}</Text>
        <Text style={styles.small}>{text}</Text>
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.accent }}
        thumbColor={colors.text}
      />
    </View>
  );
}

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

  if (!draft) return <Screen><Title>Extra confirmation</Title></Screen>;

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

  return (
    <Screen>
      <Title>Extra confirmation</Title>
      <Body>
        When a transaction hits one of these rules, the Signer asks for more: your password (no fingerprint), the last
        characters of the receiver address typed by you, and optionally a short wait. Nothing is ever blocked.
      </Body>
      {loadProblem ? <Notice kind="danger">{loadProblem}</Notice> : null}

      <Rule
        disabled={busy}
        title="Large amounts"
        text="More than a set amount of KLV in one transaction."
        value={amountOn}
        onChange={(on) => {
          if (on && !parseKlv(amountText)) setAmountText('100');
          set({ klvThreshold: on ? (parseKlv(amountText) || 100000000n).toString() : null });
        }}
      />
      {amountOn ? (
        <>
          <Field
            label="Ask extra above (KLV)"
          value={amountText}
          keyboardType="decimal-pad"
          editable={!busy}
          onChangeText={(t) => { setAmountText(t); setDone(''); }}
          placeholder="100"
            error={amountBad && !amountAmbiguous ? 'Please enter an amount like 100 or 12.5.' : ''}
          />
          {!amountBad ? <Text style={styles.small}>= {formatKlv(parseKlv(amountText))} KLV</Text> : null}
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
        </>
      ) : null}
      <Rule disabled={busy} title="New receivers" text="An address you've never signed a transfer to." value={draft.newReceiver} onChange={(v) => set({ newReceiver: v })} />
      <Rule disabled={busy} title="Other tokens" text="Any token other than KLV." value={draft.otherTokens} onChange={(v) => set({ otherTokens: v })} />
      <Rule disabled={busy} title="NFTs" text="Any NFT transfer." value={draft.nfts} onChange={(v) => set({ nfts: v })} />
      <Rule disabled={busy} title="An app's first request" text="The first signature a newly allowed app asks for." value={draft.firstAppRequest} onChange={(v) => set({ firstAppRequest: v })} />
      <Rule disabled={busy} title="Several transfers at once" text="More than one transfer in one transaction." value={draft.multiTransfer} onChange={(v) => set({ multiTransfer: v })} />
      <Rule disabled={busy} title="Many requests quickly" text="3 or more signing requests within 2 minutes." value={draft.burst} onChange={(v) => set({ burst: v })} />

      <Text style={[styles.ruleTitle, { marginTop: 16 }]}>Wait before Approve</Text>
      <View style={styles.choices}>
        {WAIT_CHOICES.map((s) => (
          <View key={s} style={styles.choice}>
            <Button title={s === 0 ? 'None' : `${s} s`} kind={draft.waitSeconds === s ? 'primary' : 'secondary'} onPress={() => set({ waitSeconds: s })} disabled={busy} />
          </View>
        ))}
      </View>

      <Text style={[styles.ruleTitle, { marginTop: 16 }]}>Trusted receivers</Text>
      <Text style={styles.small}>
        Transfers to these addresses (e.g. your own other wallets) skip the amount, new-receiver, token and NFT rules.
      </Text>
      {draft.trusted.length === 0 ? <Body muted>None yet.</Body> : null}
      {draft.trusted.map((a) => (
        <View key={a} style={styles.trusted}>
          <Text selectable style={styles.address}>{a}</Text>
          <Button title="Remove" kind="secondary" disabled={busy} onPress={() => set({ trusted: draft.trusted.filter((x) => x !== a) })} />
        </View>
      ))}
      <Field
        label="Add an address"
        value={newTrusted}
        noLearning
        onChangeText={(t) => { setNewTrusted(t); setTrustedError(''); }}
        placeholder="klv1…"
        error={trustedError}
      />
      <Button title="Add" kind="secondary" onPress={addTrusted} disabled={busy || !newTrusted.trim()} />

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
      ) : null}
      {done ? <Notice kind="info">{done}</Notice> : null}
      <Button
        title={pw.busy ? 'Checking…' : 'Save'}
        onPress={save}
        busy={pw.busy}
        disabled={!changed || amountBad || (relaxing && (!password || pw.wait > 0))}
      />
      <Button title={changed ? 'Back without saving' : 'Back'} kind="secondary" onPress={onDone} disabled={pw.busy} />
      <Body muted style={{ marginTop: 12 }}>
        The Signer has no internet, so it can't know your balance or prices: amounts are in KLV. The history it uses
        (receivers and apps you've signed for) stays on this phone.
      </Body>
      <Button title="Reset to recommended" kind="secondary" disabled={busy} onPress={() => { setDraft({ ...DEFAULT_RULES }); setAmountText(''); setDone(''); }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  rule: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
    borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  ruleText: { flex: 1, paddingRight: 12 },
  ruleTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  small: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  choices: { flexDirection: 'row', marginHorizontal: -4 },
  choice: { flex: 1, paddingHorizontal: 4 },
  trusted: {
    backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 12,
    padding: 12, marginVertical: 6,
  },
  address: { color: colors.accent, fontSize: 14, fontFamily: 'monospace' },
});
