/*
 * changePassword.test.js — what "Change password" does to the vault
 * =================================================================
 * The screen (ChangePasswordScreen.js) unlocks the key with the current
 * password and scrambles it again with the new one. These checks make sure
 * that afterwards: the new password works, the old one doesn't, the wallet
 * is unchanged, and the new vault shares nothing secret with the old one.
 * Run with `npm test` from the `app` folder.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lockKey, unlockKey, scramblingKeyFromPassword, openVault, WrongPasswordError } from '../src/crypto/vault.js';
import { useEngineForTests } from '../src/crypto/passwordKey.js';
import { walletFromPhrase, addressFromPrivateKey } from '../src/crypto/wallet.js';

// The public BIP-39 test phrase (never holds real funds).
const PUBLIC_TEST_PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const QUICK = { N: 1024, r: 8, p: 1 };

test('after changing the password: new works, old does not, same wallet', async () => {
  useEngineForTests(null);
  const { privateKey, address } = walletFromPhrase(PUBLIC_TEST_PHRASE);
  const oldVault = await lockKey(privateKey, 'old password one', address, QUICK);

  // What the screen does
  const key = await unlockKey(oldVault, 'old password one');
  const newVault = await lockKey(key, 'new password two', address, QUICK);

  const back = await unlockKey(newVault, 'new password two');
  assert.equal(addressFromPrivateKey(back), address);
  assert.equal(newVault.address, oldVault.address);
  await assert.rejects(unlockKey(newVault, 'old password one'), WrongPasswordError);

  // Fresh salt and nonce: nothing carried over
  assert.notEqual(newVault.salt, oldVault.salt);
  assert.notEqual(newVault.nonce, oldVault.nonce);
  assert.notEqual(newVault.scrambledKey, oldVault.scrambledKey);
});

test('an old fingerprint copy (old scrambling key) cannot open the new vault', async () => {
  useEngineForTests(null);
  const { privateKey, address } = walletFromPhrase(PUBLIC_TEST_PHRASE);
  const oldVault = await lockKey(privateKey, 'old password one', address, QUICK);
  const oldCopy = await scramblingKeyFromPassword(oldVault, 'old password one');
  const newVault = await lockKey(privateKey, 'new password two', address, QUICK);
  assert.throws(() => openVault(newVault, oldCopy), WrongPasswordError);
});
