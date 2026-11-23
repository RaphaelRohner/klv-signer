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
 *     keccak-256( <byte 23 (0x17)> + "Klever Signed Message:\n" + <length of the text in bytes, as
 *                 decimal digits> + <the text in UTF-8> )
 *   (The first byte is invisible in most editors; found by the hand-built
 *   check in tests/message.test.js, 26 Oct 2026.)
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
 *     - a word mixing Latin letters with letters of an alphabet that has
 *       Latin look-alikes: Cyrillic, Greek (second-opinion review, 26 Oct
 *       2026), and since 2 Nov 2026 also Armenian, Cherokee, Coptic, Lisu,
 *       Canadian syllabics, Georgian and Tifinagh (weekly check and review
 *       of 2 Nov 2026);
 *     - marks that strike through or pile up on letters (3 or more), spaces
 *       other than the normal one, more than two empty lines in a row
 *       (weekly check, 26 Oct 2026);
 *     - text mixing right-to-left letters (Arabic, Hebrew, …) with other
 *       letters or digits: the screen could show its parts in another order
 *       than they're signed (same rule as for app names, appTrust.js).
 *
 * WHAT IS SHOWN WITH A WARNING (otherLetters, 2 Nov 2026)
 *   A word written ENTIRELY in look-alike letters ("СОРЕ" in Cyrillic looks
 *   like "COPE") can't be refused: real Russian words are made of such
 *   letters too ("ОКНО", "СОК"). So any text with letters that aren't plain
 *   Latin (another alphabet, or "styled or unusual" Latin: fullwidth ＣＯＰＥ,
 *   mathematical 𝐂𝐎𝐏𝐄, Roman-numeral characters ⅰ Ⅾ, the Kelvin sign K,
 *   phonetic letters ɑ ɡ ɪ ᴠ) is signed only after a warning on the approval
 *   screen, naming the alphabets, so you read it twice. (Weekly check of
 *   2 Nov 2026, Low; Raphael chose the fix together with the extra alphabets.
 *   The phonetic and Roman-numeral cases came from the review the same
 *   evening.) Accented letters (é, ü, ł, ß, ı …) count as plain Latin.
 *
 * THE "EXACT CHARACTERS" VIEW (characterView, 21 Nov 2026)
 *   On the approval screen you can switch to a view that shows the text with
 *   every character that isn't a plain keyboard character (A–Z, a–z, 0–9,
 *   punctuation, the normal space) written as its code, e.g. "D⟨U+0435⟩vikins"
 *   (special brackets an app can't fake, since 23 Nov 2026),
 *   plus a list of those characters with their alphabet and their bytes. So
 *   you can see exactly which characters will be signed without relying on
 *   how the phone's font draws them. It adds to the refusals and warnings
 *   above; it doesn't replace them. (Suggested by jenniferseward, Klever
 *   forum, 21 Nov 2026.)
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
// Since the second-opinion review of 26 Oct 2026: a word mixing Latin letters
// with Cyrillic or Greek ones can fake a name (a Cyrillic "e" in "Devikins").
// Since 2 Nov 2026 also the other alphabets with Latin look-alikes: Armenian
// ("օ" = o), Cherokee ("Ꭺ" = A), Coptic, Lisu ("ꓮ" = A), Canadian
// syllabics ("ᑕ" = C), Georgian and Tifinagh ("ⵔ" = O).
const WORD = /[\p{L}\p{M}\p{N}]+/gu;
const LATIN = /\p{Script=Latin}/u;
const LOOK_ALIKE_ALPHABET = /[\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Armenian}\p{Script=Cherokee}\p{Script=Coptic}\p{Script=Lisu}\p{Script=Canadian_Aboriginal}\p{Script=Georgian}\p{Script=Tifinagh}]/u;
// For the warning (otherLetters): which alphabet a letter that isn't plain
// Latin belongs to. Some characters count as Latin (or "Common") to Unicode
// but aren't plain letters: fullwidth ＡＢＣ, mathematical 𝐀𝐁𝐂, Roman-numeral
// characters ⅰ Ⅾ, the Kelvin sign K, phonetic letters ɑ ɡ ɪ ᴠ. Most of them
// turn into plain letters under Unicode's "compatibility" form (NFKC); the
// phonetic ones don't, so their blocks are listed (review of 2 Nov 2026).
// Mathematical GREEK letters (𝛂) are named Greek.
const LETTER_OR_NUMBER = /[\p{L}\p{Nd}\p{Nl}]/u;
const PLAIN_DIGIT = /[0-9]/;
const MATH_GREEK = /[\u{1D6A8}-\u{1D7CB}]/u;
const UNUSUAL_LATIN = /[\u0250-\u02AF\u1D00-\u1DBF\u2100-\u218F\uFF21-\uFF3A\uFF41-\uFF5A\u{1D400}-\u{1D6A5}\u{1D7CE}-\u{1D7FF}]/u;
const STYLED_LABEL = 'styled or unusual Latin';
const ALPHABETS = [
  ['Cyrillic', /\p{Script=Cyrillic}/u],
  ['Greek', /\p{Script=Greek}/u],
  ['Armenian', /\p{Script=Armenian}/u],
  ['Cherokee', /\p{Script=Cherokee}/u],
  ['Coptic', /\p{Script=Coptic}/u],
  ['Lisu', /\p{Script=Lisu}/u],
  ['Canadian syllabics', /\p{Script=Canadian_Aboriginal}/u],
  ['Georgian', /\p{Script=Georgian}/u],
  ['Tifinagh', /\p{Script=Tifinagh}/u],
  ['Hebrew', /\p{Script=Hebrew}/u],
  ['Arabic', /\p{Script=Arabic}/u],
  ['Chinese', /\p{Script=Han}/u],
  ['Japanese', /[\p{Script=Hiragana}\p{Script=Katakana}]/u],
  ['Korean', /\p{Script=Hangul}/u],
];
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
  for (const word of text.match(WORD) || []) {
    if (LATIN.test(word) && LOOK_ALIKE_ALPHABET.test(word)) {
      return `The word "${word}" mixes Latin letters with letters of another alphabet (such as Cyrillic or Greek) that look the same, so it could fake a name. The text isn't signed.`;
    }
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
 * otherLetters — which letters in the text aren't plain Latin? (2 Nov 2026)
 * For the warning on the approval screen; doesn't refuse anything.
 * Accented Latin letters (ä, é, ñ, ß, ı …) count as plain Latin.
 *
 * @param {string} text
 * @returns {string[]}  e.g. ['Cyrillic'], ['styled or unusual Latin'], [] when all plain
 */
export function otherLetters(text) {
  const found = new Set();
  for (const c of typeof text === 'string' ? text : '') {
    if (!LETTER_OR_NUMBER.test(c) || PLAIN_DIGIT.test(c)) continue;
    if (MATH_GREEK.test(c)) { found.add('Greek'); continue; }
    const alphabet = ALPHABETS.find(([, re]) => re.test(c));
    if (alphabet) { found.add(alphabet[0]); continue; }
    if (UNUSUAL_LATIN.test(c) || c.normalize('NFKC') !== c) { found.add(STYLED_LABEL); continue; }
    if (LATIN.test(c)) continue;
    found.add('another alphabet');
  }
  return [...found];
}

/**
 * characterView — the text as exact characters, for the approval screen's
 * "Show exact characters" view (21 Nov 2026, suggested by jenniferseward).
 * Doesn't refuse or change anything; it only describes what will be signed.
 *
 * Plain keyboard characters (codes 32–126: A–Z, a–z, 0–9, punctuation and the
 * normal space) are kept as they are. Every other character becomes a code
 * like U+0435, so it can't hide behind a font that draws it like a Latin
 * letter. A line break is shown as U+000A and then really breaks the line,
 * so the layout stays readable.
 *
 * @param {string} text
 * @returns {{
 *   parts: Array<{ plain: string } | { code: string, lineBreak?: boolean }>,
 *   special: Array<{ char: string, code: string, what: string, bytes: string, count: number }>
 * }}
 *   parts:   the text in order, plain stretches and codes;
 *   special: each non-plain character once, in order of first appearance,
 *            with what it is, its UTF-8 bytes (what's really in the signed
 *            data) and how often it appears.
 */
export function characterView(text) {
  const parts = [];
  const special = new Map();
  const encoder = new TextEncoder();
  let plain = '';
  for (const c of typeof text === 'string' ? text : '') {
    const cp = c.codePointAt(0);
    if (cp >= 0x20 && cp <= 0x7e) { plain += c; continue; } // plain keyboard character
    if (plain) { parts.push({ plain }); plain = ''; }
    const code = codeOf(cp);
    parts.push(cp === 0x0a ? { code, lineBreak: true } : { code });
    const seen = special.get(code);
    if (seen) seen.count += 1;
    else {
      const bytes = [...encoder.encode(c)].map((b) => b.toString(16).padStart(2, '0')).join(' ');
      special.set(code, { char: c, code, what: describeCharacter(c), bytes, count: 1 });
    }
  }
  if (plain) parts.push({ plain });
  return { parts, special: [...special.values()] };
}

/**
 * The brackets the approval screen puts around a code: ⟨U+0435⟩ (weekly check
 * 23 Nov 2026). They're deliberately NOT plain keyboard characters: if an app
 * wrote "⟨U+0435⟩" into its text to fake a code, the brackets themselves would
 * be shown as codes (⟨U+27E8⟩…), so a fake can't look like a real one.
 * (With plain [ ] an app could write "[U+0435]" as ordinary text.)
 */
export const CODE_OPEN = '\u27E8';
export const CODE_CLOSE = '\u27E9';

/** "U+0435" for a code point (at least 4 hex digits, capital letters). */
function codeOf(cp) {
  return 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * describeCharacter — what a non-plain character is, in plain words, e.g.
 * "Cyrillic letter", "Latin letter with accent", "line break". Used by
 * characterView. Only a rough kind, not Unicode's full name (that list
 * would add megabytes to the app); together with the code, anyone can look
 * the character up.
 */
function describeCharacter(c) {
  if (c === '\n') return 'line break';
  if (/\p{M}/u.test(c)) return 'mark that combines with the character before it';
  // Characters that Unicode itself treats as a styled form of plain letters or
  // digits: say WHAT they look like (weekly check 23 Nov 2026: "symbol" for
  // Ⓓ made a look-alike sound harmless). E.g. Ⓓ → D, 𝐂 → C, ＡＢＣ → A, Ⅷ → VIII.
  const looks = c.normalize('NFKC');
  if (looks !== c && /^[A-Za-z0-9]+$/.test(looks)) return `looks like "${looks}" (styled or letter-like character)`;
  if (/\p{Nd}/u.test(c)) return 'digit that isn\'t 0–9'; // e.g. Arabic-Indic digits
  if (LETTER_OR_NUMBER.test(c)) {
    if (MATH_GREEK.test(c)) return 'Greek letter (styled)';
    const alphabet = ALPHABETS.find(([, re]) => re.test(c));
    if (alphabet) return `${alphabet[0]} letter`;
    if (LATIN.test(c)) {
      // A plain letter with accents (é = e + ´): its base is A–Z. Everything else
      // Latin (ß, ø, ǀ, ꜱ, phonetic letters …) is named as unusual, because some of
      // these look exactly like plain letters (ǀ like l, ꜱ like s) – weekly check 23 Nov.
      const base = c.normalize('NFD').replace(/\p{M}/gu, '');
      if (/^[A-Za-z]$/.test(base)) return 'Latin letter with accent';
      return 'unusual Latin letter (some look exactly like plain ones, e.g. ǀ like l)';
    }
    return 'letter of another alphabet';
  }
  if (/\p{N}/u.test(c)) return 'number sign (e.g. ² or ½)';
  if (/\p{P}/u.test(c)) return 'punctuation';
  if (/\p{S}/u.test(c)) return 'symbol';
  if (/\p{Z}/u.test(c)) return 'space';
  return 'other character';
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
