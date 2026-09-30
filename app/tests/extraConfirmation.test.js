/*
 * extraConfirmation.test.js — automatic checks for the "extra confirmation" rules
 * Run with `npm test` from the `app` folder.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RULES, EMPTY_HISTORY, reasonsForExtraConfirmation, isRelaxing, parseKlv, formatKlv,
  endingMatches, receiversToConfirm, withRequest, withSigned, BURST_WINDOW_MS, receiverKey, checkRules, MAX_RECEIVERS,
  klvCandidates,
} from '../src/security/extraConfirmation.js';
import { validAddressOrNull } from '../src/klever/address.js';

const A = 'klv1rr0kkwkv9var3as20unaaek57cyrmt2mszvp757ljchmatyc8xasv4a0cy';
const B = 'klv1xw69fmu8wudt4wkyq4s2dll83yu37jzm4zfvc0leau8jgrkc82js64cj7j';
const NOW = 1_000_000_000_000;
const klv = (to, klvAmount) => ({ to, assetId: 'KLV', amount: parseKlv(klvAmount), isNft: false });
let n = 0;
const tx = (...transfers) => ({ transfers, hashHex: `hash${(n += 1)}` });
const known = { ...EMPTY_HISTORY, receivers: { [receiverKey(A)]: 1, [receiverKey(B)]: 2 }, apps: { 'com.hub': 3 } };
const ids = (reading, rules = DEFAULT_RULES, history = known, appId = 'com.hub', now = NOW) =>
  reasonsForExtraConfirmation(reading, rules, history, { appId, now }).map((r) => r.id);

test('a normal transfer to a known receiver from a known app needs nothing extra', () => {
  assert.deepEqual(ids(tx(klv(A, '5'))), []);
});

test('new receiver (on by default)', () => {
  assert.deepEqual(ids(tx(klv(A, '5')), DEFAULT_RULES, EMPTY_HISTORY, null), ['newReceiver']);
  assert.deepEqual(ids(tx(klv(A, '5')), { ...DEFAULT_RULES, newReceiver: false }, EMPTY_HISTORY, null), []);
});

test('amount threshold counts the total KLV of the transaction', () => {
  const rules = { ...DEFAULT_RULES, klvThreshold: parseKlv('100').toString(), multiTransfer: false };
  assert.deepEqual(ids(tx(klv(A, '100')), rules), []); // exactly the limit: fine
  assert.deepEqual(ids(tx(klv(A, '100.000001')), rules), ['amount']);
  assert.deepEqual(ids(tx(klv(A, '60'), klv(B, '60')), rules), ['amount']); // can't split around it
  const text = reasonsForExtraConfirmation(tx(klv(A, '250')), rules, known, { appId: 'com.hub', now: NOW })[0].text;
  assert.match(text, /250 KLV.*100 KLV/);
});

test('trusted receivers skip the per-transfer rules', () => {
  const rules = { ...DEFAULT_RULES, klvThreshold: '1', nfts: true, trusted: [A] };
  assert.deepEqual(ids(tx(klv(A, '1000')), rules, EMPTY_HISTORY, null), []);
  assert.deepEqual(ids(tx({ to: A, assetId: 'DVKNFT-1SW5/4821', amount: 1n, isNft: true }), rules, EMPTY_HISTORY, null), []);
});

test('tokens and NFTs (off by default)', () => {
  const token = tx({ to: A, assetId: 'ABC-1234', amount: 5n, isNft: false });
  const nft = tx({ to: A, assetId: 'DVKNFT-1SW5/4821', amount: 1n, isNft: true });
  assert.deepEqual(ids(token), []);
  assert.deepEqual(ids(nft), []);
  const strict = { ...DEFAULT_RULES, otherTokens: true, nfts: true };
  assert.deepEqual(ids(token, strict), ['otherTokens']);
  assert.deepEqual(ids(nft, strict), ['nfts']);
});

test("an app's first request, and pasted-by-hand requests", () => {
  assert.deepEqual(ids(tx(klv(A, '1')), DEFAULT_RULES, known, 'com.new.app'), ['firstAppRequest']);
  assert.deepEqual(ids(tx(klv(A, '1')), DEFAULT_RULES, known, null), []);
});

test('several transfers in one transaction', () => {
  assert.deepEqual(ids(tx(klv(A, '1'), klv(B, '1'))), ['multiTransfer']);
});

test('burst: the third request within 2 minutes', () => {
  const h1 = withRequest(known, NOW - 60_000, 'x1');
  assert.deepEqual(ids(tx(klv(A, '1')), DEFAULT_RULES, h1), []);
  const h2 = withRequest(h1, NOW - 30_000, 'x2');
  assert.deepEqual(ids(tx(klv(A, '1')), DEFAULT_RULES, h2), ['burst']);
  // Older than 2 minutes doesn't count
  const old = withRequest(withRequest(known, NOW - BURST_WINDOW_MS - 1, 'x3'), NOW - BURST_WINDOW_MS - 2, 'x4');
  assert.deepEqual(ids(tx(klv(A, '1')), DEFAULT_RULES, old), []);
  // The same transaction shown again (screen re-opened) isn't counted twice
  const same = tx(klv(A, '1'));
  const again = withRequest(withRequest(known, NOW - 20_000, same.hashHex), NOW - 10_000, same.hashHex);
  assert.equal(again.recent.length, 1);
  assert.deepEqual(ids(same, DEFAULT_RULES, again), []);
  // Times in the future (clock changed) are dropped
  assert.equal(withRequest({ ...known, recent: [{ t: NOW + 99999, h: 'f' }] }, NOW, 'y').recent.length, 1);
});

test('history remembers receivers and apps after signing', () => {
  const h = withSigned(EMPTY_HISTORY, tx(klv(A, '1'), klv(B, '2')), 'com.x', NOW);
  assert.deepEqual(ids(tx(klv(A, '1')), { ...DEFAULT_RULES, multiTransfer: false }, h, 'com.x'), []);
  // Kept small: only the most recently used receivers
  let big = EMPTY_HISTORY;
  for (let i = 0; i < MAX_RECEIVERS + 20; i += 1) {
    big = withSigned(big, tx({ to: `klv1${String(i).padStart(58, 'q')}`, assetId: 'KLV', amount: 1n, isNft: false }), null, i);
  }
  assert.equal(Object.keys(big.receivers).length, MAX_RECEIVERS);
  assert.ok(big.receivers[receiverKey(`klv1${String(MAX_RECEIVERS + 19).padStart(58, 'q')}`)]); // newest kept
});

test('relaxing the rules is detected (needs the password), tightening is not', () => {
  const base = { ...DEFAULT_RULES, klvThreshold: '100000000', waitSeconds: 10 };
  assert.equal(isRelaxing(base, base), false);
  assert.equal(isRelaxing(base, { ...base, nfts: true }), false);
  assert.equal(isRelaxing(base, { ...base, klvThreshold: '50000000' }), false);
  assert.equal(isRelaxing(base, { ...base, waitSeconds: 30 }), false);
  assert.equal(isRelaxing({ ...base, trusted: [A] }, base), false); // removing a trusted receiver
  assert.equal(isRelaxing(base, { ...base, newReceiver: false }), true);
  assert.equal(isRelaxing(base, { ...base, klvThreshold: null }), true);
  assert.equal(isRelaxing(base, { ...base, klvThreshold: '200000000' }), true);
  assert.equal(isRelaxing(base, { ...base, waitSeconds: 0 }), true);
  assert.equal(isRelaxing(base, { ...base, trusted: [A] }), true);
  assert.equal(isRelaxing({ ...DEFAULT_RULES }, { ...DEFAULT_RULES, klvThreshold: '5' }), false); // switching amount on
});

test('KLV amounts and address endings', () => {
  assert.equal(parseKlv('12.5'), 12500000n);
  assert.equal(parseKlv('0'), null);
  assert.equal(parseKlv('1.1234567'), null);
  assert.equal(parseKlv('abc'), null);
  assert.equal(parseKlv('12,5'), 12500000n); // comma = decimal point (European keyboards)
  assert.equal(parseKlv('1,000.5'), 1000500000n); // English style, clear
  assert.equal(parseKlv('1.000,5'), 1000500000n); // European style, clear
  assert.equal(parseKlv('1,000,000'), 1000000000000n);
  // Ambiguous: could be 1 KLV or 1000 KLV, so there's no single answer and the screen asks
  assert.equal(parseKlv('1,000'), null);
  assert.deepEqual(klvCandidates('1,000'), [1000000n, 1000000000n]);
  assert.deepEqual(klvCandidates('1.000'), [1000000n, 1000000000n]);
  assert.deepEqual(klvCandidates('12,50'), [12500000n]); // 2 decimals: clear
  assert.deepEqual(klvCandidates('1,0,0'), []);
  assert.equal(formatKlv(12500000n), '12.5');
  assert.equal(endingMatches(A, 'v4a0cy'), true);
  assert.equal(endingMatches(A, ' V4A0CY '), true);
  assert.equal(endingMatches(A, '4a0cy'), false);
  assert.deepEqual(receiversToConfirm(tx(klv(A, '1'), klv(A, '2'), klv(B, '1'))), [A, B]);
});

test('trusted receiver addresses are checked properly', () => {
  assert.equal(validAddressOrNull(` ${A.toUpperCase()} `), A);
  assert.equal(validAddressOrNull(A.slice(0, -1) + 'x'), null); // one typo: checksum fails
  assert.equal(validAddressOrNull('klv1abc'), null);
  assert.equal(validAddressOrNull(''), null);
});

test('damaged saved rules are refused (the Signer then asks for the extra confirmation)', () => {
  assert.deepEqual(checkRules({}), { ...DEFAULT_RULES });
  assert.throws(() => checkRules({ klvThreshold: 'abc' }));
  assert.throws(() => checkRules({ klvThreshold: '0' }));
  assert.throws(() => checkRules({ waitSeconds: 7 }));
  assert.throws(() => checkRules({ nfts: 'yes' }));
  assert.equal(checkRules({ klvThreshold: '100000000' }).klvThreshold, '100000000');
});
