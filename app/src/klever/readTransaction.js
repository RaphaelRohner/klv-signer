/*
 * readTransaction.js — reads a transaction and decides whether it may be signed
 * ============================================================================
 *
 * This is the Signer's most important safety check (see HOW-IT-WORKS.md,
 * section 4, step 3: "the Signer reads the form itself").
 *
 * INPUT: the unsigned transaction as a hex code (what a client app sends).
 * OUTPUT: either
 *   - a "reading": everything the approval screen needs to explain the
 *     transaction in plain words, plus the exact fingerprint (hash) that
 *     would be signed, or
 *   - a ReadProblem with a plain-words reason for refusing.
 *
 * WHAT IT REFUSES (each with its own explanation)
 *   - anything that isn't a well-formed, standard-written Klever transaction
 *   - anything containing parts the Signer doesn't understand
 *   - a transaction for a different network than the Signer is set to
 *   - a transaction from a different wallet than the one in this Signer
 *   - special signing permissions (multi-signature setups)
 *   - fees paid in a token other than KLV (not supported yet)
 *   - any instruction other than a plain transfer (other kinds come later,
 *     one at a time, each with its own plain-words display)
 *   - transfers with royalty settings, zero or negative amounts, or odd token names
 *
 * Nothing in here needs the private key. Signing happens in signTransaction.js,
 * and only after you approve.
 */

import { blake2b } from '@noble/hashes/blake2b';
import { PublicKeyImpl } from '@klever/connect-crypto';
import { decodeMessage, encodeMessage, hexToBytes, bytesToHex, ReadProblem } from './protobuf.js';
import {
  UnsignedTransactionSchema, RawSchema, TransferContractSchema, CONTRACT_TYPES, TRANSFER_TYPE_URL,
} from './schema.js';
import { NETWORKS, networkForChainId } from './networks.js';
import { describeAmount, describeFee, describeNote } from './format.js';

export { ReadProblem };

/** Largest transaction we're willing to read (bytes). Real transfers are ~150 bytes. */
const MAX_BYTES = 32 * 1024;
/** Most transfers we allow in one transaction. */
const MAX_TRANSFERS = 20;
/** The transaction format version we understand. */
const SUPPORTED_VERSION = 1n;
/** Most attached notes we accept in one transaction. */
const MAX_NOTES = 5;
/** Highest total network fee we accept (in smallest units): 100 KLV. Real fees are tiny. */
const MAX_FEE = 100n * 1000000n;
/**
 * What a token name may look like (Klever's own format):
 *   KLV or KFI                       the two native tokens
 *   TICKER-XXXX                      a token: 3–10 capitals/digits, "-", 4 capitals/digits
 *   TICKER-XXXX/123                  an NFT: the collection, "/", its number (no leading zero)
 * Checked on the raw BYTES before anything is turned into text, so invisible
 * characters (like a hidden "byte order mark") can't make a name look like "KLV".
 */
const TOKEN_PATTERN = /^(KLV|KFI|[A-Z0-9]{3,10}-[A-Z0-9]{4})$/;
const NFT_PATTERN = /^[A-Z0-9]{3,10}-[A-Z0-9]{4}\/[1-9][0-9]{0,19}$/;

/** Bytes → text, only if every byte is a plain ASCII letter, digit, "-" or "/". Otherwise null. */
function plainAscii(bytes) {
  for (const b of bytes) {
    const ok = (b >= 0x30 && b <= 0x39) || (b >= 0x41 && b <= 0x5a) || b === 0x2d || b === 0x2f;
    if (!ok) return null;
  }
  return String.fromCharCode(...bytes);
}

/** A 32-byte public key → its "klv1…" address. */
function addressOf(publicKeyBytes, what) {
  if (!(publicKeyBytes instanceof Uint8Array) || publicKeyBytes.length !== 32) {
    throw new ReadProblem(`The ${what} address in this transaction is not a valid Klever address.`);
  }
  return new PublicKeyImpl(publicKeyBytes).toAddress();
}

/**
 * readTransaction — the main function of this file.
 *
 * @param {string} hex  the unsigned transaction, as a hex code
 * @param {object} expected
 * @param {'mainnet'|'testnet'} expected.network  the network the Signer is set to
 * @param {string} expected.walletAddress         the klv1… address of the wallet in this Signer
 * @returns {object} a "reading" (see the return statement at the bottom)
 * @throws {ReadProblem} with a plain-words reason if it can't or mustn't be signed
 */
