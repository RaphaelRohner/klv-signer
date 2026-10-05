/*
 * transaction.test.js — automatic checks for reading and signing transactions
 * ===========================================================================
 *
 * The two sample transactions below were prepared by Klever's testnet node
 * (then given the public test wallet as sender) and their fingerprints
 * (hashes) were confirmed by the node's own "decode" service on 29 Sep 2026.
 * So these tests check the Signer against Klever's real network, not just
 * against itself.
 *
 * Run with `npm test` from the `app` folder.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifySignatureSync, getPublicKeyFromPrivateSync } from '@klever/connect-crypto';

import { readTransaction, ReadProblem } from '../src/klever/readTransaction.js';
import { signTransaction } from '../src/klever/signTransaction.js';
import { decodeMessage, encodeMessage, bytesToHex, hexToBytes, writeVarint } from '../src/klever/protobuf.js';
import { UnsignedTransactionSchema, TransferContractSchema } from '../src/klever/schema.js';
import { formatUnits, describeAmount, describeNote } from '../src/klever/format.js';
import { walletFromPhrase } from '../src/crypto/wallet.js';
import { NETWORK } from '../src/config.js';

// The famous PUBLIC test phrase (never holds anything of value).
const PUBLIC_TEST_PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const ME = 'klv1usdnywjhrlv4tcyu6stxpl6yvhplg35nepljlt4y5r7yppe8er4qujlazy';
const OTHER = 'klv1hn2y5h4v2ag5rqw7v0fxs5jcq9q5kthyxzzk9fkrjep8enym3qps5sd8te';

// Sample 1: send 1.5 KLV from ME to OTHER on testnet (nonce 7, fees 1 + 250 units).
const KLV_TX = '0a890108071220e41b323a571fd955e09cd41660ff4465c3f44693c87f2faea4a0fc408727c8ea325612540a2a747970652e676f6f676c65617069732e636f6d2f70726f746f2e5472616e73666572436f6e747261637412260a20bcd44a5eac57514181de63d268525801414b2ee4308562a6c396427ccc9b880318e0c65b680170fa017801820103313039';
const KLV_TX_NODE_HASH = 'ae154d95cf7e8047064da26c86f9c741846916b4d6c9be72938cbe9aed835892';

// Sample 2: send NFT DVKNFT-1SW5 #4821 from ME to OTHER on testnet.
const NFT_TX = '0a990108071220e41b323a571fd955e09cd41660ff4465c3f44693c87f2faea4a0fc408727c8ea326612640a2a747970652e676f6f676c65617069732e636f6d2f70726f746f2e5472616e73666572436f6e747261637412360a20bcd44a5eac57514181de63d268525801414b2ee4308562a6c396427ccc9b8803121044564b4e46542d315357352f343832311801680170fa017801820103313039';
const NFT_TX_NODE_HASH = 'fe97bf59dd64dd3a9f62a71838d3c81f65df8b001c75da8d153b927f7d7eda66';

const EXPECT = { network: 'testnet', walletAddress: ME };

/** Reads a sample into an editable object, lets `change` edit it, writes it back (standard form). */
function modified(hex, change) {
  const tx = decodeMessage(hexToBytes(hex), UnsignedTransactionSchema);
  change(tx.RawData);
  return bytesToHex(encodeMessage(tx, UnsignedTransactionSchema));
}

/** Same, but edits the (first) transfer inside. */
function modifiedTransfer(hex, change) {
  return modified(hex, (raw) => {
    const t = decodeMessage(raw.Contract[0].Parameter.Value, TransferContractSchema);
    change(t);
    raw.Contract[0].Parameter.Value = encodeMessage(t, TransferContractSchema);
  });
}

/** Wraps raw RawData bytes into the outer package: field 1, its length, the bytes. */
function wrapRaw(rawBytes) {
  return bytesToHex(Uint8Array.from([0x0a, ...writeVarint(BigInt(rawBytes.length)), ...rawBytes]));
}

/** Asserts that reading refuses, with a message matching `pattern`. */
function refuses(hex, pattern, expect = EXPECT) {
  assert.throws(() => readTransaction(hex, expect), (e) => e instanceof ReadProblem && pattern.test(e.message));
}

// --- Reading the samples -------------------------------------------------------

