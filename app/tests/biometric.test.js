/*
 * biometric.test.js — automatic checks for the fingerprint/face option
 * ====================================================================
 * - security/biometricPolicy.js: when the password is needed instead
 * - crypto/vault.js: the scrambling key (what the fingerprint copy holds)
 *   opens the vault, and only the right one does
 * (Android's fingerprint prompt itself can only be tested on the phone.)
 * Run with `npm test` from the `app` folder.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  afterPasswordUsed, BIOMETRIC_OFF, biometricBlockedReason, describeBlockedReason, PASSWORD_REFRESH_DAYS,
} from '../src/security/biometricPolicy.js';
import { lockKey, openVault, scramblingKeyFromPassword, WrongPasswordError } from '../src/crypto/vault.js';
import { useEngineForTests } from '../src/crypto/passwordKey.js';
import { walletFromPhrase } from '../src/crypto/wallet.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 30, 12);
const ON = { enabled: true, lastPasswordAt: NOW - DAY, bootCount: 7 };
// The public BIP-39 test phrase (never holds real funds).
const PUBLIC_TEST_PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const QUICK = { N: 1024, r: 8, p: 1 };

test('fingerprint/face is allowed when on, same start-up, password used recently', () => {
  assert.equal(biometricBlockedReason(ON, { now: NOW, bootCount: 7 }), null);
});

test('option off means no fingerprint/face', () => {
  assert.equal(biometricBlockedReason(BIOMETRIC_OFF, { now: NOW, bootCount: 7 }), 'off');
  assert.equal(biometricBlockedReason(null, { now: NOW, bootCount: 7 }), 'off');
});

test('after a phone restart, the password is needed', () => {
  assert.equal(biometricBlockedReason(ON, { now: NOW, bootCount: 8 }), 'restart');
  // Start-up count unknown: that check is skipped, not failed
  assert.equal(biometricBlockedReason(ON, { now: NOW, bootCount: -1 }), null);
  assert.equal(biometricBlockedReason({ ...ON, bootCount: -1 }, { now: NOW, bootCount: 8 }), null);
});

test(`after ${PASSWORD_REFRESH_DAYS} days without the password, the password is needed`, () => {
  const old = { ...ON, lastPasswordAt: NOW - PASSWORD_REFRESH_DAYS * DAY - 1 };
  assert.equal(biometricBlockedReason(old, { now: NOW, bootCount: 7 }), 'week');
  const justInside = { ...ON, lastPasswordAt: NOW - PASSWORD_REFRESH_DAYS * DAY + 1000 };
  assert.equal(biometricBlockedReason(justInside, { now: NOW, bootCount: 7 }), null);
  assert.equal(biometricBlockedReason({ ...ON, lastPasswordAt: 0 }, { now: NOW, bootCount: 7 }), 'week');
});

test('using the password makes fingerprint/face available again', () => {
  const next = afterPasswordUsed({ ...ON, lastPasswordAt: 0 }, { now: NOW, bootCount: 8 });
  assert.equal(next.enabled, true);
  assert.equal(biometricBlockedReason(next, { now: NOW + DAY, bootCount: 8 }), null);
  assert.match(describeBlockedReason('restart'), /restarted/);
  assert.match(describeBlockedReason('week'), /7 days/);
});

test('the scrambling key opens the vault, a different one does not', async () => {
  useEngineForTests(null);
  const { privateKey, address } = walletFromPhrase(PUBLIC_TEST_PHRASE);
  const original = Uint8Array.from(privateKey);
  const vault = await lockKey(privateKey, 'maple tunnel orbit', address, QUICK);

  const key = await scramblingKeyFromPassword(vault, 'maple tunnel orbit');
  assert.equal(key.length, 32);
  assert.deepEqual(openVault(vault, key), original);

  const wrong = await scramblingKeyFromPassword(vault, 'wrong password');
  assert.throws(() => openVault(vault, wrong), WrongPasswordError);
  const flipped = Uint8Array.from(key);
  flipped[0] ^= 1;
  assert.throws(() => openVault(vault, flipped), WrongPasswordError);
});

test('a "last used" time in the future (clock changed) counts as too long ago', () => {
  assert.equal(biometricBlockedReason({ ...ON, lastPasswordAt: NOW + DAY }, { now: NOW, bootCount: 7 }), 'week');
});
