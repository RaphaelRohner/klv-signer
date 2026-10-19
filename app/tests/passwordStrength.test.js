/*
 * passwordStrength.test.js — automatic checks for the password strength hint
 * and the stronger password settings (Stage 4).
 * Run with `npm test` from the `app` folder.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAcceptablePassword, passwordStrength, keyboardWalkShare } from '../src/security/passwordStrength.js';
import { MIN_PASSWORD_LENGTH, PASSWORD_STRETCHING } from '../src/config.js';
import { isWeakerThan } from '../src/crypto/vault.js';

const level = (pw) => passwordStrength(pw).level;

test('minimum length is 12 and the stretching is 4x the Stage 1-3 setting', () => {
  assert.equal(MIN_PASSWORD_LENGTH, 12);
  assert.deepEqual(PASSWORD_STRETCHING, { N: 131072, r: 8, p: 1 });
});

test('empty and too short', () => {
  assert.equal(level(''), 'none');
  assert.equal(level('short pw'), 'weak');
});

test('common passwords and tricks on them are weak', () => {
  assert.equal(level('password1234'), 'weak');
  assert.equal(level('Password2024!'), 'weak');
  assert.equal(level('Klever-Wallet-99'), 'weak');
  assert.equal(level('qwertyuiop12'), 'weak');
});

test('repetitive or sequences are weak', () => {
  assert.equal(level('aaaaaaaaaaaa'), 'weak');
  assert.equal(level('123456789012'), 'weak');
  assert.equal(level('abcdefghijklm'), 'weak');
  assert.equal(level('abababababab'), 'weak');
});

test('4 random words are strong', () => {
  assert.equal(level('maple tunnel orbit ginger'), 'strong');
  assert.equal(level('maple-tunnel-orbit-ginger'), 'strong');
});

test('long with a mix is strong, medium ones are fair', () => {
  assert.equal(level('Tr0mb0ne!Garden'), 'strong');
  assert.equal(level('violinrocket7'), 'fair');
  assert.equal(passwordStrength('violinrocket7').hint.includes('4 random words'), true);
});

test('older, lighter vaults are recognised for upgrading', () => {
  assert.equal(isWeakerThan({ N: 32768, r: 8, p: 1 }, PASSWORD_STRETCHING), true);
  assert.equal(isWeakerThan({ N: 131072, r: 8, p: 1 }, PASSWORD_STRETCHING), false);
  assert.equal(isWeakerThan(null, PASSWORD_STRETCHING), false);
});

test('weak passwords are refused as a new password; fair and strong are accepted (third review, C1)', () => {
  for (const pw of ['111111111111', 'password1234', 'qwertyuiop12', 'klever123456', 'abcdefghijkl', 'short']) {
    assert.equal(isAcceptablePassword(pw), false, pw);
  }
  for (const pw of ['maple tunnel orbit ginger', 'Raphael-Dublin-77', 'cobalt4Lantern!']) {
    assert.equal(isAcceptablePassword(pw), true, pw);
  }
});

test('near variants of common passwords are refused (weekly check, 6 Oct 2026)', () => {
  // Letters swapped for look-alike digits/symbols, a common word padded with
  // digits, or the same piece repeated: guessing programs try all of these.
  for (const pw of ['Passw0rd1234', 'P@ssw0rd2026!', 'passwordpassword', 'qwertyqwerty', 'abcabcabcabc', '123412341234', 'L3tm31n!2026x']) {
    assert.equal(isAcceptablePassword(pw), false, pw);
  }
  // Long passwords that only happen to contain a short common word stay fine.
  for (const pw of ['maple tunnel orbit river', 'Correct horse battery staple', 'dragonfly-meadow-ninety-7']) {
    assert.equal(isAcceptablePassword(pw), true, pw);
  }
});

test('patterns of neighbouring keys are refused (weekly check, 12 Oct 2026)', () => {
  // The three from the report, and other well-known keyboard walks (English and German/Swiss keyboards).
  for (const pw of ['123456789abc', '1234qwerasdf', '!QAZ2wsx#EDC', '1qaz2wsx3edc', 'qazwsxedcrfv', 'zaq12wsxcde3',
    '1q2w3e4r5t6y', 'qwerasdfzxcv', 'poiuytrewq12', '1qay2wsx3edc', 'mnbvcxz12345', 'yxcvbnm12345']) {
    assert.equal(isAcceptablePassword(pw), false, pw);
    assert.match(passwordStrength(pw).hint, /neighbouring keys|sequence|repeated|common/, pw);
  }
  // Real passwords and random words stay well below the limit.
  for (const pw of ['maple tunnel orbit ginger', 'Correct horse battery staple', 'Tr0mb0ne!Garden', 'Xk9#mPq2$vLw',
    'trees grow slowly', 'kiwifruitsalad', 'Raphael-Dublin-77', 'cobalt4Lantern!', 'Sunflower Boat 42']) {
    assert.ok(keyboardWalkShare(pw) < 0.5, `${pw}: ${keyboardWalkShare(pw)}`);
    assert.equal(isAcceptablePassword(pw), true, pw);
  }
});
