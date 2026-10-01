/*
 * TermsScreen.js — "Before you start": the risks, in plain words
 * ==============================================================
 *
 * Shown once before a wallet is created or restored (you tap "I understand"
 * to continue), and any time from Settings → About.
 *
 * It says what the GPL licence says in legal terms (no warranty, no
 * liability), in normal words, plus the most important safety advice: most
 * losses come from scams, not hacks, and the user is responsible for the
 * recovery words, the password and the phone.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Body, Button, Card, Screen, ScreenHeader, Strong, colors } from '../components/ui.js';

/** The points, in order. Kept as data so the README can match them word for word. */
const POINTS = [
  ['Only use wallets holding funds you could afford to lose.', ' No app can guarantee your funds are safe.'],
  ['The Signer makes it harder to steal from you.', ' It can\'t stop everything: a phone with harmful apps, or someone who tricks you into approving a transaction, can still cost you money.'],
  ['Most losses come from scams, not hacks.', ' Nobody legitimate will ever ask for your recovery words. Read every approval screen before you sign.'],
  ['You are responsible', ' for your recovery words, your password and your phone. If the words are lost, nobody can recover the wallet.'],
];

/**
 * @param {object} props
 * @param {() => void} [props.onAccept]  given before setup: shows "I understand"
 * @param {() => void} props.onBack
 */
export default function TermsScreen({ onAccept, onBack }) {
  return (
    <Screen>
      <ScreenHeader title="Before you start" onBack={onBack} />
      <Body>
        KLV Signer is free, open-source software, provided <Strong>as is</Strong>, without any warranty. You use it at
        your own risk.
      </Body>
      <Card style={styles.card}>
        {POINTS.map(([bold, rest], i) => (
          <View key={i} style={[styles.point, i === POINTS.length - 1 && styles.last]}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.text}><Text style={styles.bold}>{bold}</Text>{rest}</Text>
          </View>
        ))}
      </Card>
      <Body muted>
        The full terms are in the licence (GNU GPL, version 3 or later), which comes with the source code.
      </Body>
      {onAccept ? (
        <>
          <Button title="I understand" onPress={onAccept} />
          <Button title="Back" kind="secondary" onPress={onBack} />
        </>
      ) : (
        <Button title="Done" kind="secondary" onPress={onBack} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16 },
  point: { flexDirection: 'row', marginBottom: 14 },
  last: { marginBottom: 0 },
  bullet: { color: colors.accent, fontSize: 16, lineHeight: 23, width: 16 },
  text: { flex: 1, color: colors.text, fontSize: 15, lineHeight: 22 },
  bold: { fontWeight: '700' },
});
