/*
 * phraseInput.js — helpers for typing a recovery phrase into numbered boxes
 * ========================================================================
 *
 * The Restore screen has one box per word (like the Klever Wallet app), so
 * nobody has to wonder about spaces. This file holds the small calculations
 * behind those boxes. Keeping them here (instead of inside the screen) lets
 * the automatic tests check them on a computer.
 *
 *   isKnownWord(word)        is this one of the 2048 official recovery words?
 *   spreadWords(words, i, t) handles typing/pasting into box number i,
 *                            including pasting a whole phrase at once
 *
 * Nothing here saves or logs anything.
 */

import { wordlist } from '@scure/bip39/wordlists/english';

// All 2048 official words (the BIP-39 English list, the same one Klever uses),
// put in a Set so looking one up is instant.
const KNOWN_WORDS = new Set(wordlist);

/**
 * cleanWord — lower-case and trim one word: "  Apple " → "apple".
 * @param {string} text
 * @returns {string}
 */
export function cleanWord(text) {
  return String(text || '').trim().toLowerCase();
}

/**
 * isKnownWord — true if the word is on the official list of recovery words.
 * Used to mark a box red as soon as a word can't possibly be right.
 * @param {string} word
 * @returns {boolean}
 */
export function isKnownWord(word) {
  return KNOWN_WORDS.has(cleanWord(word));
}

/**
 * spreadWords — works out the new contents of all boxes after typing into box `index`.
 *
 * Three cases:
 *   1. Normal typing ("app"): only that box changes.
 *   2. Word followed by a space ("apple "): the box keeps "apple" and the
 *      cursor should jump to the next box, so a space works like "next".
 *   3. Pasting several words ("apple banana cherry …"): the words fill this
 *      box and the following ones, so a whole phrase can be pasted into box 1.
 *
 * @param {string[]} words  current contents of all boxes
 * @param {number} index    which box was typed into (0 = first)
 * @param {string} text     what that box now contains
 * @returns {{ words: string[], focus: number|null }}
 *   words: the new contents of all boxes
 *   focus: which box the cursor should move to, or null to stay put
 */
export function spreadWords(words, index, text) {
  const next = [...words];
  const parts = String(text || '').toLowerCase().split(/\s+/);
  const endsWithSpace = /\s$/.test(String(text || ''));
  const pieces = parts.filter(Boolean);

  // Case 1: plain typing (no spaces at all)
  if (pieces.length <= 1 && !endsWithSpace) {
    next[index] = String(text || '').toLowerCase();
    return { words: next, focus: null };
  }

  // Case 2 and 3: one or more finished words
  let position = index;
  for (const piece of pieces) {
    if (position >= next.length) break; // ignore extra words beyond the last box
    next[position] = piece;
    position += 1;
  }
  if (pieces.length === 0) next[index] = ''; // only spaces were typed

  // Move the cursor to the box after the last word placed (if there is one).
  const focus = position < next.length ? position : null;
  return { words: next, focus };
}
