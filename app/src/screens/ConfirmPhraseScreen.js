/*
 * ConfirmPhraseScreen.js — checks that the recovery phrase was written down
 * ========================================================================
 *
 * Asks for three randomly chosen words from the phrase (for example word
 * #4, #11 and #19). If you can fill them in from your paper, you most likely
 * wrote the whole list down correctly. This catches the classic mistake of
 * skipping a word or mixing up the order, BEFORE it matters.
 */

import React, { useMemo, useState } from 'react';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { Body, Button, Field, Notice, Screen, Title } from '../components/ui.js';
import { tidyPhrase } from '../crypto/wallet.js';

/** How many words we ask for. */
const WORDS_TO_CHECK = 3;

/**
 * pickPositions — chooses `count` different word positions at random,
 * sorted so they're asked in order (e.g. [3, 11, 19]). Positions start at 0.
 */
function pickPositions(totalWords, count) {
  const chosen = new Set();
  while (chosen.size < count) {
    chosen.add(Math.floor(Math.random() * totalWords));
  }
  return [...chosen].sort((a, b) => a - b);
}

/**
 * @param {object} props
 * @param {string} props.phrase
 * @param {() => void} props.onConfirmed   called when all words match
 * @param {() => void} props.onBack        go back to see the words again
 */
export default function ConfirmPhraseScreen({ phrase, onConfirmed, onBack }) {
  usePreventScreenCapture('confirm-phrase');

  const words = phrase.split(' ');
  // useMemo: pick the positions once when the screen opens, not on every keystroke.
  const positions = useMemo(() => pickPositions(phrase.split(' ').length, WORDS_TO_CHECK), [phrase]);
  const [answers, setAnswers] = useState(positions.map(() => ''));
  const [mismatch, setMismatch] = useState(false);

  function check() {
    const allRight = positions.every((pos, i) => tidyPhrase(answers[i]) === words[pos]);
    if (allRight) {
      onConfirmed();
    } else {
      setMismatch(true);
    }
  }

  return (
    <Screen>
      <Title>Check your paper</Title>
      <Body>Using the list you just wrote down, fill in these words:</Body>

      {positions.map((pos, i) => (
        <Field
          key={pos}
          label={`Word #${pos + 1}`}
          value={answers[i]}
          noLearning
          onChangeText={(text) => {
            const next = [...answers];
            next[i] = text;
            setAnswers(next);
            setMismatch(false);
          }}
        />
      ))}

      {mismatch ? (
        <Notice kind="danger">
          At least one word doesn't match. Compare your paper with the list carefully. You can go back
          and look at the words again.
        </Notice>
      ) : null}

      <Button title="Check" onPress={check} disabled={answers.some((a) => !a.trim())} />
      <Button title="Back to the word list" kind="secondary" onPress={onBack} />
    </Screen>
  );
}
