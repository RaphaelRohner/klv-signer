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
 *   buildTransfers(...)      the same for up to 20 transfers in ONE
 *                            transaction (e.g. several NFTs at once), signed
 *                            with one approval
 *   broadcastSigned(hex)     sends a signed transaction to the testnet,
 *                            returns its hash
 *   checkPrepared(hex, ...)  reads the prepared transfer back and makes sure
 *                            sender, receiver, token and amount are what the
 *                            user typed (not the fee, chain or note; see below)
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
 * Before returning, it checks the node kept the sender, receiver, token and
 * amount (see checkPrepared for what it does NOT check).
 */
export async function buildTransfer({ sender, receiver, amountUnits, kda }) {
  return buildTransfers({ sender, transfers: [{ receiver, amountUnits, kda }] });
}

/**
 * MAX_TRANSFERS - the most transfers one Klever transaction may hold. It's
 * Klever's own rule (klever-go, core/constants.go: MaxLengthOfContracts = 20;
 * a node refuses more) and also the KLV Signer's limit. More than that has to
 * be split into several transactions, each approved on its own.
 */
export const MAX_TRANSFERS = 20;

/**
 * buildTransfers - prepares ONE unsigned testnet transaction with several
 * transfers (1 to MAX_TRANSFERS), e.g. several NFTs to the same receiver.
 *   sender:    the Signer's wallet address
 *   transfers: [{ receiver, amountUnits, kda }] in the order they should run
 * The Signer shows them all on one approval screen. Before returning, it
 * checks the node kept every transfer, in the same order.
 */
export async function buildTransfers({ sender, transfers }) {
  if (!Array.isArray(transfers) || transfers.length === 0 || transfers.length > MAX_TRANSFERS) {
    throw new Error(`One transaction can hold 1 to ${MAX_TRANSFERS} transfers.`);
  }
  let builder = new TransactionBuilder(getProvider()).sender(sender);
  for (const t of transfers) {
    const transfer = { receiver: t.receiver, amount: String(t.amountUnits) };
    if (t.kda) transfer.kda = t.kda;
    builder = builder.transfer(transfer);
  }
  const tx = await builder.build();
  const hex = tx.toHex();
  checkPreparedAll(hex, { sender, transfers }); // the node must not change anything
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
// What it checks: only transfers (1 to 20; another kind is refused), and for
// each one its receiver, token and amount, plus the sender. What it does NOT check: the
// fee, the chain (network), notes (data) and any other field of RawData.
// The Signer reads all of those itself: it refuses what it can't explain
// (another network, a fee over 100 KLV, unknown fields) and shows the rest,
// notes included, before anyone approves. So for this example that is enough. Copying this code into an app that doesn't
// go through the Signer? Then check those fields too (weekly check, 12 Oct
// 2026: the comments used to say "exactly this transfer").
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

/** One Contract (field 6 of RawData) → { receiver, tokenId, amountUnits }, or throws. */
function readOneTransfer(contractBytes) {
  const contract = readFields(contractBytes);
  const type = one(contract, 1);
  if (type !== undefined && type !== 0n) throw new Error('The prepared transaction is not a transfer.');
  const parameter = readFields(one(contract, 2) || new Uint8Array());
  const typeName = ascii(one(parameter, 1) || new Uint8Array());
  if (!typeName.endsWith('proto.TransferContract')) throw new Error('The prepared transaction is not a transfer.');
  const transfer = readFields(one(parameter, 2) || new Uint8Array());
  const receiver = one(transfer, 1);
  const token = one(transfer, 2);
  const amount = one(transfer, 3);
  if (!(receiver instanceof Uint8Array) || receiver.length !== 32 || typeof amount !== 'bigint') {
    throw new Error('A prepared transfer is missing its receiver or amount.');
  }
  return { receiver: toAddress(receiver), tokenId: token ? ascii(token) : 'KLV', amountUnits: amount.toString() };
}

/**
 * readTransfers - what a prepared transaction really does:
 * { sender, transfers: [{ receiver, tokenId, amountUnits }] } in order.
 * Throws if it holds anything other than 1 to MAX_TRANSFERS transfers, or
 * the layout is damaged.
 */
export function readTransfers(unsignedHex) {
  const raw = one(readFields(hexToBytes(unsignedHex)), 1);
  if (!(raw instanceof Uint8Array)) throw new Error('The prepared transfer has no content.');
  const rawData = readFields(raw);
  const sender = one(rawData, 2);
  if (!(sender instanceof Uint8Array) || sender.length !== 32) throw new Error('The prepared transfer is missing its sender.');
  const contracts = rawData[6] || [];
  if (contracts.length === 0 || contracts.length > MAX_TRANSFERS) {
    throw new Error(`The prepared transaction holds ${contracts.length} parts; 1 to ${MAX_TRANSFERS} transfers are allowed.`);
  }
  return { sender: toAddress(sender), transfers: contracts.map(readOneTransfer) };
}

/**
 * readTransfer - a prepared SINGLE transfer: { sender, receiver, tokenId,
 * amountUnits }. Throws if it holds more than one.
 */
export function readTransfer(unsignedHex) {
  const { sender, transfers } = readTransfers(unsignedHex);
  if (transfers.length !== 1) throw new Error('The prepared transaction does more than one thing.');
  return { sender, ...transfers[0] };
}

/**
 * checkPrepared - throws unless the prepared transaction is one transfer of
 * `amountUnits` of `kda` (KLV if empty) from `sender` to `receiver`.
 * Fee, chain and notes are left to the Signer (see above).
 */
export function checkPrepared(unsignedHex, { sender, receiver, amountUnits, kda }) {
  checkPreparedAll(unsignedHex, { sender, transfers: [{ receiver, amountUnits, kda }] });
}

/**
 * checkPreparedAll - the same for several transfers: exactly these, in this
 * order, nothing added or left out. Fee, chain and notes are left to the
 * Signer (see above).
 */
export function checkPreparedAll(unsignedHex, { sender, transfers }) {
  const t = readTransfers(unsignedHex);
  const same = t.sender === sender && t.transfers.length === transfers.length
    && t.transfers.every((got, i) => got.receiver === transfers[i].receiver
      && got.tokenId === (transfers[i].kda || 'KLV') && got.amountUnits === String(transfers[i].amountUnits));
  if (!same) {
    throw new Error('The testnet node prepared a different transfer than the one you typed, so it was not sent to the Signer. Nothing was signed.');
  }
}

/**
 * The NFT field: one or several NFTs, separated by commas, spaces or new
 * lines ("SGNTEST-3UC2/2, SGNTEST-3UC2/3"). Returns { ids } or { problem }.
 * Several = one transaction with one transfer each, approved once in the
 * Signer (at most MAX_TRANSFERS, Klever's own limit). Used by App.js.
 */
export function parseNftList(text) {
  const ids = String(text || '').toUpperCase().split(/[\s,;]+/).filter(Boolean);
  if (ids.length === 0) return { ids: [] };
  const wrong = ids.find((id) => !/^[A-Z0-9]{3,10}-[A-Z0-9]{4}\/[1-9][0-9]{0,19}$/.test(id));
  if (wrong) return { problem: `"${wrong}" isn't an NFT like SGNTEST-3UC2/1 (collection, "/", number).` };
  const twice = ids.find((id, i) => ids.indexOf(id) !== i);
  if (twice) return { problem: `${twice} is in the list twice.` };
  if (ids.length > MAX_TRANSFERS) {
    return { problem: `That's ${ids.length} NFTs. One transaction can send at most ${MAX_TRANSFERS} (Klever's limit); send the rest in a second one.` };
  }
  return { ids };
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