test('the KLV sample reads correctly and has the same fingerprint as the Klever node', () => {
  const r = readTransaction(KLV_TX, EXPECT);
  assert.equal(r.network, 'testnet');
  assert.equal(r.sender, ME);
  assert.equal(r.nonce, 7n);
  assert.equal(r.fee, '0.000251 KLV');
  assert.equal(r.transfers.length, 1);
  assert.equal(r.transfers[0].to, OTHER);
  assert.equal(r.transfers[0].text, '1.5 KLV');
  assert.equal(r.hashHex, KLV_TX_NODE_HASH);
  assert.equal(bytesToHex(r.unsignedBytes), KLV_TX);
});

test('the NFT sample reads as NFT DVKNFT-1SW5 #4821, fingerprint matches the node', () => {
  const r = readTransaction(NFT_TX, EXPECT);
  assert.equal(r.transfers[0].assetId, 'DVKNFT-1SW5/4821');
  assert.equal(r.transfers[0].text, 'NFT DVKNFT-1SW5 #4821');
  assert.equal(r.transfers[0].isNft, true);
  assert.equal(r.hashHex, NFT_TX_NODE_HASH);
});

test('spaces, capitals and a 0x prefix around the code are tolerated', () => {
  const r = readTransaction(`  0x${KLV_TX.toUpperCase()} \n`, EXPECT);
  assert.equal(r.hashHex, KLV_TX_NODE_HASH);
});

// --- Signing -------------------------------------------------------------------

test('signing gives a valid signature for the fingerprint, and a correctly built signed transaction', () => {
  const { privateKey } = walletFromPhrase(PUBLIC_TEST_PHRASE);
  const r = readTransaction(KLV_TX, EXPECT);
  const out = signTransaction(r, privateKey);
  assert.equal(out.signatureHex.length, 128);
  const ok = verifySignatureSync(r.hash, hexToBytes(out.signatureHex), getPublicKeyFromPrivateSync(privateKey));
  assert.equal(ok, true);
  assert.equal(out.signedTransactionHex, `${KLV_TX}1240${out.signatureHex}`);
});

test('signing the same transaction twice gives the same signature (Ed25519 is deterministic)', () => {
  const { privateKey } = walletFromPhrase(PUBLIC_TEST_PHRASE);
  const r = readTransaction(NFT_TX, EXPECT);
  assert.equal(signTransaction(r, privateKey).signatureHex, signTransaction(r, privateKey).signatureHex);
});

test('signing with a different wallet than the sender is refused', () => {
  const other = walletFromPhrase('legal winner thank year wave sausage worth useful legal winner thank yellow');
  const r = readTransaction(KLV_TX, EXPECT);
  assert.throws(() => signTransaction(r, other.privateKey), /not the sender/);
});

// --- Refusals: wrong context -----------------------------------------------------

test('a transaction for another network is refused', () => {
  refuses(KLV_TX, /Testnet.*but the Signer is set to the Mainnet/, { network: 'mainnet', walletAddress: ME });
  refuses(modified(KLV_TX, (raw) => { raw.ChainID = new TextEncoder().encode('108'); }), /Mainnet.*set to the Testnet/);
  refuses(modified(KLV_TX, (raw) => { raw.ChainID = new TextEncoder().encode('999'); }), /unknown Klever network/);
});

test('a transaction from another wallet is refused', () => {
  refuses(KLV_TX, /not from the wallet in this Signer/, { network: 'testnet', walletAddress: OTHER });
});

// --- Refusals: things the Signer can't explain -------------------------------------

