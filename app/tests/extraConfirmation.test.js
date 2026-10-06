/*
 * extraConfirmation.test.js — automatic checks for the "extra confirmation" rules
 * Run with `npm test` from the `app` folder.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RULES, EMPTY_HISTORY, REPEAT_WINDOW_MS, RULE_SWITCHES, reasonsForExtraConfirmation, isRelaxing, parseKlv, formatKlv,
  groupMatches, pickConfirmGroup, CONFIRM_GROUP_LENGTH, receiversToConfirm, withRequest, withSigned, BURST_WINDOW_MS, receiverKey, checkRules, MAX_RECEIVERS,
  klvCandidates, isWellFormedHistory,
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

test('other tokens (on by default since the second review) and NFTs (off by default)', () => {
  const token = tx({ to: A, assetId: 'ABC-1234', amount: 5n, isNft: false });
  const nft = tx({ to: A, assetId: 'DVKNFT-1SW5/4821', amount: 1n, isNft: true });
  assert.deepEqual(ids(token), ['otherTokens']);
  assert.deepEqual(ids(token, { ...DEFAULT_RULES, otherTokens: false }), []);
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
  // (repeat off here: this checks that receivers are remembered; repeats are tested below)
  assert.deepEqual(ids(tx(klv(A, '1')), { ...DEFAULT_RULES, multiTransfer: false, repeat: false }, h, 'com.x'), []);
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

test('the network fee counts towards the KLV amount setting (second review)', () => {
  const rules = { ...DEFAULT_RULES, klvThreshold: parseKlv('100').toString() };
  const withFee = (reading, fee) => ({ ...reading, feeUnits: parseKlv(fee) });
  assert.deepEqual(ids(withFee(tx(klv(A, '99.5')), '0.4'), rules), []);
  assert.deepEqual(ids(withFee(tx(klv(A, '99.7')), '0.4'), rules), ['amount']);
  const text = reasonsForExtraConfirmation(withFee(tx(klv(A, '99.7')), '0.4'), rules, known, { appId: 'com.hub', now: NOW })[0].text;
  assert.match(text, /100\.1 KLV \(network fee included\)/);
  // Only trusted receivers: the fee alone doesn't trigger it.
  assert.deepEqual(ids(withFee(tx(klv(A, '1')), '0.4'), { ...rules, klvThreshold: '1', trusted: [A] }), []);
});

test('the box to type is a random MIDDLE box, never the last one (third review, T3)', () => {
  // A = klv1 rr0k kwkv9v ar3as2 0unaae k57cyr mt2msz vp757l jchmat yc8xas v4a0cy
  assert.equal(CONFIRM_GROUP_LENGTH, 6);
  const seen = new Set();
  for (let r = 0; r < 8; r += 1) seen.add(pickConfirmGroup(A, () => r));
  assert.deepEqual([...seen].sort((x, y) => x - y), [2, 3, 4, 5, 6, 7, 8, 9]); // boxes 3–10 of 11; not klv1, not the last
  // With the real (secure) random generator: always within that range, and it varies.
  const picks = new Set(Array.from({ length: 200 }, () => pickConfirmGroup(A)));
  for (const i of picks) assert.ok(i >= 2 && i <= 9, String(i));
  assert.ok(picks.size >= 4, 'random enough to vary');
  // Matching: the right box only; spaces and capitals don't matter.
  assert.equal(groupMatches(A, 2, 'kwkv9v'), true);
  assert.equal(groupMatches(A, 2, ' KWK V9V '), true);
  assert.equal(groupMatches(A, 2, 'ar3as2'), false); // the next box
  assert.equal(groupMatches(A, 2, 'kwkv9'), false);
  assert.equal(groupMatches(A, 9, 'yc8xas'), true);
  assert.equal(groupMatches(A, 9, 'v4a0cy'), false); // the ending no longer counts
});

test('new wallets start with the large-amount rule at 10,000 KLV (owner\'s decision, 5 Oct 2026)', () => {
  assert.equal(DEFAULT_RULES.klvThreshold, parseKlv('10000').toString());
  assert.deepEqual(ids(tx(klv(A, '10000'))), []); // exactly the limit: fine
  assert.deepEqual(ids(tx(klv(A, '10000.000001'))), ['amount']);
  assert.deepEqual(ids(tx(klv(A, '9999'))), []);
});

test('the same transfer again within an hour asks for the extra confirmation (double payment; third review, T6)', () => {
  const first = tx(klv(A, '5'));
  const after = withSigned(known, first, 'com.hub', NOW);
  // 10 minutes later, same receiver/token/amount (a new transaction number = a new fingerprint):
  const again = tx(klv(A, '5'));
  const later = NOW + 10 * 60 * 1000;
  assert.deepEqual(ids(again, DEFAULT_RULES, after, 'com.hub', later), ['repeat']);
  assert.match(reasonsForExtraConfirmation(again, DEFAULT_RULES, after, { appId: 'com.hub', now: later })[0].text, /10 minutes ago/);
  // A different amount, receiver or token: not a repeat.
  assert.deepEqual(ids(tx(klv(A, '6')), DEFAULT_RULES, after, 'com.hub', later), []);
  assert.deepEqual(ids(tx(klv(B, '5')), DEFAULT_RULES, after, 'com.hub', later), []);
  // After the hour: not a repeat any more.
  assert.deepEqual(ids(again, DEFAULT_RULES, after, 'com.hub', NOW + REPEAT_WINDOW_MS + 1), []);
  // Trusted receivers count too (paying them twice is still paying twice).
  assert.deepEqual(ids(again, { ...DEFAULT_RULES, trusted: [A] }, after, 'com.hub', later), ['repeat']);
  // Switch it off: nothing; switching it off is "relaxing" (needs the password).
  assert.deepEqual(ids(again, { ...DEFAULT_RULES, repeat: false }, after, 'com.hub', later), []);
  assert.equal(isRelaxing(DEFAULT_RULES, { ...DEFAULT_RULES, repeat: false }), true);
  assert.ok(RULE_SWITCHES.includes('repeat'));
  // Old saved history without the new list still works.
  assert.deepEqual(ids(again, DEFAULT_RULES, { ...known, signed: undefined }, 'com.hub', later), []);
});

test('a damaged signing history asks for the extra confirmation (weekly check, 6 Oct 2026)', () => {
  assert.equal(isWellFormedHistory(known), true);
  assert.equal(isWellFormedHistory(EMPTY_HISTORY), true);
  for (const bad of [null, 'x', { ...known, receivers: [] }, { ...known, recent: [{ t: 'x' }] }, { ...known, signed: 'oops' }, { ...known, apps: { a: 'b' } }]) {
    assert.equal(isWellFormedHistory(bad), false, JSON.stringify(bad));
  }
  // loadHistory marks an unreadable record with `unreadable: true`.
  assert.ok(ids(tx(klv(A, '5')), DEFAULT_RULES, { ...EMPTY_HISTORY, unreadable: true }).includes('history'));
  // The mark is never saved back.
  assert.equal('unreadable' in withRequest({ ...EMPTY_HISTORY, unreadable: true }, NOW, 'h1'), false);
});
