/*
 * ShowPhraseScreen.js — shows a brand-new recovery phrase, once
 * =============================================================
 *
 * The recovery phrase is the master backup of the wallet. Whoever has these
 * words owns the wallet. You need them if you forget your app password,
 * lose the phone, or reinstall the Signer.
 *
 * SAFETY MEASURES ON THIS SCREEN
 *   - Screenshots and screen recording are blocked while it's open, and the
 *     phone's "recent apps" preview shows a blank page instead of the words.
 *   - The Signer never saves the phrase. After setup it's gone from the app
 *     for good. Your paper copy is the only copy.
 *   - You must tick "I've written them down" before you can continue, and the
 *     next screen checks a few words.
 */

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { Body, Button, Notice, Screen, Strong, Title, colors } from '../components/ui.js';

/**
 * @param {object} props
 * @param {string} props.phrase       the words, separated by spaces
 * @param {() => void} props.onContinue
 * @param {() => void} props.onBack
 */
export default function ShowPhraseScreen({ phrase, onContinue, onBack }) {
  // Block screenshots while this screen is visible (released automatically when it closes).
  usePreventScreenCapture('show-phrase');

  const [writtenDown, setWrittenDown] = useState(false);
  const words = phrase.split(' ');

  return (
    <Screen>
      <Title>Your recovery phrase</Title>
      <Notice kind="danger">
        <Body>
          <Strong>Write these {words.length} words on paper, in this order.</Strong> Anyone who sees them can take
          everything in this wallet.
        </Body>
        <Body muted>No photos, no screenshots, no notes apps, no cloud, no messages. Paper only, kept somewhere safe.</Body>
      </Notice>

      {/* The words in a numbered grid, two columns. */}
      <View style={styles.grid}>
        {words.map((word, index) => (
          <View key={index} style={styles.cell}>
            <Text style={styles.number}>{index + 1}.</Text>
            <Text style={styles.word}>{word}</Text>
          </View>
        ))}
      </View>

      <Body muted>
        The Signer will never show these words again. If you forget your app password, these words are the only
        way back into this wallet.
      </Body>

      {/* A simple tick box: tap to toggle. */}
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: writtenDown }}
        onPress={() => setWrittenDown(!writtenDown)}
        style={styles.checkRow}
      >
        <View style={[styles.box, writtenDown && styles.boxTicked]}>
          {writtenDown ? <Text style={styles.tick}>✓</Text> : null}
        </View>
        <Text style={styles.checkText}>I have written all {words.length} words down on paper.</Text>
      </Pressable>

      <Button title="Continue" onPress={onContinue} disabled={!writtenDown} />
      <Button title="Back" kind="secondary" onPress={onBack} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginVertical: 12 },
  cell: {
    width: '50%', flexDirection: 'row', alignItems: 'baseline', paddingVertical: 7, paddingRight: 8,
  },
  number: { color: colors.muted, width: 30, fontSize: 14, textAlign: 'right', marginRight: 8 },
  word: { color: colors.text, fontSize: 18, fontWeight: '600' },
  checkRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  box: {
    width: 26, height: 26, borderRadius: 6, borderWidth: 2, borderColor: colors.accent,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  boxTicked: { backgroundColor: colors.accent },
  tick: { color: colors.accentText, fontWeight: '900' },
  checkText: { color: colors.text, fontSize: 16, flex: 1 },
});
