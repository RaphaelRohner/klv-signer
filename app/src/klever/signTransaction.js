/*
 * signTransaction.js — makes the signature, after you've approved
 * ===============================================================
 *
 * Only ever called with a "reading" from readTransaction.js (so the
 * transaction has passed every check) and a private key that was unlocked
 * with your password a moment ago. The caller wipes the key right after.
 *
 * WHAT IT DOES
 *   1. Signs the transaction's fingerprint (hash) with the private key, using
 *      Ed25519, the signature method Klever uses (via Klever's own library).
 *   2. Double-checks before handing anything out:
 *      - the key really belongs to the transaction's sender, and
 *      - the new signature really verifies.
 *   3. Returns the signature, and the complete signed transaction (the
 *      original bytes with the signature added as field 2), ready to be sent
 *      to the Klever network by the client app.
 *
 * The private key itself is never returned, stored or shown.
 */

import { signMessageSync, verifySignatureSync, getPublicKeyFromPrivateSync, PublicKeyImpl } from '@klever/connect-crypto';
import { bytesToHex } from './protobuf.js';

/**
 * signTransaction
 *
 * @param {object} reading       result of readTransaction()
 * @param {Uint8Array} privateKey the 32-byte key (caller wipes it afterwards)
 * @returns {{ signatureHex: string, signedTransactionHex: string }}
 */
export function signTransaction(reading, privateKey) {
  const publicKey = getPublicKeyFromPrivateSync(privateKey);
  if (new PublicKeyImpl(publicKey).toAddress() !== reading.sender) {
    throw new Error('This wallet is not the sender of the transaction.');
  }

  const signature = signMessageSync(reading.hash, privateKey);
  if (!(signature instanceof Uint8Array) || signature.length !== 64) {
    throw new Error('Signing produced an unexpected result.');
  }
  if (!verifySignatureSync(reading.hash, signature, publicKey)) {
    throw new Error('The new signature did not check out. Nothing was signed.');
  }

  // Signed transaction = the unsigned bytes + field 2 (Signature):
  //   0x12 = "field 2, length-prefixed", 0x40 = length 64, then the 64 bytes.
  const signed = new Uint8Array(reading.unsignedBytes.length + 2 + 64);
  signed.set(reading.unsignedBytes, 0);
  signed.set([0x12, 0x40], reading.unsignedBytes.length);
  signed.set(signature, reading.unsignedBytes.length + 2);

  return { signatureHex: bytesToHex(signature), signedTransactionHex: bytesToHex(signed) };
}
