/*
 * send-signed-tx.mjs — checks a signed TESTNET transaction and sends it
 * =====================================================================
 *
 * Runs on your Mac. Give it the signed transaction code from the Signer's
 * "Signed ✓" screen (shared to your Mac, e.g. by email). It:
 *   1. checks the code is an unsigned transaction + exactly one signature,
 *   2. reads the transaction with the Signer's own reader and shows it,
 *   3. checks the signature really matches the transaction and the sender
 *      (so a broken signature is caught here, not by the network),
 *   4. sends it to Klever's TESTNET and prints a link to see it in the explorer.
 *
 * Testnet only, on purpose: it refuses mainnet transactions.
 *
 * HOW TO RUN (from the `app` folder):
 *   npm run send-signed-tx -- <signed transaction code>
 * or just `npm run send-signed-tx` and paste the code when asked.
 */

import { createInterface } from 'node:readline/promises';
import { KleverProvider } from '@klever/connect-provider';
import { Transaction } from '@klever/connect-transactions';
import { verifySignatureSync } from '@klever/connect-crypto';
import { hexToBytes, bytesToHex, decodeMessage } from '../src/klever/protobuf.js';
import { UnsignedTransactionSchema } from '../src/klever/schema.js';
import { readTransaction } from '../src/klever/readTransaction.js';
import { PublicKeyImpl } from '@klever/connect-crypto';

function stop(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

// ---- 1. Get the code ------------------------------------------------------------
let code = process.argv[2];
if (!code) {
  const ask = createInterface({ input: process.stdin, output: process.stdout });
  code = await ask.question('Paste the signed transaction code and press Enter:\n');
  ask.close();
}
code = code.trim().toLowerCase().replace(/^0x/, '');
let bytes;
try {
  bytes = hexToBytes(code);
} catch (error) {
  stop(error.message);
}

// A signed transaction from the Signer = the unsigned part + "12 40" + 64-byte signature.
if (bytes.length < 70 || bytes[bytes.length - 66] !== 0x12 || bytes[bytes.length - 65] !== 0x40) {
  stop('This doesn\'t look like a signed transaction from the Signer (the signature part is missing).');
}
const unsignedHex = bytesToHex(bytes.slice(0, bytes.length - 66));
const signature = bytes.slice(bytes.length - 64);

// ---- 2. Read the transaction --------------------------------------------------------
let sender;
try {
  const raw = decodeMessage(hexToBytes(unsignedHex), UnsignedTransactionSchema).RawData;
  sender = new PublicKeyImpl(raw.Sender).toAddress();
} catch (error) {
  stop(`Couldn't read the transaction: ${error.message}`);
}
let reading;
try {
  reading = readTransaction(unsignedHex, { network: 'testnet', walletAddress: sender });
} catch (error) {
  stop(`Not a valid testnet transaction: ${error.message}`);
}
console.log('\nTransaction:');
console.log(`  From       ${reading.sender}`);
for (const t of reading.transfers) console.log(`  Send       ${t.text}\n  To         ${t.to}`);
console.log(`  Fee        ${reading.fee}`);

// ---- 3. Check the signature -------------------------------------------------------------
const publicKey = decodeMessage(hexToBytes(unsignedHex), UnsignedTransactionSchema).RawData.Sender;
if (!verifySignatureSync(reading.hash, signature, publicKey)) {
  stop('The signature does NOT match this transaction and sender. Not sending it.');
}
console.log('  Signature  ✔ valid for this transaction and sender');

// ---- 4. Send it to the testnet ---------------------------------------------------------------
console.log('\nSending to the Klever TESTNET…');
try {
  // Klever's library needs the transaction in its JSON form to send it.
  const json = JSON.stringify(Transaction.fromHex(code).toJSON());
  const hash = await new KleverProvider('testnet').sendRawTransaction(json);
  console.log(`✔ Sent! Transaction fingerprint: ${hash}`);
  console.log(`  See it here (may take a few seconds to appear): https://testnet.kleverscan.org/transaction/${hash}\n`);
} catch (error) {
  stop(`The network refused it: ${error.message}`);
}
