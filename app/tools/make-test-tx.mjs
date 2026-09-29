/*
 * make-test-tx.mjs — prepares a TESTNET transaction for trying out the Signer
 * ===========================================================================
 *
 * Runs on your Mac (not on the phone). It:
 *   1. asks Klever's testnet node to prepare an unsigned transfer from your
 *      test wallet (the node fills in the transaction number and fees),
 *   2. reads it back with the Signer's own reader and shows it in plain words,
 *      so you can compare with what the Signer shows on the phone,
 *   3. prints the transaction code, and, if your phone is connected by USB
 *      with USB debugging on, offers to type the code straight into the
 *      Signer's text box for you.
 *
 * It never sees or needs any key. It's testnet only, on purpose.
 *
 * HOW TO RUN (from the `app` folder):
 *   npm run make-test-tx -- --from klv1… --to klv1… --amount 0.5
 *   npm run make-test-tx -- --from klv1… --to klv1… --nft DVKNFT-1SW5/4821
 *   npm run make-test-tx -- --from klv1… --to klv1… --amount 10 --token ABC-1234 (amount in smallest units)
 * (The `--` after the script name passes the rest on to the script.)
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { KleverProvider } from '@klever/connect-provider';
import { TransactionBuilder } from '@klever/connect-transactions';
import { readTransaction } from '../src/klever/readTransaction.js';

// ---- 1. Read the options ------------------------------------------------------
function option(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}
const from = option('from');
const to = option('to');
const amountText = option('amount');
const token = option('token');
const nft = option('nft');

function stop(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

if (!from || !to || (!amountText && !nft)) {
  stop('Usage:\n'
    + '  npm run make-test-tx -- --from <your test address> --to <receiver> --amount <KLV>\n'
    + '  npm run make-test-tx -- --from <your test address> --to <receiver> --nft <COLLECTION/NUMBER>\n'
    + '  npm run make-test-tx -- --from <…> --to <…> --amount <smallest units> --token <TOKEN-ID>');
}

/** "1.5" KLV → "1500000" (KLV has 6 decimal places). Exact, no rounding. */
function klvToUnits(text) {
  if (!/^\d+(\.\d{1,6})?$/.test(text)) stop(`"${text}" is not a valid KLV amount (use e.g. 0.5 or 12.345678).`);
  const [whole, fraction = ''] = text.split('.');
  return (BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'))).toString();
}

let transfer;
if (nft) transfer = { receiver: to, amount: '1', kda: nft };
else if (token) {
  if (!/^\d+$/.test(amountText)) stop('With --token, give the amount in the token\'s smallest units (a whole number).');
  transfer = { receiver: to, amount: amountText, kda: token };
} else transfer = { receiver: to, amount: klvToUnits(amountText) };

// ---- 2. Ask the testnet node to prepare the transaction ---------------------------
console.log('\nAsking the Klever TESTNET node to prepare the transaction…');
let tx;
try {
  tx = await new TransactionBuilder(new KleverProvider('testnet')).sender(from).transfer(transfer).build();
} catch (error) {
  const hint = /account/i.test(error.message)
    ? '\n  Hint: the sending wallet may not exist on testnet yet. Get free test KLV from the faucet first (see TESTING.md).'
    : '';
  stop(`The node couldn't prepare it: ${error.message}${hint}`);
}
const hex = tx.toHex();

// ---- 3. Read it back with the Signer's own reader ----------------------------------
let reading;
try {
  reading = readTransaction(hex, { network: 'testnet', walletAddress: from });
} catch (error) {
  stop(`The Signer's reader would refuse this transaction: ${error.message}`);
}
console.log('\nThe Signer should show:');
for (const t of reading.transfers) console.log(`  Send       ${t.text}\n  To         ${t.to}`);
console.log(`  Fee        ${reading.fee}`);
console.log(`  Tx number  ${reading.nonce}`);
console.log(`  Fingerprint ${reading.hashHex}`);
console.log(`\nUnsigned transaction code (${hex.length} characters):\n\n${hex}\n`);

// ---- 4. Offer to type it into the phone -----------------------------------------------
const adbCandidates = [`${homedir()}/Library/Android/sdk/platform-tools/adb`, 'adb'];
const adb = adbCandidates.find((p) => p === 'adb' || existsSync(p));
let phoneConnected = false;
try {
  const devices = execFileSync(adb, ['devices'], { encoding: 'utf8' });
  phoneConnected = devices.split('\n').slice(1).some((line) => /\tdevice$/.test(line.trim()) || /\sdevice$/.test(line));
} catch {
  phoneConnected = false;
}

if (!phoneConnected) {
  console.log('No phone found over USB. Copy the code above to your phone another way (e.g. email it to yourself).\n');
  process.exit(0);
}

const ask = createInterface({ input: process.stdin, output: process.stdout });
await ask.question('Phone found. In the Signer, open "Sign a test transaction" and tap the text box.\nThen press Enter here to type the code into it (or Ctrl+C to skip)… ');
ask.close();
// The code only contains 0-9 and a-f, so it's safe to type as-is.
execFileSync(adb, ['shell', 'input', 'text', hex]);
console.log('Typed. Now tap "Read transaction" in the Signer.\n');
