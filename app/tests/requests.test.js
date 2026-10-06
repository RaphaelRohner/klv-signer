/*
 * requests.test.js — automatic checks for requests from other apps
 * ================================================================
 *
 * Checks the rules in src/requests/ (protocol.js and appTrust.js): which
 * requests are accepted, what the answers look like, and how allowed apps
 * are recognised. Run with `npm test` from the `app` folder.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIONS, ERRORS, PROTOCOL_VERSION, addressReply, checkRequest, errorReply, signedReply,
} from '../src/requests/protocol.js';
import { cleanLabel, shortFingerprint, trustStatus, withApp, withoutApp } from '../src/requests/appTrust.js';

const HUB = 'com.raphaelrohner.devikinslegacyhub';
const CERT = 'a1'.repeat(32);

function request(action, extras = {}) {
  return {
    id: 'r1', action, callerPackage: HUB, callerLabel: 'DLH', callerCertSha256: CERT,
    extras: { protocolVersion: PROTOCOL_VERSION, ...extras },
  };
}

test('well-formed requests pass the first checks', () => {
  assert.equal(checkRequest(request(ACTIONS.GET_ADDRESS)), null);
  assert.equal(checkRequest(request(ACTIONS.SIGN_TRANSACTION, { transaction: '0a' })), null);
});

test('missing protocol version, missing transaction or unknown action are refused', () => {
  assert.equal(checkRequest({ ...request(ACTIONS.GET_ADDRESS), extras: {} }).code, ERRORS.UNSUPPORTED_PROTOCOL);
  assert.equal(checkRequest(request(ACTIONS.GET_ADDRESS, { protocolVersion: '2' })).code, ERRORS.UNSUPPORTED_PROTOCOL);
  assert.equal(checkRequest(request(ACTIONS.SIGN_TRANSACTION)).code, ERRORS.INVALID_REQUEST);
  assert.equal(checkRequest(request('something.else')).code, ERRORS.UNKNOWN_ACTION);
});

test('answers carry the right fields, and echo the app\'s own requestId', () => {
  const r = request(ACTIONS.GET_ADDRESS, { requestId: 'abc-123' });
  assert.deepEqual(addressReply(r, 'klv1xyz', 'testnet'), {
    status: 'ok', address: 'klv1xyz', network: 'testnet', chainId: '109', requestId: 'abc-123',
  });
  const reading = { network: 'testnet', hashHex: 'ff' };
  const signed = signedReply(request(ACTIONS.SIGN_TRANSACTION), 'klv1xyz', reading,
    { signatureHex: 'aa', signedTransactionHex: 'bb' });
  assert.deepEqual(signed, {
    status: 'ok', address: 'klv1xyz', network: 'testnet', transactionHash: 'ff', signature: 'aa', signedTransaction: 'bb',
  });
});

test('your decisions are "rejected", problems are "error"', () => {
  const r = request(ACTIONS.SIGN_TRANSACTION);
  assert.equal(errorReply(r, ERRORS.USER_REJECTED, 'no').status, 'rejected');
  assert.equal(errorReply(r, ERRORS.USER_LEFT, 'left').status, 'rejected');
  assert.equal(errorReply(r, ERRORS.NOT_ALLOWED, 'no').status, 'rejected');
  const e = errorReply(r, ERRORS.INVALID_TRANSACTION, 'bad');
  assert.deepEqual(e, { status: 'error', error: 'INVALID_TRANSACTION', message: 'bad' });
});

test('apps are recognised by package AND certificate', () => {
  const r = request(ACTIONS.GET_ADDRESS);
  assert.equal(trustStatus({}, r), 'unknown');
  const apps = withApp({}, r, 1000);
  assert.deepEqual(apps[HUB], { label: 'DLH', certSha256: CERT, allowedAt: 1000 });
  assert.equal(trustStatus(apps, r), 'allowed');
  // Same package, different developer certificate = not the same app.
  assert.equal(trustStatus(apps, { ...r, callerCertSha256: 'b2'.repeat(32) }), 'certChanged');
  assert.equal(trustStatus(apps, { ...r, callerCertSha256: null }), 'certChanged');
  assert.equal(trustStatus(withoutApp(apps, HUB), r), 'unknown');
});

test('certificate fingerprints are shortened for display', () => {
  assert.equal(shortFingerprint(CERT), 'a1a1a1a1…a1a1a1a1');
  assert.equal(shortFingerprint(null), 'unknown');
});

test('app names: blank-looking characters removed, mixed writing directions not shown (weekly check, 6 Oct 2026)', () => {
  assert.equal(cleanLabel('Devi͏kins️ Hub⠀'), 'Devikins Hub');
  assert.equal(cleanLabel('⠀￼͏'), '(no name)');
  assert.equal(cleanLabel('Hub שלום 2'), '(name in mixed writing directions: check the app id)');
  assert.equal(cleanLabel('שלום'), 'שלום');
  assert.equal(cleanLabel('Devikins Legacy Hub'), 'Devikins Legacy Hub');
});
