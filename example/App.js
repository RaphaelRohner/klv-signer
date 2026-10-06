/*
 * App.js — KLV Signer Example: the smallest app that uses the KLV Signer
 * =====================================================================
 *
 * A working example for developers (and a way for testers to try the
 * Signer). TESTNET ONLY: Klever's practice network, where KLV has no value.
 *
 * One screen:
 *   1. "Connect KLV Signer" → the Signer asks "Allow this app?" (first time)
 *      and answers with the wallet address. The testnet balance is shown.
 *   2. Receiver + amount → "Send with KLV Signer": a Klever testnet node
 *      prepares the unsigned transfer, the Signer shows it and asks for the
 *      password/fingerprint, then this app sends the signed transfer to the
 *      testnet and links to it on Kleverscan.
 *
 * This app never sees or stores a key. The parts worth copying:
 *   src/klvSigner.js          talking to the Signer (SIGNER-PROTOCOL.md),
 *                             incl. the seal check and the answer check
 *   modules/klv-signer-check  the tiny native seal check (2c)
 *   plugins/withKlvSigner.js  makes the Signer visible to this app (2a)
 *   src/kleverTx.js           preparing and sending transfers on testnet
 */

import React, { useState } from 'react';
import {
  ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { getSignerAddress, signWithSigner } from './src/klvSigner';
import {
  broadcastSigned, buildTransfer, explorerUrl, getKlvBalance, klvToUnits, unitsToKlv,
} from './src/kleverTx';

const C = { bg: '#121214', card: '#1d1d21', border: '#34343a', text: '#f2f2f2', muted: '#9a9aa2', accent: '#3fd1b8', danger: '#ff6b6b' };

export default function App() {
  const [address, setAddress] = useState(null); // the Signer's wallet (from GET_ADDRESS)
  const [balance, setBalance] = useState(null); // testnet KLV, smallest units
  const [receiver, setReceiver] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(null); // what's happening right now, or null
  const [error, setError] = useState(null);
  const [sentHash, setSentHash] = useState(null);

  async function refreshBalance(addr) {
    try {
      setBalance(await getKlvBalance(addr));
    } catch {
      setBalance(null); // no internet or node down: just don't show it
    }
  }

  async function connect() {
    setError(null);
    setBusy('Waiting for the KLV Signer…');
    try {
      const addr = await getSignerAddress();
      setAddress(addr);
      refreshBalance(addr);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    setError(null);
    setSentHash(null);
    const to = receiver.trim();
    if (!/^klv1[0-9a-z]{58}$/.test(to)) {
      setError('Please enter a valid receiver address (klv1…, 62 characters).');
      return;
    }
    let units;
    try {
      units = klvToUnits(amount);
    } catch (e) {
      setError(e.message);
      return;
    }
    try {
      setBusy('Preparing the transfer…');
      const unsignedHex = await buildTransfer({ sender: address, receiver: to, amountUnits: units }); // also checks the node prepared exactly this
      setBusy('Waiting for your approval in the KLV Signer…');
      const signed = await signWithSigner(unsignedHex); // also checks the answer is exactly this transfer
      setBusy('Sending to the Klever testnet…');
      const hash = await broadcastSigned(signed.signedTransaction);
      setSentHash(hash);
      setAmount('');
      setTimeout(() => refreshBalance(address), 5000);
    } catch (e) {
      setError(e.code === 'USER_REJECTED' ? 'Cancelled in the KLV Signer: nothing was sent.' : e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={s.safe}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>KLV Signer Example</Text>
        <Text style={s.badge}>TESTNET · practice network, no real value</Text>
        <Text style={s.muted}>
          Shows how any Android app can ask the KLV Signer to sign a Klever transaction. This app never sees your key.
        </Text>

        {!address ? (
          <Button title="Connect KLV Signer" onPress={connect} disabled={!!busy} />
        ) : (
          <View style={s.card}>
            <Text style={s.label}>Wallet in the Signer</Text>
            <Text selectable style={s.mono}>{address}</Text>
            <Text style={[s.label, s.gap]}>Testnet balance</Text>
            <Text style={s.value}>{balance === null ? '…' : `${unitsToKlv(balance)} KLV`}</Text>
          </View>
        )}

        {address ? (
          <View style={s.card}>
            <Text style={s.label}>Receiver</Text>
            <TextInput
              style={s.input} value={receiver} onChangeText={setReceiver} placeholder="klv1…"
              placeholderTextColor={C.muted} autoCapitalize="none" autoCorrect={false}
            />
            <Text style={[s.label, s.gap]}>Amount (KLV)</Text>
            <TextInput
              style={s.input} value={amount} onChangeText={setAmount} placeholder="0.1"
              placeholderTextColor={C.muted} keyboardType="decimal-pad"
            />
            <Button title="Send with KLV Signer" onPress={send} disabled={!!busy} />
          </View>
        ) : null}

        {busy ? (
          <View style={s.row}><ActivityIndicator color={C.accent} /><Text style={s.busy}>{busy}</Text></View>
        ) : null}
        {error ? <Text style={s.error}>{error}</Text> : null}
        {sentHash ? (
          <View style={s.card}>
            <Text style={s.ok}>✔ Sent to the testnet</Text>
            <Pressable onPress={() => Linking.openURL(explorerUrl(sentHash))}>
              <Text style={s.link}>See it on Kleverscan</Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={[s.muted, s.gap]}>
          Needs the official KLV Signer app on this phone. Source code and the protocol: github.com/RaphaelRohner/klv-signer
        </Text>
      </ScrollView>
    </View>
  );
}

function Button({ title, onPress, disabled }) {
  return (
    <Pressable
      accessibilityRole="button" onPress={onPress} disabled={disabled}
      style={({ pressed }) => [s.button, (pressed || disabled) && { opacity: 0.6 }]}
    >
      <Text style={s.buttonText}>{title}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  page: { padding: 20, paddingTop: 48 },
  title: { color: C.text, fontSize: 24, fontWeight: '700' },
  badge: { color: '#121214', backgroundColor: '#f5c044', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginVertical: 10, fontSize: 12, fontWeight: '700' },
  muted: { color: C.muted, fontSize: 14, lineHeight: 20 },
  card: { backgroundColor: C.card, borderColor: C.border, borderWidth: 1, borderRadius: 12, padding: 16, marginTop: 16 },
  label: { color: C.muted, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  gap: { marginTop: 14 },
  mono: { color: C.accent, fontFamily: 'monospace', fontSize: 14 },
  value: { color: C.text, fontSize: 20, fontWeight: '600' },
  input: { color: C.text, borderColor: C.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  button: { backgroundColor: C.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  buttonText: { color: '#121214', fontSize: 16, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  busy: { color: C.text, marginLeft: 10 },
  error: { color: C.danger, marginTop: 16, fontSize: 15, lineHeight: 21 },
  ok: { color: C.accent, fontSize: 16, fontWeight: '600' },
  link: { color: C.accent, textDecorationLine: 'underline', marginTop: 8 },
});
