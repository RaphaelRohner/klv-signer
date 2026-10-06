/**
 * kleverTx.js
 *
 * Preparing and sending Klever transactions - the two jobs that are the
 * app's side of signing (the KLV Signer app does the signing itself, see
 * klvSigner.js). TESTNET ONLY for now: the KLV Signer refuses real-network
 * transactions until it has been reviewed further, so everything here is
 * pinned to Klever's practice network, where coins have no real value.
 *
 *   buildTransfer(...)       asks a Klever testnet node to prepare an
 *                            unsigned transfer (it fills in the transaction
 *                            number and fees) - returns it as hex
 *   broadcastSigned(hex)     sends a signed transaction to the testnet,
 *                            returns its hash
 *   checkPrepared(hex, ...)  reads the prepared transfer back and makes sure
 *                            it is exactly what the user typed (see below)
 *   getKlvBalance(address)   the address's testnet KLV balance
 *   explorerUrl(hash)        link to see the transaction on testnet Kleverscan
 *
 * Uses Klever's own JavaScript SDK (@klever/connect-provider and
 * @klever/connect-transactions, pinned to exact versions). One quirk
 * found while building the Signer: in connect-provider 0.2.2, sending a
 * signed transaction as a hex string doesn't work (the node answers "nil
 * transaction"), so broadcastSigned() hands it over in JSON form instead.
 */

import { KleverProvider } from '@klever/connect-provider';
import { TransactionBuilder, Transaction } from '@klever/connect-transactions';

export const SIGNER_NETWORK = 'testnet';
const TESTNET_API = 'https://api.testnet.klever.org/v1.0';

let provider = null;
function getProvider() {
  if (!provider) provider = new KleverProvider(SIGNER_NETWORK);
  return provider;
}

/**
 * klvToUnits - "1.5" KLV -> "1500000" (KLV has 6 decimal places). Exact
 * string maths, no rounding. Throws on anything that isn't a plain amount.
 */
export function klvToUnits(text) {
  const clean = String(text || '').trim().replace(',', '.');
  if (!/^\d+(\.\d{1,6})?$/.test(clean)) {
    throw new Error('Please enter an amount like 0.5 or 12.345678 (at most 6 decimals).');
  }
  const [whole, fraction = ''] = clean.split('.');
  const units = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
  if (units <= 0n) throw new Error('The amount must be more than 0.');
  return units.toString();
}

/** unitsToKlv - 1500000 -> "1.5". */
export function unitsToKlv(units) {
  const value = BigInt(units);
  const whole = value / 1000000n;
  const fraction = (value % 1000000n).toString().padStart(6, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}

/**
 * buildTransfer - prepares an unsigned testnet transfer.
 *   sender:      the Signer's wallet address (from getSignerAddress)
 *   receiver:    klv1... address
 *   amountUnits: amount in the token's smallest units, as a string
 *   kda:         optional token id (e.g. "ABC-1234") or NFT ("COLLECTION/NUMBER");
 *                leave empty for KLV
 * Returns the unsigned transaction as hex, ready for signWithSigner().
 * Before returning, it checks the node prepared exactly this transfer.
 */
export async function buildTransfer({ sender, receiver, amountUnits, kda }) {
  const transfer = { receiver, amount: amountUnits };
  if (kda) transfer.kda = kda;
  const tx = await new TransactionBuilder(getProvider()).sender(sender).transfer(transfer).build();
  const hex = tx.toHex();
  checkPrepared(hex, { sender, receiver, amountUnits, kda }); // the node must not change anything
  return hex;
}

// --- Checking what the node prepared ----------------------------------------
//
// The testnet node prepares the transfer, so a broken or hostile node could
// slip in a different receiver or amount. The Signer shows the real content
// before anyone approves, but a careful app checks too, before even asking
// (weekly check, 6 Oct 2026). Klever's own decoder misreads transfers in
// connect-encoding 0.1.3, so this is a tiny reader of just the fields needed.
//
// Layout (protobuf; "field n" = numbered part):
//   Transaction  field 1 = RawData
//   RawData      field 2 = sender (32 bytes), field 6 = contracts (repeated)
//   Contract     field 1 = type (0 or missing = transfer), field 2 = parameter
//   Parameter    field 1 = type name, field 2 = TransferContract
//   Transfer     field 1 = receiver (32 bytes), field 2 = token id
//                (missing = KLV), field 3 = amount (smallest units)

function hexToBytes(hex) {
  if (!/^([0-9a-f]{2})+$/i.test(hex)) throw new Error('The prepared transfer is not valid hex.');
  return Uint8Array.from(hex.match(/../g), (h) => parseInt(h, 16));
}

/** All fields of one protobuf message: { number: [value, …] }. Values are bytes or BigInt. */
function readFields(bytes) {
  const fields = {};
  let i = 0;
  const varint = () => {
    let result = 0n;
    for (let shift = 0n; ; shift += 7n) {
      if (i >= bytes.length || shift > 63n) throw new Error('The prepared transfer is damaged.');
      const b = bytes[i++];
      result |= BigInt(b & 0x7f) << shift;
      if (!(b & 0x80)) return result;
    }
  };
  while (i < bytes.length) {
    const key = varint();
    const number = Number(key >> 3n);
    const wire = Number(key & 7n);
    let value;
    if (wire === 0) value = varint();
    else if (wire === 2) {
      const len = Number(varint());
      if (i + len > bytes.length) throw new Error('The prepared transfer is damaged.');
      value = bytes.slice(i, i + len);
      i += len;
    } else throw new Error('The prepared transfer has an unexpected layout.');
    (fields[number] = fields[number] || []).push(value);
  }
  return fields;
}

/** Bytes → text, for the plain-ASCII names used here (token ids, type names). */
const ascii = (bytes) => String.fromCharCode(...bytes);

const one = (fields, n) => (fields[n] && fields[n].length === 1 ? fields[n][0] : undefined);

// Bech32 (BIP-173): turns 32 public-key bytes into a klv1… address.
const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function polymod(values) {
  const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let k = 0; k < 5; k += 1) if ((top >> k) & 1) chk ^= G[k];
  }
  return chk;
}
function toAddress(bytes) {
  const words = [];
  let acc = 0;
  let bits = 0;
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) { bits -= 5; words.push((acc >> bits) & 31); }
  }
  if (bits > 0) words.push((acc << (5 - bits)) & 31);
  const hrp = [...'klv'].map((c) => c.charCodeAt(0));
  const expanded = [...hrp.map((c) => c >> 5), 0, ...hrp.map((c) => c & 31)];
  const mod = polymod([...expanded, ...words, 0, 0, 0, 0, 0, 0]) ^ 1;
  const checksum = [0, 1, 2, 3, 4, 5].map((k) => (mod >> (5 * (5 - k))) & 31);
  return `klv1${[...words, ...checksum].map((w) => CHARSET[w]).join('')}`;
}

