/* global Buffer */
/*
 * crypto.test.js — automatic checks for the wallet and vault code
 * ===============================================================
 *
 * These tests run on a computer (not the phone) and check that the
 * security-critical parts behave exactly as intended. Run them from the
 * `app` folder with:
 *
 *     npm test
 *
 * Every line starting with "✔" is a passed check. Any "✖" means something
 * is wrong. Don't build the app until that's fixed.
 *
 * (The files under test only calculate. They don't need a phone, which is
 * why we can test them here. The screens are tested by hand, see TESTING.md.)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scrypt as nodeScrypt } from 'node:crypto';

import {
  createRecoveryPhrase, tidyPhrase, isValidRecoveryPhrase, walletFromPhrase, addressFromPrivateKey,
} from '../src/crypto/wallet.js';
import { lockKey, lockKeyChecked, unlockKey, WrongPasswordError } from '../src/crypto/vault.js';
import { useEngineForTests, engineName, keyFromPassword } from '../src/crypto/passwordKey.js';
import { waitSecondsAfter, recordFailure, secondsLeft, FRESH_STATE, restartIfRebooted } from '../src/security/wrongPasswordPolicy.js';
import { PASSWORD_STRETCHING } from '../src/config.js';

// A famous PUBLIC test phrase from the BIP-39 standard. Everyone knows it,
// so it must never hold anything of value. Used only to check the recipe.
const PUBLIC_TEST_PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
// Its Klever address, worked out independently from the published standards
// (BIP-39 + SLIP-10 + path m/44'/690'/0'/0'/0'), not with Klever's library.
const PUBLIC_TEST_ADDRESS = 'klv1usdnywjhrlv4tcyu6stxpl6yvhplg35nepljlt4y5r7yppe8er4qujlazy';

// Light stretching settings so most tests run fast. One test uses the real ones.
const QUICK = { N: 1024, r: 8, p: 1 };

// A stand-in for the phone's fast engine: Node's own built-in scrypt.
const nodeEngine = (pw, salt, params, dkLen) => new Promise((resolve, reject) => {
  nodeScrypt(pw, salt, dkLen, { N: params.N, r: params.r, p: params.p, maxmem: 128 * params.N * params.r * 2 },
    (err, out) => (err ? reject(err) : resolve(new Uint8Array(out))));
});

// --- Wallets ---------------------------------------------------------------

test('the public test phrase gives the independently calculated Klever address', () => {
  const { address } = walletFromPhrase(PUBLIC_TEST_PHRASE);
  assert.equal(address, PUBLIC_TEST_ADDRESS);
});

test('a new recovery phrase has 24 valid words and gives a klv1 address', () => {
  const phrase = createRecoveryPhrase(24);
  assert.equal(phrase.split(' ').length, 24);
  assert.ok(isValidRecoveryPhrase(phrase));
  const { privateKey, address } = walletFromPhrase(phrase);
  assert.equal(privateKey.length, 32);
  assert.match(address, /^klv1[0-9a-z]{58}$/);
});

test('two new phrases are never the same (randomness works)', () => {
  assert.notEqual(createRecoveryPhrase(24), createRecoveryPhrase(24));
});

test('messy typing is tidied up before checking', () => {
  assert.equal(tidyPhrase('  Abandon\n ABANDON   about \t'), 'abandon abandon about');
  assert.ok(isValidRecoveryPhrase(tidyPhrase(PUBLIC_TEST_PHRASE.toUpperCase().replace(/ /g, '   '))));
});

test('a phrase with a typo is rejected, not turned into a different wallet', () => {
  const typo = PUBLIC_TEST_PHRASE.replace(/about$/, 'above');
  assert.equal(isValidRecoveryPhrase(typo), false);
  assert.equal(isValidRecoveryPhrase('not a real phrase at all'), false);
  assert.equal(isValidRecoveryPhrase(''), false);
});

// --- The vault ---------------------------------------------------------------

test('lock then unlock with the right password gives back the same key', async () => {
  useEngineForTests(null);
  const { privateKey, address } = walletFromPhrase(PUBLIC_TEST_PHRASE);
  const original = Uint8Array.from(privateKey);
  const vault = await lockKey(privateKey, 'maple tunnel orbit', address, QUICK);
  const back = await unlockKey(vault, 'maple tunnel orbit');
  assert.deepEqual(back, original);
  assert.equal(addressFromPrivateKey(back), address);
});

test('the saved vault contains no password and no readable key', async () => {
  const { privateKey, address } = walletFromPhrase(PUBLIC_TEST_PHRASE);
  const keyHex = Buffer.from(privateKey).toString('hex');
  const vault = await lockKey(privateKey, 'maple tunnel orbit', address, QUICK);
  const saved = JSON.stringify(vault);
  assert.ok(!saved.includes('maple'));
  assert.ok(!saved.includes(keyHex));
});

test('a wrong password is refused with WrongPasswordError', async () => {
  const { privateKey, address } = walletFromPhrase(PUBLIC_TEST_PHRASE);
  const vault = await lockKey(privateKey, 'right password', address, QUICK);
  await assert.rejects(unlockKey(vault, 'wrong password'), WrongPasswordError);
  await assert.rejects(unlockKey(vault, 'right passworD'), WrongPasswordError);
  await assert.rejects(unlockKey(vault, ''), WrongPasswordError);
});

test('a tampered vault is refused', async () => {
  const { privateKey, address } = walletFromPhrase(PUBLIC_TEST_PHRASE);
  const vault = await lockKey(privateKey, 'pw12345678', address, QUICK);
  const flipped = vault.scrambledKey[0] === 'a' ? 'b' : 'a';
  await assert.rejects(unlockKey({ ...vault, scrambledKey: flipped + vault.scrambledKey.slice(1) }, 'pw12345678'), WrongPasswordError);
  await assert.rejects(unlockKey({ ...vault, address: 'klv1' + 'q'.repeat(58) }, 'pw12345678'), WrongPasswordError);
});

test('the same key locked twice gives two different vaults (random salt and nonce)', async () => {
  const { privateKey, address } = walletFromPhrase(PUBLIC_TEST_PHRASE);
  const a = await lockKey(privateKey, 'pw12345678', address, QUICK);
  const b = await lockKey(privateKey, 'pw12345678', address, QUICK);
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.scrambledKey, b.scrambledKey);
});

test('passwords typed with different accent input still match (NFKC)', async () => {
  const { privateKey, address } = walletFromPhrase(PUBLIC_TEST_PHRASE);
  const vault = await lockKey(privateKey, 'caf\u00e9 pass', address, QUICK); // \u00e9 as one character
  const back = await unlockKey(vault, 'cafe\u0301 pass');                   // e + separate accent
  assert.equal(back.length, 32);
});

test('works with the real stretching settings from config.js', async () => {
  const { privateKey, address } = walletFromPhrase(PUBLIC_TEST_PHRASE);
  const vault = await lockKey(privateKey, 'real settings pw', address, PASSWORD_STRETCHING);
  assert.equal(vault.N, PASSWORD_STRETCHING.N);
  const back = await unlockKey(vault, 'real settings pw');
  assert.equal(addressFromPrivateKey(back), address);
});

// --- Choosing the engine -----------------------------------------------------

test('a correct fast engine is used, and gives the same key as the backup engine', async () => {
  const salt = new Uint8Array(16).fill(7);
  useEngineForTests(null);
  const fromBackup = await keyFromPassword('same password', salt, QUICK);
  assert.equal(engineName(), 'backup (JavaScript)');
  useEngineForTests(nodeEngine);
  const fromFast = await keyFromPassword('same password', salt, QUICK);
  assert.equal(engineName(), 'fast (native)');
  assert.deepEqual(fromFast, fromBackup);
});

test('a vault made with one engine unlocks with the other', async () => {
  const { privateKey, address } = walletFromPhrase(PUBLIC_TEST_PHRASE);
  useEngineForTests(nodeEngine);
  const vault = await lockKey(privateKey, 'cross engine pw', address, QUICK);
  useEngineForTests(null);
  const back = await unlockKey(vault, 'cross engine pw');
  assert.equal(addressFromPrivateKey(back), address);
});

test('a broken fast engine is detected and the backup engine is used instead', async () => {
  useEngineForTests(async () => new Uint8Array(32)); // always returns zeros: wrong
  await keyFromPassword('x', new Uint8Array(16), QUICK);
  assert.equal(engineName(), 'backup (JavaScript)');
  useEngineForTests(async () => { throw new Error('native crashed'); });
  await keyFromPassword('x', new Uint8Array(16), QUICK);
  assert.equal(engineName(), 'backup (JavaScript)');
  useEngineForTests(null);
});

// --- Wrong-password waiting times ------------------------------------------------

test('first 4 wrong passwords are free, then waits double up to 1 hour', () => {
  assert.equal(waitSecondsAfter(0), 0);
  assert.equal(waitSecondsAfter(4), 0);
  assert.equal(waitSecondsAfter(5), 30);
  assert.equal(waitSecondsAfter(6), 60);
  assert.equal(waitSecondsAfter(7), 120);
  assert.equal(waitSecondsAfter(12), 3600);
  assert.equal(waitSecondsAfter(500), 3600);
});

test('the counter records failures and the time you must wait', () => {
  const now = 1_000_000;
  let state = { ...FRESH_STATE };
  for (let i = 0; i < 4; i += 1) state = recordFailure(state, now);
  assert.equal(state.failures, 4);
  assert.equal(secondsLeft(state, now), 0);
  state = recordFailure(state, now);
  assert.equal(state.failures, 5);
  assert.equal(secondsLeft(state, now), 30);
  assert.equal(secondsLeft(state, now + 29_500), 1);
  assert.equal(secondsLeft(state, now + 30_000), 0);
});

test('waiting times are shown in plain words', async () => {
  const { formatWait } = await import('../src/security/wrongPasswordPolicy.js');
  assert.equal(formatWait(30), '30 s');
  assert.equal(formatWait(75), '1 min 15 s');
  assert.equal(formatWait(3600), '60 min 0 s');
});

test('waiting times use the stopwatch: changing the phone clock does not help (second review)', () => {
  const at = (now, elapsed, boot = 7) => ({ now, elapsed, boot });
  let state = FRESH_STATE;
  for (let i = 0; i < 5; i += 1) state = recordFailure(state, at(1_000_000, 50_000));
  assert.equal(secondsLeft(state, at(1_000_000, 50_000)), 30);
  // Clock moved a day FORWARD, only 10 s really passed: still 20 s to wait.
  assert.equal(secondsLeft(state, at(1_000_000 + 86_400_000, 60_000)), 20);
  // Clock moved BACK: the wait doesn't get longer than it was.
  assert.equal(secondsLeft(state, at(0, 60_000)), 20);
  assert.equal(secondsLeft(state, at(1_000_000, 80_000)), 0);
});

test('after a phone restart a running wait starts again; without a stopwatch it is capped', () => {
  let state = FRESH_STATE;
  for (let i = 0; i < 5; i += 1) state = recordFailure(state, { now: 1_000_000, elapsed: 50_000, boot: 7 });
  const after = restartIfRebooted(state, { now: 2_000_000, elapsed: 1_000, boot: 8 });
  assert.equal(secondsLeft(after, { now: 2_000_000, elapsed: 1_000, boot: 8 }), 30);
  assert.equal(restartIfRebooted(state, { now: 1_000_000, elapsed: 55_000, boot: 7 }), state); // same start-up: unchanged
  // Wall clock only: moving it back an hour can't make the wait longer than 30 s.
  assert.equal(secondsLeft(state, 1_000_000 - 3_600_000), 30);
});

test('a wallet file with out-of-range settings is refused before any work (third review, C6)', async () => {
  const { privateKey, address } = walletFromPhrase(PUBLIC_TEST_PHRASE);
  const vault = await lockKey(privateKey, 'maple tunnel orbit ginger', address, { N: 1024, r: 8, p: 1 });
  for (const bad of [{ N: 2 ** 22 }, { N: 1000 }, { N: 512 }, { r: 64 }, { p: 99 }, { salt: 'zz' }, { scrambledKey: 'ab' }]) {
    await assert.rejects(unlockKey({ ...vault, ...bad }, 'maple tunnel orbit ginger'), /damaged/, JSON.stringify(bad));
  }
  const key = await unlockKey(vault, 'maple tunnel orbit ginger'); // the untouched one still opens
  assert.equal(key.length, 32);
});

test('a new lock is test-opened before it replaces the old one (weekly check, 6 Oct 2026)', async () => {
  useEngineForTests(null);
  const { privateKey, address } = walletFromPhrase(PUBLIC_TEST_PHRASE);
  const vault = await lockKeyChecked(privateKey, 'maple tunnel orbit', address, QUICK);
  const back = await unlockKey(vault, 'maple tunnel orbit');
  assert.deepEqual(Array.from(back), Array.from(privateKey));
});
