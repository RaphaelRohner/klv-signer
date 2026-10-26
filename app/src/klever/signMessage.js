/*
 * signMessage.js — signs a short text ("message"), after you've approved it
 * ==========================================================================
 *
 * Added 25 Oct 2026 (protocol version 1, request type SIGN_MESSAGE): some apps
 * need proof that you hold a wallet, not a payment. Example: the Devikins
 * Legacy Hub's chat asks the wallet to sign a sign-in text ("This is NOT a
 * transaction…"); the chat's server then knows the wallet holds Devikins.
 * The Klever browser extension does the same for websites (signMessage).
 *
 * WHAT IS SIGNED
 *   Klever's standard message format (the same as the extension and Klever's
 *   own library, @klever/connect-crypto prepareKlvMessage):
 *     keccak-256( "Klever Signed Message:\n" + <length of the text in bytes> + <the text> )
 *   and that 32-byte fingerprint is signed with Ed25519.
 *
 * WHY THIS CAN'T BE MISUSED AS A TRANSACTION SIGNATURE
 *   A transaction signature is over blake2b-256 of the transaction's bytes
 *   (signTransaction.js). A message signature is over keccak-256 of the
 *   PREFIXED text above. For one to pass as the other, two different hash
 *   functions would have to give the same 32 bytes – practically impossible.
 *   So signing a message can never move anything.
 *
 * WHAT TEXT IS ACCEPTED (checkMessageText)
 *   You approve what you READ, so the text must look exactly like what it
 *   is. Refused (not cleaned: the signature must cover exactly the text
 *   shown):
 *     - empty, or longer than 2,000 characters, or more than 40 lines;
 *     - invisible characters and control codes (only line breaks allowed),
 *       direction-changing marks, blank-looking letters, combining
 *       "enclosing" marks – anything that could hide or rearrange text;
 *     - marks that strike through or pile up on letters (3 or more), spaces
 *       other than the normal one, more than two empty lines in a row
 *       (weekly check, 26 Oct 2026);
 *     - text mixing right-to-left letters (Arabic, Hebrew, …) with other
 *       letters or digits: the screen could show its parts in another order
 *       than they're signed (same rule as for app names, appTrust.js).
 *
 * The private key itself is never returned, stored or shown.
 * Plain calculations only (no screens), so the automated tests check them.
 */

import {
  getPublicKeyFromPrivateSync, PublicKeyImpl, prepareKlvMessage, signMessageSync, verifySignatureSync,
} from '@klever/connect-crypto';
import { bytesToHex } from './protobuf.js';

/** The longest text the Signer signs (characters), and the most lines. */
export const MESSAGE_MAX_CHARS = 2000;
export const MESSAGE_MAX_LINES = 40;

// Characters that could hide or rearrange text (see the top of this file).
// \p{C}: control, format (incl. direction marks and zero-width), private-use,
// unassigned and lone surrogate (broken) characters. Plus line/paragraph separators,
// blank-looking letters, variation selectors and enclosing marks.
const HIDDEN = /[\p{C}\u2028\u2029\u115F\u1160\u3164\uFFA0\u2800\uFFFC\u034F\u17B4\u17B5\u180B-\u180F\uFE00-\uFE0F\u{E0100}-\u{E01EF}\p{Me}]/u;
// Since the weekly check of 26 Oct 2026 (Low): marks that strike through or
// pile up on letters (hard to read), and spaces other than the normal one.
const OVERLAY = /[\u0334-\u0338\u20D2\u20D3\u20E5\u20E6\u20EA\u20EB]/u;
const STACKED = /\p{M}{3,}/u;
const ODD_SPACE = /(?! )\p{Zs}/u;
const RTL = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}]/u;
const OTHER = /[\p{N}]|(?![\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}])\p{L}/u;

/**
 * checkMessageText — may this text be signed?
 * @param {unknown} text
 * @returns {null | string}  null = fine; otherwise why not, in plain words
 */
export function checkMessageText(text) {
  if (typeof text !== 'string' || text.length === 0) return 'The app sent no text to sign.';
  const chars = [...text];
  if (chars.length > MESSAGE_MAX_CHARS) return `The text is longer than ${MESSAGE_MAX_CHARS} characters, so it isn't signed.`;
  const lines = text.split('\n');
  if (lines.length > MESSAGE_MAX_LINES) return `The text has more than ${MESSAGE_MAX_LINES} lines, so it isn't signed.`;
  if (!text.trim()) return 'The text is empty.';
  for (const line of lines) {
    if (HIDDEN.test(line)) {
      return 'The text contains invisible or special characters that could hide what you\'d be signing, so it isn\'t signed.';
    }
  }
  if (OVERLAY.test(text) || STACKED.test(text)) {
    return 'The text contains marks that strike through or pile up on letters, which makes it hard to read, so it isn\'t signed.';
  }
  if (ODD_SPACE.test(text)) {
    return 'The text contains unusual spaces (only normal spaces and line breaks are allowed), so it isn\'t signed.';
  }
  if (/\n[ ]*\n[ ]*\n[ ]*\n/.test(text)) {
    return 'The text has more than two empty lines in a row, which could push part of it out of sight, so it isn\'t signed.';
  }
  if (RTL.test(text) && OTHER.test(text)) {
    return 'The text mixes right-to-left writing with other letters or digits, which can show it in a different order than it would be signed. It isn\'t signed.';
  }
  return null;
}

/**
 * signWalletMessage — signs `text` in Klever's message format.
 *
 * @param {string} text            already checked with checkMessageText
 * @param {Uint8Array} privateKey  the 32-byte key (the caller wipes it afterwards)
 * @param {string} walletAddress   the Signer's wallet address (klv1…)
 * @returns {{ signatureHex: string }}
 */
export function signWalletMessage(text, privateKey, walletAddress) {
  const problem = checkMessageText(text);
  if (problem) throw new Error(problem); // second guard: never sign an unchecked text
  const publicKey = getPublicKeyFromPrivateSync(privateKey);
  if (new PublicKeyImpl(publicKey).toAddress() !== walletAddress) {
    throw new Error('The unlocked key doesn\'t belong to this wallet.');
  }
  const digest = prepareKlvMessage(text);
  const signature = signMessageSync(digest, privateKey);
  if (!(signature instanceof Uint8Array) || signature.length !== 64) {
    throw new Error('Signing produced an unexpected result.');
  }
  if (!verifySignatureSync(digest, signature, publicKey)) {
    throw new Error('The new signature did not check out. Nothing was signed.');
  }
  return { signatureHex: bytesToHex(signature) };
}
