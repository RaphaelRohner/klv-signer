/*
 * phraseInput.test.js — automatic checks for the numbered word boxes
 * ==================================================================
 *
 * Checks the helpers behind the Restore screen's one-box-per-word input
 * (src/crypto/phraseInput.js). Run with `npm test` from the `app` folder.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanWord, isKnownWord, spreadWords } from '../src/crypto/phraseInput.js';

const empty = (n) => Array.from({ length: n }, () => '');

test('real recovery words are recognised, made-up ones are not', () => {
  assert.equal(isKnownWord('abandon'), true);
  assert.equal(isKnownWord('  Zoo '), true);   // spaces and capitals don't matter
  assert.equal(isKnownWord('abandom'), false); // typo
  assert.equal(isKnownWord('bitcoin'), false); // real English, but not on the list
  assert.equal(isKnownWord(''), false);
});

test('cleanWord trims and lower-cases', () => {
  assert.equal(cleanWord('  ApPle '), 'apple');
});

test('normal typing only changes the box being typed in', () => {
  const r = spreadWords(empty(4), 1, 'Ab');
  assert.deepEqual(r.words, ['', 'ab', '', '']);
  assert.equal(r.focus, null);
});

test('a word followed by a space stays in its box and moves to the next box', () => {
  const r = spreadWords(empty(4), 0, 'apple ');
  assert.deepEqual(r.words, ['apple', '', '', '']);
  assert.equal(r.focus, 1);
});

test('pasting a whole phrase into box 1 fills all boxes', () => {
  const r = spreadWords(empty(4), 0, 'Apple  banana\ncherry date');
  assert.deepEqual(r.words, ['apple', 'banana', 'cherry', 'date']);
  assert.equal(r.focus, null); // nowhere left to go
});

test('pasting into a middle box fills from there, ignoring extra words', () => {
  const r = spreadWords(['one', '', '', ''], 2, 'x y z');
  assert.deepEqual(r.words, ['one', '', 'x', 'y']);
});

test('pasting fewer words than boxes moves to the next empty box', () => {
  const r = spreadWords(empty(5), 0, 'a b');
  assert.deepEqual(r.words, ['a', 'b', '', '', '']);
  assert.equal(r.focus, 2);
});

test('typing only a space leaves the box empty', () => {
  const r = spreadWords(empty(3), 1, ' ');
  assert.deepEqual(r.words, ['', '', '']);
});
