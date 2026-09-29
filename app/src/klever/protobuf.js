/*
 * protobuf.js — a small, strict reader and writer for Klever's data format
 * =========================================================================
 *
 * WHAT THIS FILE DOES
 * Klever transactions travel as "protocol buffers" (protobuf): a compact
 * binary format where every piece of information is stored as
 *     [field number + kind] [value]
 * For example "field 3 = the number 1500000". A "schema" (see schema.js)
 * says what each field number means.
 *
 * WHY WE WROTE OUR OWN INSTEAD OF USING A LIBRARY
 * 1. Klever's own JavaScript library (@klever/connect-encoding 0.1.3) has a
 *    wrong definition of transfers: it mixes up the amount and the token
 *    name. The Klever node reads them correctly. We found this while
 *    building Stage 2.
 * 2. Normal protobuf readers silently SKIP fields they don't know. For a
 *    signer that's dangerous: a transaction could contain an instruction the
 *    screen never shows you, and you'd sign it anyway. This reader REFUSES
 *    anything it doesn't know.
 * 3. The same information can be written in slightly different ways. We
 *    insist on the one standard ("canonical") way: after reading, we write
 *    the data back out and require it to be byte-for-byte identical to what
 *    came in. That guarantees what you see is exactly what gets signed.
 *
 * Numbers are handled as BigInt (JavaScript's "unlimited size" whole
 * numbers), so very large amounts can't be rounded by accident.
 *
 * Nothing here knows about wallets, keys or screens. It only reads and writes.
 */

/** ReadProblem — thrown when the data is broken or not in the expected shape. */
export class ReadProblem extends Error {
  constructor(message) {
    super(message);
    this.name = 'ReadProblem';
  }
}

// Protobuf "wire types": how a value is stored.
const VARINT = 0;            // a whole number
const LENGTH_DELIMITED = 2;  // a length, then that many bytes (text, bytes, nested messages)

// ---------------------------------------------------------------------------
// Low level: whole numbers ("varints")
// ---------------------------------------------------------------------------

/**
 * readVarint — reads one whole number starting at `pos`.
 * A varint stores 7 bits per byte; the top bit says "more bytes follow".
 * We refuse over-long encodings (the standard way never has them).
 *
 * @returns {{ value: bigint, pos: number }}  value and the position after it
 */
export function readVarint(bytes, pos) {
  let value = 0n;
  let shift = 0n;
  const start = pos;
  for (;;) {
    if (pos >= bytes.length) throw new ReadProblem('The data ends in the middle of a number.');
    if (pos - start >= 10) throw new ReadProblem('A number in the data is too long.');
    const byte = bytes[pos];
    pos += 1;
    value |= BigInt(byte & 0x7f) << shift;
    shift += 7n;
    if ((byte & 0x80) === 0) {
      // Standard form: a multi-byte number never ends with an all-zero byte.
      if (pos - start > 1 && byte === 0) throw new ReadProblem('A number in the data is not written the standard way.');
      break;
    }
  }
  if (value >= 1n << 64n) throw new ReadProblem('A number in the data is too large.');
  return { value, pos };
}

/** writeVarint — the opposite of readVarint: a non-negative BigInt → bytes. */
export function writeVarint(value) {
  let v = BigInt(value);
  if (v < 0n) v += 1n << 64n; // negative numbers use 64-bit "two's complement", like the Klever node
  const out = [];
  do {
    let byte = Number(v & 0x7fn);
    v >>= 7n;
    if (v > 0n) byte |= 0x80;
    out.push(byte);
  } while (v > 0n);
  return out;
}

// ---------------------------------------------------------------------------
// Reading and writing whole messages, following a schema
// ---------------------------------------------------------------------------

/*
 * A schema looks like:
 *   { name: 'TransferContract',
 *     fields: { 1: { name: 'ToAddress', type: 'bytes' },
 *               3: { name: 'Amount', type: 'int64' },
 *               6: { name: 'Contract', type: 'message', schema: ..., repeated: true } } }
 * Types: 'uint64', 'int64', 'int32', 'uint32', 'enum' (numbers),
 *        'bytes', 'string', 'message' (nested schema).
 */
const NUMBER_TYPES = new Set(['uint64', 'int64', 'int32', 'uint32', 'enum']);

/** Turns the raw 64-bit value into a signed number for the signed types. */
function toSigned(value, type) {
  if ((type === 'int64' || type === 'int32') && value >= 1n << 63n) return value - (1n << 64n);
  return value;
}

/**
 * decodeMessage — reads `bytes` according to `schema`, strictly.
 *
 * Refuses: unknown field numbers, wrong kinds of values, a single-value
 * field appearing twice, fields out of the standard order, and data that
 * isn't written the standard way.
 *
 * @returns {object} plain object: numbers as BigInt, bytes as Uint8Array,
 *   repeated fields as arrays, nested messages as objects. Missing fields
 *   get their default (0n, empty bytes, [] or null).
 */