/**
 * readTransfer - what a prepared single transfer really does:
 * { sender, receiver, tokenId, amountUnits }. Throws if it is anything else
 * (several contracts, another kind of contract, a damaged layout).
 */
export function readTransfer(unsignedHex) {
  const raw = one(readFields(hexToBytes(unsignedHex)), 1);
  if (!(raw instanceof Uint8Array)) throw new Error('The prepared transfer has no content.');
  const rawData = readFields(raw);
  const sender = one(rawData, 2);
  if (!rawData[6] || rawData[6].length !== 1) throw new Error('The prepared transaction does more than one thing.');
  const contract = readFields(rawData[6][0]);
  const type = one(contract, 1);
  if (type !== undefined && type !== 0n) throw new Error('The prepared transaction is not a transfer.');
  const parameter = readFields(one(contract, 2) || new Uint8Array());
  const typeName = ascii(one(parameter, 1) || new Uint8Array());
  if (!typeName.endsWith('proto.TransferContract')) throw new Error('The prepared transaction is not a transfer.');
  const transfer = readFields(one(parameter, 2) || new Uint8Array());
  const receiver = one(transfer, 1);
  const token = one(transfer, 2);
  const amount = one(transfer, 3);
  if (!(sender instanceof Uint8Array) || sender.length !== 32 || !(receiver instanceof Uint8Array) || receiver.length !== 32 || typeof amount !== 'bigint') {
    throw new Error('The prepared transfer is missing its sender, receiver or amount.');
  }
  return {
    sender: toAddress(sender),
    receiver: toAddress(receiver),
    tokenId: token ? ascii(token) : 'KLV',
    amountUnits: amount.toString(),
  };
}

/**
 * checkPrepared - throws unless the prepared transfer sends exactly
 * `amountUnits` of `kda` (KLV if empty) from `sender` to `receiver`.
 */
export function checkPrepared(unsignedHex, { sender, receiver, amountUnits, kda }) {
  const t = readTransfer(unsignedHex);
  const same = t.sender === sender && t.receiver === receiver
    && t.tokenId === (kda || 'KLV') && t.amountUnits === String(amountUnits);
  if (!same) {
    throw new Error('The testnet node prepared a different transfer than the one you typed, so it was not sent to the Signer. Nothing was signed.');
  }
}

/** broadcastSigned - sends a signed transaction (hex) to the testnet. Returns its hash. */
export async function broadcastSigned(signedHex) {
  const json = JSON.stringify(Transaction.fromHex(signedHex).toJSON());
  return getProvider().sendRawTransaction(json);
}

/** getKlvBalance - the address's KLV balance on testnet, in smallest units (0 if the account doesn't exist yet). */
export async function getKlvBalance(address) {
  const response = await fetch(`${TESTNET_API}/address/${address}`);
  const body = await response.json();
  return BigInt(body?.data?.account?.balance ?? 0);
}

/** explorerUrl - where to see a testnet transaction. */
export function explorerUrl(hash) {
  return `https://testnet.kleverscan.org/transaction/${hash}`;
}