test('an already signed transaction is refused (the package may only contain the unsigned part)', () => {
  refuses(`${KLV_TX}1240${'ab'.repeat(64)}`, /doesn't know/);
});

test('an unknown extra part anywhere is refused', () => {
  // Add field 20 (unknown) = 1 to the end of RawData.
  const tx = decodeMessage(hexToBytes(KLV_TX), UnsignedTransactionSchema);
  const raw = encodeMessage(tx.RawData, UnsignedTransactionSchema.fields[1].schema);
  refuses(wrapRaw(Uint8Array.from([...raw, 0xa0, 0x01, 0x01])), /field 20.*doesn't know/);
});

test('non-transfer instructions, royalties, multi-signature and token fees are refused', () => {
  refuses(modified(KLV_TX, (raw) => { raw.Contract[0].Type = 4n; }), /type 4.*only signs transfers/);
  refuses(modifiedTransfer(KLV_TX, (t) => { t.KDARoyalties = 5n; }), /royalty/);
  refuses(modifiedTransfer(KLV_TX, (t) => { t.KLVRoyalties = 5n; }), /royalty/);
  refuses(modified(KLV_TX, (raw) => { raw.PermissionID = 1n; }), /special signing permission/);
  refuses(modified(KLV_TX, (raw) => { raw.KDAFee = { KDA: new TextEncoder().encode('USDT-A1B2'), Amount: 5n }; }), /fee in a token/);
  refuses(modified(KLV_TX, (raw) => { raw.Contract[0].Parameter.TypeUrl = 'type.googleapis.com/proto.FreezeContract'; }), /doesn't contain one/);
});

test('zero or negative amounts, odd token names and a wrong version are refused', () => {
  refuses(modifiedTransfer(KLV_TX, (t) => { t.Amount = 0n; }), /zero or less/);
  refuses(modifiedTransfer(KLV_TX, (t) => { t.Amount = -5n; }), /zero or less/);
  refuses(modifiedTransfer(KLV_TX, (t) => { t.AssetID = new TextEncoder().encode('klv<script>'); }), /unusual token name/);
  refuses(modified(KLV_TX, (raw) => { raw.Version = 2n; }), /version 2/);
  refuses(modified(KLV_TX, (raw) => { raw.Contract = []; }), /no instructions/);
});

test('data not written the standard way is refused', () => {
  // Nonce written explicitly as 0 ("08 00"): the standard form leaves zero values out.
  const tx = decodeMessage(hexToBytes(KLV_TX), UnsignedTransactionSchema);
  tx.RawData.Nonce = 0n;
  const raw = encodeMessage(tx.RawData, UnsignedTransactionSchema.fields[1].schema);
  refuses(wrapRaw(Uint8Array.from([0x08, 0x00, ...raw])), /standard way/);
  // Two fields swapped (Sender before Nonce). Same length, so the outer header stays "0a 89 01".
  const rawHex = KLV_TX.slice(6);             // skip the outer header
  const nonce = rawHex.slice(0, 4);           // "08 07"
  const sender = rawHex.slice(4, 4 + 68);     // "12 20" + 32 bytes
  const rest = rawHex.slice(4 + 68);
  refuses(`0a8901${sender}${nonce}${rest}`, /standard order/);
});

test('broken input gets a friendly explanation', () => {
  refuses('', /Nothing was pasted/);
  refuses('hello', /only contain the characters/);
  refuses('abc', /odd number/);
  refuses(KLV_TX.slice(0, 100), /ends/);
});

// --- Plain-words formatting ------------------------------------------------------------

test('amounts are shown in plain words without rounding', () => {
  assert.equal(formatUnits(1500000n, 6), '1.5');
  assert.equal(formatUnits(1n, 6), '0.000001');
  assert.equal(formatUnits(1234567000000n, 6), '1234567'); // no thousands separators
  assert.equal(formatUnits(9007199254740993123n, 6), '9007199254740.993123'); // beyond normal JS number precision
  assert.equal(describeAmount(1n, 'DVKNFT-1SW5/4821').text, 'NFT DVKNFT-1SW5 #4821');
  const token = describeAmount(250n, 'ABC-1234');
  assert.equal(token.text, '250 units of ABC-1234');
  assert.match(token.note, /decimal places/);
  assert.match(token.note, /A 3-digit number/);
  assert.match(token.note, /royalty/); // third review, T2
  assert.match(describeAmount(1n, 'DVKNFT-1SW5/4821').note, /royalty/);
  assert.equal(describeAmount(1500000n, 'KLV').note, null); // KLV itself: no royalty note
  assert.match(describeAmount(10n ** 18n, 'USDT-ABCD').note, /A 19-digit number/);
  assert.match(describeAmount(5n, 'KLV-AB12').note, /NOT KLV/); // look-alike ticker (T9)
  assert.doesNotMatch(describeAmount(5n, 'ABC-1234').note, /NOT KLV/);
});

test('notes are shown as text only if they are plain readable text', () => {
  assert.deepEqual(describeNote(new TextEncoder().encode('Thanks for the Devikin!')), { text: 'Thanks for the Devikin!', readable: true });
  assert.equal(describeNote(new TextEncoder().encode('hidden\u202etext')).readable, false);
  assert.equal(describeNote(Uint8Array.from([0xff, 0xfe])).readable, false);
});

test('a readable note attached to a transaction is shown', () => {
  const hex = modified(KLV_TX, (raw) => { raw.Data = [new TextEncoder().encode('order 42')]; });
  const r = readTransaction(hex, EXPECT);
  assert.equal(r.notes[0].text, 'order 42');
  assert.notEqual(r.hashHex, KLV_TX_NODE_HASH); // the note is part of what gets signed
});

// ---- Second review (1 Oct 2026): attacks found by fuzzing --------------------

const enc = (s) => new TextEncoder().encode(s);

test('an invisible "byte order mark" in front of a token name is refused (not shown as KLV)', () => {
  // From the reviewer: AssetID = EF BB BF "KLV" was shown as "1.5 KLV".
  const bomKlv = '0a910108071220e41b323a571fd955e09cd41660ff4465c3f44693c87f2faea4a0fc408727c8ea325e125c0a2a747970652e676f6f676c65617069732e636f6d2f70726f746f2e5472616e73666572436f6e7472616374122e0a20bcd44a5eac57514181de63d268525801414b2ee4308562a6c396427ccc9b88031206efbbbf4b4c5618e0c65b680170fa017801820103313039';
  assert.throws(() => readTransaction(bomKlv, EXPECT), /unusual token name/);
});

test('an invisible character in the network ID is refused', () => {
  const bomChain = '0a8c0108071220e41b323a571fd955e09cd41660ff4465c3f44693c87f2faea4a0fc408727c8ea325612540a2a747970652e676f6f676c65617069732e636f6d2f70726f746f2e5472616e73666572436f6e747261637412260a20bcd44a5eac57514181de63d268525801414b2ee4308562a6c396427ccc9b880318e0c65b680170fa017801820106efbbbf313039';
  assert.throws(() => readTransaction(bomChain, EXPECT), /unusual network ID/);
});

test('token names must follow Klever\'s format', () => {
  const withAsset = (name) => modifiedTransfer(KLV_TX, (t) => { t.AssetID = enc(name); });
  for (const bad of ['KLV/1', 'KFI/7', 'DVKNFT-1SW5/0004821', 'KLV-XX', 'AB-1234', 'TOOLONGTICKER-1234', 'abc-1234', 'ABC_1234']) {
    assert.throws(() => readTransaction(withAsset(bad), EXPECT), /unusual token name/, bad);
  }
  for (const good of ['KLV', 'KFI', 'ABC-1234', 'DVKNFT-1SW5/4821', 'KLVX-AB12']) {
    assert.equal(readTransaction(withAsset(good), EXPECT).transfers[0].assetId, good);
  }
});

test('a huge network fee is refused', () => {
  assert.throws(() => readTransaction(modified(KLV_TX, (raw) => { raw.KAppFee = 1000000000000000n; }), EXPECT), /unusually high network fee/);
  assert.equal(readTransaction(modified(KLV_TX, (raw) => { raw.KAppFee = 2000000n; }), EXPECT).fee, '2.00025 KLV');
});

test('more than 5 notes are refused', () => {
  assert.throws(() => readTransaction(modified(KLV_TX, (raw) => { raw.Data = Array.from({ length: 6 }, () => enc('hi')); }), EXPECT), /attached notes/);
  assert.equal(readTransaction(modified(KLV_TX, (raw) => { raw.Data = [enc('hi'), enc('there')]; }), EXPECT).notes.length, 2);
});

test('notes that could fake or hide screen content are not shown as text', () => {
  const shown = (s) => describeNote(enc(s)).readable;
  assert.equal(shown('Thanks for the Devikin! 🙂 Grüße, ¿qué tal? 5% off'), true);
  for (const bad of [
    'line\nbreak', 'tab\there', 'soft­hyphen', 'zero​width', 'rtl‮override', 'line sep',
    'bom﻿inside', 'word⁠joiner', 'arabic؜mark', 'fillerㅤhere', 'tag\u{E0041}char',
    `a${'́'.repeat(5)}`, 'x'.repeat(257), 'wide　space',
  ]) {
    assert.equal(shown(bad), false, JSON.stringify(bad));
  }
  assert.match(describeNote(enc('a\nb')).text, /can't show as text \(3 bytes\)/);
});

test('an oversized input is refused before it is even converted', () => {
  assert.throws(() => readTransaction('00'.repeat(40000), EXPECT), /far too large/);
});

// --- The shipped setting ---------------------------------------------------------

test('the Signer is set to TESTNET, and with that setting a mainnet transaction is refused (third review, T7)', () => {
  // Switching to mainnet is a deliberate decision (HOW-IT-WORKS, SECURITY.md):
  // whoever makes it has to change this test too, on purpose.
  assert.equal(NETWORK, 'testnet');
  refuses(modified(KLV_TX, (raw) => { raw.ChainID = new TextEncoder().encode('108'); }), /Mainnet/, { network: NETWORK, walletAddress: ME });
  assert.equal(readTransaction(KLV_TX, { network: NETWORK, walletAddress: ME }).transfers.length, 1);
});
