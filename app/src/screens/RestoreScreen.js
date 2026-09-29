/*
 * RestoreScreen.js — bringing in an existing wallet from its recovery phrase
 * =========================================================================
 *
 * Use this to:
 *   - put an existing (test!) wallet into the Signer, or
 *   - get back in after forgetting your app password (remove the wallet on
 *     the Home screen first, then restore it here with a new password).
 *
 * HOW IT WORKS
 *   1. You type or paste the words (12 or 24; spacing and capitals don't matter).
 *   2. The Signer checks them. The last word contains a built-in check, so most
 *      typos are caught.
 *   3. It shows you the wallet address those words belong to, so you can
 *      confirm it's the wallet you expected before continuing.
 *
 * Screenshots are blocked while this screen is open.
 */

import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { Body, Button, Field, Notice, Screen, Strong, Title, colors } from '../components/ui.js';
import { isValidRecoveryPhrase, tidyPhrase, walletFromPhrase, wipeBytes } from '../crypto/wallet.js';

/**
 * @param {object} props
 * @param {(phrase: string) => void} props.onRestored  called with the tidied phrase once confirmed
 * @param {() => void} props.onBack
 */
export default function RestoreScreen({ onRestored, onBack }) {
  usePreventScreenCapture('restore');

  const [text, setText] = useState('');
  const [problem, setProblem] = useState('');
  const [foundAddress, setFoundAddress] = useState(null); // shown after a successful check

  const phrase = tidyPhrase(text);
  const wordCount = phrase ? phrase.split(' ').length : 0;

  function check() {
    if (![12, 15, 18, 21, 24].includes(wordCount)) {
      setProblem(`That's ${wordCount} words. A recovery phrase has 12 or 24 words.`);
      return;
    }
    if (!isValidRecoveryPhrase(phrase)) {
      setProblem('These words are not a valid recovery phrase. Check each word\'s spelling and the order.');
      return;
    }
    // Work out the address, then wipe the key. We only need the address here.
    const { privateKey, address } = walletFromPhrase(phrase);
    wipeBytes(privateKey);
    setFoundAddress(address);
  }

  return (
    <Screen>
      <Title>Restore a wallet</Title>
      <Body>Type or paste the recovery phrase, with the words in order, separated by spaces.</Body>

      <Field
        label={`Recovery phrase (${wordCount} word${wordCount === 1 ? '' : 's'})`}
        value={text}
        multiline
        noLearning
        editable={!foundAddress}
        onChangeText={(value) => {
          setText(value);
          setProblem('');
        }}
        error={problem}
      />

      {foundAddress ? (
        <>
          <Notice kind="info">
            <Body>These words belong to the wallet:</Body>
            <Text selectable style={styles.address}>{foundAddress}</Text>
            <Body muted>Is this the address you expected? If not, go back and check the words.</Body>
          </Notice>
          <Button title="Yes, use this wallet" onPress={() => onRestored(phrase)} />
          <Button title="No, let me fix the words" kind="secondary" onPress={() => setFoundAddress(null)} />
        </>
      ) : (
        <>
          <Button title="Check the words" onPress={check} disabled={wordCount === 0} />
          <Button title="Back" kind="secondary" onPress={onBack} />
        </>
      )}

      <Body muted style={{ marginTop: 16 }}>
        <Strong>Tip:</Strong> during testing, only restore wallets that have never held anything of real value.
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  address: { color: colors.accent, fontSize: 15, fontFamily: 'monospace', marginVertical: 8 },
});
