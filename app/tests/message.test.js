/*
 * message.test.js — signing a text (SIGN_MESSAGE, added 25 Oct 2026)
 * Run with `npm test` from the `app` folder.
 *
 * Checks that:
 *   - the Signer signs exactly like the Klever extension (Klever's message
 *     format), so e.g. the Devikins Legacy Hub's chat accepts it;
 *   - a text that could hide or rearrange what you read is refused;
 *   - a message signature can't pass as a transaction signature;
 *   - requests and answers have the right shape, and the Kotlin side knows
 *     the new request type.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  generateKeyPairSync, PublicKeyImpl, prepareKlvMessage, signMessageSync, verifySignatureSync, verifyWalletSignedMessage,
} from '@klever/connect-crypto';
import { blake2b } from '@noble/hashes/blake2.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { checkMessageText, signWalletMessage, MESSAGE_MAX_CHARS, MESSAGE_MAX_LINES } from '../src/klever/signMessage.js';
import { ACTIONS, ERRORS, checkRequest, messageSignedReply, PROTOCOL_VERSION } from '../src/requests/protocol.js';

const ch = (cp) => String.fromCodePoint(cp);
const hexToBytes = (h) => Uint8Array.from(h.match(/../g), (x) => parseInt(x, 16));

function wallet() {
  const { privateKey, publicKey } = generateKeyPairSync();
  return { privateKey: privateKey.bytes ?? privateKey, publicKey: publicKey.bytes ?? publicKey };
}
const addressOf = (publicKey) => new PublicKeyImpl(publicKey).toAddress();

// The Devikins Legacy Hub's chat sign-in text (its postman, kleverProof.js signInText).
const HUB_SIGN_IN = [
  'Devikins Legacy Hub ' + ch(0x2013) + ' chat sign-in',
  'Postman: devi-postman-test.raphaelrohner.workers.dev',
  '',
  'This is NOT a transaction. It costs nothing and moves nothing.',
  '',
  'It shows that this wallet holds Devikins, for this chat key:',
  'a'.repeat(64),
  '',
  'One-time code: ' + 'b'.repeat(64),
  'Valid until: 2026-10-25T18:00:00Z',
].join('\n');

test('signs like the Klever extension: the chat\'s check accepts it', async () => {
  const w = wallet();
  const address = addressOf(w.publicKey);
  assert.equal(checkMessageText(HUB_SIGN_IN), null);
  const { signatureHex } = signWalletMessage(HUB_SIGN_IN, w.privateKey, address);
  assert.match(signatureHex, /^[0-9a-f]{128}$/);
  // Klever's own check (what the Hub's postman uses)
  assert.equal(await verifyWalletSignedMessage(HUB_SIGN_IN, hexToBytes(signatureHex), w.publicKey), true);
  // the same bytes the Klever extension's signMessage gives (Ed25519 is deterministic)
  const extension = [...signMessageSync(prepareKlvMessage(HUB_SIGN_IN), w.privateKey)].map((b) => b.toString(16).padStart(2, '0')).join('');
  assert.equal(signatureHex, extension);
  // a changed text doesn't match
  assert.equal(await verifyWalletSignedMessage(HUB_SIGN_IN + '!', hexToBytes(signatureHex), w.publicKey), false);
});

test('only the wallet\'s own key signs', () => {
  const w = wallet();
  const other = wallet();
  assert.throws(() => signWalletMessage('hello', w.privateKey, addressOf(other.publicKey)), /doesn't belong to this wallet/);
});

test('a message signature can\'t pass as a transaction signature', () => {
  // Even when the text is the hex of something that looks like a transaction,
  // what's signed is keccak-256 of the PREFIXED text, never blake2b-256 of the bytes.
  const w = wallet();
  const text = '0a20' + 'ab'.repeat(30);
  const { signatureHex } = signWalletMessage(text, w.privateKey, addressOf(w.publicKey));
  const asTransaction = blake2b(hexToBytes(text), { dkLen: 32 });
  assert.equal(verifySignatureSync(asTransaction, hexToBytes(signatureHex), w.publicKey), false);
  assert.equal(verifySignatureSync(blake2b(new TextEncoder().encode(text), { dkLen: 32 }), hexToBytes(signatureHex), w.publicKey), false);
});

test('texts that could hide or rearrange what you read are refused', () => {
  const ok = 'Sign in to the chat';
  assert.equal(checkMessageText(ok), null);
  assert.equal(checkMessageText('Line one\nLine two'), null);
  assert.equal(checkMessageText('Ümlaut, accents ' + ch(0xe9) + ', dashes ' + ch(0x2013) + ' and digits 123'), null);
  assert.match(checkMessageText(''), /no text/);
  assert.match(checkMessageText(undefined), /no text/);
  assert.match(checkMessageText('   \n  '), /empty/);
  assert.match(checkMessageText('x'.repeat(MESSAGE_MAX_CHARS + 1)), /longer than 2000/);
  assert.equal(checkMessageText('x'.repeat(MESSAGE_MAX_CHARS)), null);
  assert.match(checkMessageText(Array(MESSAGE_MAX_LINES + 1).fill('a').join('\n')), /more than 40 lines/);
  for (const cp of [
    0x200b, // zero-width space
    0x200d, // zero-width joiner
    0x202e, // right-to-left override
    0x2066, // left-to-right isolate
    0x200f, // right-to-left mark
    0xfeff, // byte order mark
    0x0009, // tab
    0x000d, // carriage return
    0x0000, // nothing
    0x2028, // line separator
    0x3164, // blank-looking letter
    0xfe0f, // variation selector
    0xe000, // private use
    0x20dd, // enclosing circle
    0xe0041, // tag letter
  ]) {
    assert.match(checkMessageText(`Send ${ch(cp)}100 KLV`) ?? '', /invisible or special/, `U+${cp.toString(16)}`);
  }
  // a lone half of an emoji (broken text)
  assert.match(checkMessageText('broken ' + String.fromCharCode(0xd83d)) ?? '', /invisible or special/);
  // mixed writing directions (Hebrew letters with Latin letters or digits)
  assert.match(checkMessageText(ch(0x05e9) + ch(0x05dc) + ch(0x05d5) + ch(0x05dd) + ' abc') ?? '', /right-to-left/);
  assert.equal(checkMessageText(ch(0x05e9) + ch(0x05dc) + ch(0x05d5) + ch(0x05dd)), null);
  // never signed, even if a screen forgot to check
  const w = wallet();
  assert.throws(() => signWalletMessage(`a${ch(0x202e)}b`, w.privateKey, addressOf(w.publicKey)), /invisible or special/);
});

test('hard-to-read texts are refused too (weekly check, 26 Oct 2026)', () => {
  // strike-through / overlay marks
  assert.match(checkMessageText('Send 1' + ch(0x0336) + '00 KLV') ?? '', /strike through or pile up/);
  assert.match(checkMessageText('a' + ch(0x20e5) + 'b') ?? '', /strike through or pile up/);
  // three or more marks piled on one letter
  assert.match(checkMessageText('e' + ch(0x0301) + ch(0x0302) + ch(0x0303)) ?? '', /strike through or pile up/);
  // one or two marks are normal (accents written as letter + mark)
  assert.equal(checkMessageText('Cafe' + ch(0x0301)), null);
  // spaces other than the normal one
  for (const cp of [0x00a0, 0x2003, 0x3000, 0x202f]) {
    assert.match(checkMessageText(`Pay${ch(cp)}now`) ?? '', /unusual spaces/, `U+${cp.toString(16)}`);
  }
  // empty lines: two in a row are fine, three push text out of sight
  assert.equal(checkMessageText('Top\n\n\nBottom'), null);
  assert.match(checkMessageText('Top\n\n\n\nBottom') ?? '', /more than two empty lines/);
  assert.match(checkMessageText('Top\n \n \n \nBottom') ?? '', /more than two empty lines/);
  // the Hub's real sign-in text still passes
  assert.equal(checkMessageText(HUB_SIGN_IN), null);
});

test('second-opinion review (26 Oct 2026): normal spaces pass, look-alike alphabets in one word are refused', () => {
  // ChatGPT thought the space rule refused normal spaces: it doesn't.
  for (const t of ['hello world', ' leading', 'trailing ', 'two  spaces', 'a b c']) assert.equal(checkMessageText(t), null, t);
  // "Devikins" with a Cyrillic e (U+0435) or a Greek omicron (U+03BF) in "Hub"... in "Login"
  assert.match(checkMessageText('Sign in to D' + ch(0x0435) + 'vikins') ?? '', /mixes Latin letters with Cyrillic or Greek/);
  assert.match(checkMessageText('L' + ch(0x03bf) + 'gin') ?? '', /mixes Latin letters with Cyrillic or Greek/);
  // whole words in Cyrillic or Greek next to Latin words are fine
  assert.equal(checkMessageText(ch(0x041f) + ch(0x0440) + ch(0x0438) + ch(0x0432) + ch(0x0435) + ch(0x0442) + ' Devikins'), null);
  assert.equal(checkMessageText(ch(0x03b1) + ch(0x03b2) + ch(0x03b3) + ' abc'), null);
});

test('Klever\'s message format, rebuilt by hand: prefix + length in BYTES + text, keccak-256', () => {
  // Independent of @klever/connect-crypto, so a change in that library would be noticed.
  const enc = new TextEncoder();
  for (const text of [HUB_SIGN_IN, 'abc', 'Gr' + ch(0xfc) + 'ezi', ch(0x05e9) + ch(0x05dc) + ch(0x05d5) + ch(0x05dd), ch(0x4f60) + ch(0x597d), 'x'.repeat(2000)]) {
    const bytes = enc.encode(text);
    // (the prefix starts with an invisible byte, 23 = 0x17)
    const expected = keccak_256(new Uint8Array([23, ...enc.encode('Klever Signed Message:\n'), ...enc.encode(String(bytes.length)), ...bytes]));
    assert.deepEqual([...prepareKlvMessage(text)], [...expected], text.slice(0, 20));
  }
  // the length is in bytes, not characters: "Grüezi" is 6 characters but 7 bytes
  assert.equal(enc.encode('Gr' + ch(0xfc) + 'ezi').length, 7);
});

test('SIGN_MESSAGE requests: the text is required and checked; the answer carries the signature', () => {
  const request = (extras) => ({ action: ACTIONS.SIGN_MESSAGE, extras: { protocolVersion: PROTOCOL_VERSION, ...extras } });
  assert.equal(checkRequest(request({ text: 'Sign in' })), null);
  assert.equal(checkRequest(request({})).code, ERRORS.INVALID_REQUEST);
  const hidden = checkRequest(request({ text: `a${ch(0x200b)}b` }));
  assert.equal(hidden.code, ERRORS.INVALID_REQUEST);
  assert.match(hidden.message, /invisible or special/);
  assert.deepEqual(
    messageSignedReply(request({ text: 'x', requestId: 'r-1' }), 'klv1abc', { signatureHex: 'ff' }),
    { status: 'ok', address: 'klv1abc', signature: 'ff', requestId: 'r-1' },
  );
});

test('the Android side knows SIGN_MESSAGE and its "text" value', () => {
  const dir = '../modules/klv-signer-requests/android/src/main/java/com/raphaelrohner/klvsigner/requests/';
  const kt = readFileSync(fileURLToPath(new URL(dir + 'SignerProtocol.kt', import.meta.url)), 'utf8');
  const activity = readFileSync(fileURLToPath(new URL(dir + 'SignRequestActivity.kt', import.meta.url)), 'utf8');
  assert.ok(kt.includes(`const val ACTION_SIGN_MESSAGE = "${ACTIONS.SIGN_MESSAGE}"`));
  assert.match(kt, /EXTRA_TEXT to \d+/);
  assert.ok(activity.includes('SignerProtocol.ACTION_SIGN_MESSAGE'));
});