export function readTransaction(hex, { network, walletAddress }) {
  // 1. Turn the hex code into bytes, and read them strictly. (Size checked
  //    first, so a huge input is refused before any work is done.)
  if (typeof hex !== 'string' || hex.length > 2 * MAX_BYTES + 2) {
    throw new ReadProblem('This transaction is far too large to be a normal transaction.');
  }
  const bytes = hexToBytes(hex);
  if (bytes.length > MAX_BYTES) throw new ReadProblem('This transaction is far too large to be a normal transaction.');
  const outer = decodeMessage(bytes, UnsignedTransactionSchema);
  const raw = outer.RawData;
  if (!raw) throw new ReadProblem('This transaction is empty.');

  // 2. The right network? The chain ID must be plain digits, compared exactly
  //    (no invisible characters, no turning odd bytes into text first).
  const chainBytes = raw.ChainID;
  if (chainBytes.length === 0 || chainBytes.length > 10 || chainBytes.some((b) => b < 0x30 || b > 0x39)) {
    throw new ReadProblem('This transaction has an unusual network ID, so the Signer won\'t sign it.');
  }
  const chainId = String.fromCharCode(...chainBytes);
  const txNetwork = networkForChainId(chainId);
  if (!txNetwork) throw new ReadProblem(`This transaction is for an unknown Klever network (chain ID "${chainId}").`);
  if (txNetwork !== network) {
    throw new ReadProblem(`This transaction is for the ${NETWORKS[txNetwork].label}, but the Signer is set to the ${NETWORKS[network].label}. It won't sign it.`);
  }

  // 3. A format version we understand?
  if (raw.Version !== SUPPORTED_VERSION) {
    throw new ReadProblem(`This transaction uses format version ${raw.Version}, which the Signer doesn't know yet.`);
  }

  // 4. From the wallet in this Signer?
  const sender = addressOf(raw.Sender, 'sender');
  if (sender !== walletAddress) {
    throw new ReadProblem(`This transaction is from the wallet ${sender}, not from the wallet in this Signer.`);
  }

  // 5. No special cases we don't support yet.
  if (raw.PermissionID !== 0n) {
    throw new ReadProblem('This transaction uses a special signing permission (for shared wallets). The Signer doesn\'t support that yet.');
  }
  if (raw.KDAFee !== null) {
    throw new ReadProblem('This transaction pays its fee in a token other than KLV. The Signer doesn\'t support that yet.');
  }
  if (raw.KAppFee < 0n || raw.BandwidthFee < 0n) throw new ReadProblem('This transaction has an invalid fee.');
  if (raw.KAppFee + raw.BandwidthFee > MAX_FEE) {
    throw new ReadProblem('This transaction has an unusually high network fee (over 100 KLV). Real Klever fees are tiny, so the Signer won\'t sign it.');
  }

  // 6. Every instruction must be a plain transfer the Signer can explain.
  if (raw.Contract.length === 0) throw new ReadProblem('This transaction contains no instructions.');
  if (raw.Contract.length > MAX_TRANSFERS) throw new ReadProblem(`This transaction contains more than ${MAX_TRANSFERS} instructions.`);

  const transfers = raw.Contract.map((contract, index) => {
    const position = raw.Contract.length > 1 ? ` (instruction ${index + 1})` : '';
    if (contract.Type !== CONTRACT_TYPES.TRANSFER) {
      throw new ReadProblem(`This transaction contains a kind of instruction (type ${contract.Type})${position} that the Signer can't explain yet, so it won't sign it. So far it only signs transfers.`);
    }
    if (!contract.Parameter || contract.Parameter.TypeUrl !== TRANSFER_TYPE_URL) {
      throw new ReadProblem(`An instruction${position} says it's a transfer but doesn't contain one.`);
    }
    const t = decodeMessage(contract.Parameter.Value, TransferContractSchema);
    const to = addressOf(t.ToAddress, 'receiver');
    if (t.Amount <= 0n) throw new ReadProblem(`A transfer${position} has an amount of zero or less.`);
    if (t.KDARoyalties !== 0n || t.KLVRoyalties !== 0n) {
      throw new ReadProblem(`A transfer${position} includes royalty settings. The Signer can't explain those yet.`);
    }
    let assetId = 'KLV';
    if (t.AssetID.length > 0) {
      const name = plainAscii(t.AssetID);
      if (name === null || !(TOKEN_PATTERN.test(name) || NFT_PATTERN.test(name))) {
        throw new ReadProblem(`A transfer${position} has an unusual token name${name ? ` ("${name}")` : ''}, so the Signer won't sign it.`);
      }
      assetId = name;
    }
    return { to, assetId, amount: t.Amount, ...describeAmount(t.Amount, assetId) };
  });

  // 7. Optional attached notes (at most a few; see describeNote for how they're shown).
  if (raw.Data.length > MAX_NOTES) {
    throw new ReadProblem(`This transaction has more than ${MAX_NOTES} attached notes, so the Signer won't sign it.`);
  }
  const notes = raw.Data.map(describeNote);

  // 8. The fingerprint: blake2b-256 of the RawData, exactly as the Klever node computes it.
  //    (Thanks to the strict reading, these bytes are exactly the ones we received.)
  const rawBytes = encodeMessage(raw, RawSchema);
  const hash = blake2b(rawBytes, { dkLen: 32 });

  return {
    network: txNetwork,
    chainId,
    sender,
    nonce: raw.Nonce,
    fee: describeFee(raw.KAppFee, raw.BandwidthFee),
    feeUnits: raw.KAppFee + raw.BandwidthFee, // same, in smallest KLV units (for the amount rule)
    transfers,
    notes,
    hash,                       // Uint8Array(32): what gets signed
    hashHex: bytesToHex(hash),  // same, as text (the "transaction fingerprint")
    unsignedBytes: encodeMessage(outer, UnsignedTransactionSchema), // identical to the input
  };
}