export function decodeMessage(bytes, schema) {
  const result = {};
  for (const def of Object.values(schema.fields)) {
    if (def.repeated) result[def.name] = [];
    else if (def.type === 'message') result[def.name] = null;
    else if (NUMBER_TYPES.has(def.type)) result[def.name] = 0n;
    else if (def.type === 'string') result[def.name] = '';
    else result[def.name] = new Uint8Array(0);
  }

  let pos = 0;
  let lastField = 0;
  const seen = new Set();
  while (pos < bytes.length) {
    const tag = readVarint(bytes, pos);
    pos = tag.pos;
    const fieldNumber = Number(tag.value >> 3n);
    const wireType = Number(tag.value & 7n);
    const def = schema.fields[fieldNumber];

    if (!def) {
      throw new ReadProblem(`The ${schema.name} contains a part (field ${fieldNumber}) the Signer doesn't know. It refuses to sign what it can't show you.`);
    }
    if (fieldNumber < lastField) throw new ReadProblem(`The ${schema.name} is not written in the standard order.`);
    if (seen.has(fieldNumber) && !def.repeated) throw new ReadProblem(`The ${schema.name} contains "${def.name}" twice.`);
    if (seen.has(fieldNumber) && def.repeated && fieldNumber !== lastField) {
      throw new ReadProblem(`The ${schema.name} is not written in the standard order.`);
    }
    lastField = fieldNumber;
    seen.add(fieldNumber);

    let value;
    if (NUMBER_TYPES.has(def.type)) {
      if (wireType !== VARINT) throw new ReadProblem(`"${def.name}" in the ${schema.name} has the wrong kind of value.`);
      const read = readVarint(bytes, pos);
      pos = read.pos;
      value = toSigned(read.value, def.type);
    } else {
      if (wireType !== LENGTH_DELIMITED) throw new ReadProblem(`"${def.name}" in the ${schema.name} has the wrong kind of value.`);
      const read = readVarint(bytes, pos);
      pos = read.pos;
      const length = Number(read.value);
      if (pos + length > bytes.length) throw new ReadProblem('The data ends too early.');
      const chunk = bytes.slice(pos, pos + length);
      pos += length;
      if (def.type === 'message') value = decodeMessage(chunk, def.schema);
      else if (def.type === 'string') value = decodeUtf8Strict(chunk, def.name);
      else value = chunk;
    }

    if (def.repeated) result[def.name].push(value);
    else result[def.name] = value;
  }

  // The canonical check: writing it back out must give exactly the same bytes.
  const again = encodeMessage(result, schema);
  if (!sameBytes(again, bytes)) {
    throw new ReadProblem(`The ${schema.name} is not written the standard way, so the Signer can't be sure what it would sign.`);
  }
  return result;
}

/**
 * encodeMessage — writes a plain object back to bytes, the standard way:
 * fields in number order, default values (0, empty) left out, like the
 * Klever node does.
 *
 * @returns {Uint8Array}
 */
export function encodeMessage(object, schema) {
  const out = [];
  const numbers = Object.keys(schema.fields).map(Number).sort((a, b) => a - b);
  for (const fieldNumber of numbers) {
    const def = schema.fields[fieldNumber];
    const values = def.repeated ? object[def.name] || [] : [object[def.name]];
    for (const value of values) {
      if (value === null || value === undefined) continue;
      if (NUMBER_TYPES.has(def.type)) {
        if (!def.repeated && BigInt(value) === 0n) continue; // default: left out
        out.push(...writeVarint(BigInt(fieldNumber) << 3n | BigInt(VARINT)));
        out.push(...writeVarint(BigInt(value)));
      } else {
        let chunk;
        if (def.type === 'message') chunk = encodeMessage(value, def.schema);
        else if (def.type === 'string') chunk = new TextEncoder().encode(value);
        else chunk = value;
        if (!def.repeated && chunk.length === 0 && def.type !== 'message') continue; // default: left out
        out.push(...writeVarint(BigInt(fieldNumber) << 3n | BigInt(LENGTH_DELIMITED)));
        out.push(...writeVarint(BigInt(chunk.length)));
        out.push(...chunk);
      }
    }
  }
  return Uint8Array.from(out);
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** sameBytes — true if two byte arrays are identical. */
export function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

/** decodeUtf8Strict — bytes → text, refusing anything that isn't valid UTF-8 text. */
function decodeUtf8Strict(bytes, what) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new ReadProblem(`"${what}" is not valid text.`);
  }
}

/** hexToBytes — "0a1f…" → bytes. Refuses anything that isn't clean hex. */
export function hexToBytes(hex) {
  const clean = String(hex || '').trim().toLowerCase().replace(/^0x/, '');
  if (clean.length === 0) throw new ReadProblem('Nothing was pasted.');
  if (!/^[0-9a-f]*$/.test(clean)) throw new ReadProblem('This is not a transaction code: it may only contain the characters 0–9 and a–f.');
  if (clean.length % 2 !== 0) throw new ReadProblem('The transaction code seems cut off (it has an odd number of characters).');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** bytesToHex — bytes → "0a1f…". */
export function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
