/*
 * RequestProblemScreen.js — "The Signer can't do what this app asked"
 * ===================================================================
 *
 * Shown when a request from another app can't be carried out: for example
 * the transaction contains something the Signer can't explain, it's for the
 * wrong network or wallet, or no wallet is set up yet. You see the reason in
 * plain words. "Back to the app" sends the refusal (with the same reason)
 * back to the app that asked. Nothing is signed.
 */

import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { Body, Button, Notice, Screen, Title, colors } from '../components/ui.js';

/**
 * @param {object} props
 * @param {object} props.request   the incoming request
 * @param {string} props.message   why it can't be done, in plain words
 * @param {() => void} props.onBack
 */
export default function RequestProblemScreen({ request, message, onBack }) {
  return (
    <Screen>
      <Title>Request refused</Title>
      <Body muted>From</Body>
      <Text style={styles.name}>{request.callerLabel}</Text>
      <Text style={styles.mono}>{request.callerPackage}</Text>
      <Notice kind="danger">{message}</Notice>
      <Body muted>Nothing was signed. The app will be told why.</Body>
      <Button title="Back to the app" onPress={onBack} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: { color: colors.text, fontSize: 20, fontWeight: '700' },
  mono: { color: colors.muted, fontSize: 13, fontFamily: 'monospace', marginBottom: 8 },
});
