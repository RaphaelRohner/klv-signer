/*
 * RestoreScreen.js — bringing in an existing wallet from its recovery phrase
 * =========================================================================
 *
 * Use this to:
 *   - put an existing (test!) wallet into the Signer, or
 *   - get back in after forgetting your app password ("I forgot my password"
 *     on the lock screen, then restore here with a new password).
 *
 * HOW IT WORKS
 *   1. One numbered box per word, like in the Klever Wallet app. Choose 24
 *      words (Klever's standard) or 12 (some older wallets).
 *      - Typing a space jumps to the next box.
 *      - Pasting the whole phrase into box 1 still fills all boxes at once,
 *        but isn't suggested any more (third review, 5 Oct 2026): copied
 *        words stay in the phone's clipboard and the keyboard's clipboard
 *        history. If several words arrive at once, a warning says so.
 *      - A box turns red if its word isn't on the official list of 2048
 *        recovery words, so typos show up right away.
 *   2. "Check the words" verifies the whole phrase. The last word contains
 *      a built-in check, so even a wrong-but-real word is usually caught.
 *   3. It shows the wallet address those words belong to, so you can confirm
 *      it's the wallet you expected before continuing.
 *
 * Screenshots are blocked while this screen is open. The boxes switch off
 * the keyboard's suggestions and learning, so it doesn't remember your words.
 */

import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { cancelAutofill } from '../../modules/klv-signer-requests/index.js';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { Body, Button, Notice, Screen, Strong, Title, colors } from '../components/ui.js';
import { isValidRecoveryPhrase, walletFromPhrase, wipeBytes } from '../crypto/wallet.js';
import { cleanWord, isKnownWord, spreadWords } from '../crypto/phraseInput.js';

/** Makes an array of `count` empty boxes. */
const emptyWords = (count) => Array.from({ length: count }, () => '');

/**
 * @param {object} props
 * @param {(phrase: string) => void} props.onRestored  called with the phrase once confirmed
 * @param {() => void} props.onBack
 */
export default function RestoreScreen({ onRestored, onBack }) {
  usePreventScreenCapture('restore');

  const [wordCount, setWordCount] = useState(24);
  const [words, setWords] = useState(() => emptyWords(24));
  const [focused, setFocused] = useState(null);      // which box the cursor is in
  const [problem, setProblem] = useState('');
  const [pasted, setPasted] = useState(false);
  const [foundAddress, setFoundAddress] = useState(null); // shown after a successful check
  const boxes = useRef([]);                           // handles to each box, to move the cursor

  const filled = words.filter((w) => cleanWord(w)).length;
  const phrase = words.map(cleanWord).join(' ');

  /** Switch between 12 and 24 boxes (keeps what's already typed where it fits). */
  function chooseCount(count) {
    setWordCount(count);
    setWords((current) => [...current, ...emptyWords(24)].slice(0, count));
    setProblem('');
  }

  /** Called on every keystroke (or paste) in box `index`. */
  function onType(index, text) {
    // Three or more words arriving in one go = a paste (typing gives one at a time).
    if (String(text || '').trim().split(/\s+/).length >= 3) setPasted(true);
    const result = spreadWords(words, index, text);
    setWords(result.words);
    setProblem('');
    if (result.focus !== null) boxes.current[result.focus]?.focus();
  }

  function check() {
    if (filled < wordCount) {
      setProblem(`Please fill in all ${wordCount} words (${filled} so far).`);
      return;
    }
    const unknown = words.map((w, i) => (isKnownWord(w) ? null : i + 1)).filter(Boolean);
    if (unknown.length > 0) {
      setProblem(`Word${unknown.length > 1 ? 's' : ''} #${unknown.join(', #')} ${unknown.length > 1 ? 'are' : 'is'} not a recovery word. Check the spelling.`);
      return;
    }
    if (!isValidRecoveryPhrase(phrase)) {
      setProblem('All words are real recovery words, but together they are not a valid phrase. Most likely two words are swapped or one is wrong. Compare the order with your paper.');
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
      <Body>Type your recovery words, one per box, in the order written on your paper.</Body>
      <Body muted>Tip: a space jumps to the next box.</Body>
      {pasted ? (
        <Notice kind="warning">
          <Body>
            <Strong>It looks like you pasted your words.</Strong> They may still be in your phone's clipboard, where
            other apps and your keyboard's clipboard history can see them. Copy a single harmless word now to replace
            them, and delete the phrase from your keyboard's clipboard history.
          </Body>
        </Notice>
      ) : null}
      {/* Explains the red highlighting, so nobody wonders how the Signer "knows". */}
      <Body muted>
        Each word is checked against the official list of 2,048 recovery words (the BIP-39 standard Klever uses),
        which is built into the Signer. Nothing is sent anywhere: the Signer has no internet.
      </Body>

      {/* 24 / 12 words choice */}
      <View style={styles.countRow}>
        {[24, 12].map((count) => (
          <Pressable
            key={count}
            accessibilityRole="radio"
            accessibilityState={{ selected: wordCount === count }}
            onPress={() => !foundAddress && chooseCount(count)}
            style={[styles.countChoice, wordCount === count && styles.countChosen]}
          >
            <Text style={[styles.countText, wordCount === count && styles.countTextChosen]}>{count} words</Text>
          </Pressable>
        ))}
      </View>

      {/* The numbered boxes, two columns */}
      <View style={styles.grid}>
        {words.map((word, index) => {
          const looksWrong = cleanWord(word) !== '' && focused !== index && !isKnownWord(word);
          return (
            <View key={index} style={styles.cell}>
              <Text style={styles.number}>{index + 1}.</Text>
              <TextInput
                ref={(el) => { boxes.current[index] = el; }}
                style={[styles.box, looksWrong && styles.boxWrong]}
                value={word}
                editable={!foundAddress}
                onChangeText={(text) => { cancelAutofill(); onType(index, text); }}
                onFocus={() => { cancelAutofill(); setFocused(index); }}
                onBlur={() => setFocused(null)}
                onSubmitEditing={() => boxes.current[index + 1]?.focus()}
                returnKeyType={index < wordCount - 1 ? 'next' : 'done'}
                blurOnSubmit={index === wordCount - 1}
                // Privacy: no auto-correct, no suggestions, no learning, no autofill.
                autoCorrect={false}
                autoCapitalize="none"
                autoComplete="off"
                importantForAutofill="no"
                spellCheck={false}
                keyboardType="visible-password"
              />
            </View>
          );
        })}
      </View>

      {problem ? <Notice kind="danger">{problem}</Notice> : null}

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
          <Button title={`Check the words (${filled}/${wordCount})`} onPress={check} disabled={filled === 0} />
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
  countRow: { flexDirection: 'row', marginVertical: 10 },
  countChoice: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, marginRight: 10,
  },
  countChosen: { borderColor: colors.accent, backgroundColor: colors.accent },
  countText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  countTextChosen: { color: colors.accentText },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginVertical: 8 },
  cell: { width: '50%', flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingRight: 8 },
  number: { color: colors.muted, width: 28, fontSize: 14, textAlign: 'right', marginRight: 6 },
  box: {
    flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 8,
    color: colors.text, fontSize: 16, paddingHorizontal: 10, paddingVertical: 8,
  },
  boxWrong: { borderColor: colors.danger },
  address: { color: colors.accent, fontSize: 15, fontFamily: 'monospace', marginVertical: 8 },
});
