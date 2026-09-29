/*
 * SignedScreen.js — shown after a successful signature (Stage 2 test version)
 * ==========================================================================
 *
 * Shows the signed transaction code. A signed transaction is NOT secret: it
 * doesn't contain or reveal the private key, and it can only ever do exactly
 * what you just approved.
 *
 * In Stage 3 the Signer hands this straight back to the app that asked. For
 * now you send it to your Mac with "Share" (e.g. by email to yourself), and
 * the helper script sends it to the Klever testnet (see TESTING.md).
 */

import React from 'react';
import { Share, StyleSheet, Text } from 'react-native';
import { Body, Button, Notice, Screen, Title, colors } from '../components/ui.js';

/**
 * @param {object} props
 * @param {{ signatureHex: string, signedTransactionHex: string }} props.result
 * @param {() => void} props.onDone
 */
export default function SignedScreen({ result, onDone }) {
  async function share() {
    try {
      await Share.share({ message: result.signedTransactionHex });
    } catch {
      // The person closed the share menu: nothing to do.
    }
  }

  return (
    <Screen>
      <Title>Signed ✓</Title>
      <Notice kind="info">
        The transaction is signed, but not sent yet. Sending it to the Klever network is the app's job (for this
        test: the helper script on your Mac).
      </Notice>
      <Body muted>Signed transaction code (not secret: it can only do what you approved):</Body>
      <Text selectable style={styles.code}>{result.signedTransactionHex}</Text>
      <Button title="Share…" onPress={share} />
      <Button title="Done" kind="secondary" onPress={onDone} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  code: {
    color: colors.accent, fontSize: 12, fontFamily: 'monospace', backgroundColor: colors.card,
    borderRadius: 8, padding: 10, marginVertical: 10,
  },
});
