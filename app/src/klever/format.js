/*
 * format.js — turning raw transaction values into plain words
 * ===========================================================
 *
 * Amounts inside a transaction are whole numbers in a token's smallest unit
 * (like cents for euros). KLV has 6 decimal places, so 1500000 = 1.5 KLV.
 *
 * ONE HONEST LIMITATION
 * For KLV and KFI we know the decimal places. For other tokens the decimal
 * places are stored on the blockchain, and the Signer deliberately never goes
 * online (see HOW-IT-WORKS.md), so it can't look them up. For those tokens it
 * shows the amount in the token's smallest units and says so, instead of
 * guessing. NFTs are simply shown as "NFT <collection> #<number>".
 */

/** Tokens whose decimal places are fixed and known. */
const KNOWN_DECIMALS = { KLV: 6, KFI: 6 };

/**
 * formatUnits — 1500000n with 6 decimals → "1.5"; 1n with 6 → "0.000001".
 * Uses BigInt, so nothing is ever rounded.
 */
export function formatUnits(amount, decimals) {
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  let fraction = (abs % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  // No thousands separators, on purpose (owner's decision, 30 Sep 2026): "1,234"
  // means a thousand in English style but 1.234 in European style. Without
  // separators, the only mark in an amount is the decimal point.
  const wholeText = whole.toString(); // 1234567 → 1234567
  if (fraction) fraction = `.${fraction}`;
  return `${negative ? '-' : ''}${wholeText}${fraction}`;
}

/**
 * describeAmount — the plain-words version of "Amount of AssetID".
 *
 * @param {bigint} amount
 * @param {string} assetId  '' or 'KLV' for KLV, 'DVKNFT-1SW5/4821' for an NFT, 'ABC-1234' for a token
 * @returns {{ text: string, note: string|null, isNft: boolean }}
 */
export function describeAmount(amount, assetId) {
  const asset = assetId || 'KLV';
  if (KNOWN_DECIMALS[asset] !== undefined) {
    return { text: `${formatUnits(amount, KNOWN_DECIMALS[asset])} ${asset}`, note: null, isNft: false };
  }
  const slash = asset.indexOf('/');
  if (slash > 0) {
    const collection = asset.slice(0, slash);
    const number = asset.slice(slash + 1);
    const copies = amount === 1n ? '' : ` (× ${amount.toString()})`;
    return { text: `NFT ${collection} #${number}${copies}`, note: null, isNft: true };
  }
  return {
    text: `${amount.toString()} units of ${asset}`,
    note: `The Signer works offline, so it can't look up how many decimal places ${asset} has. This is the amount in the token's smallest units.`,
    isNft: false,
  };
}

/** describeFee — total network fee in KLV, e.g. "0.000251 KLV". */
export function describeFee(kAppFee, bandwidthFee) {
  return `${formatUnits(kAppFee + bandwidthFee, 6)} KLV`;
}

/** Longest note shown as text (characters). Longer ones are only described. */
const MAX_NOTE_CHARS = 256;
/**
 * Characters a note may contain to be shown as text: letters, digits,
 * punctuation, symbols and plain spaces (an ALLOW-list). Not allowed:
 * line breaks, tabs, invisible or direction-changing characters, special
 * spaces, the blank-looking Hangul fillers, and more than 2 accent marks
 * on one letter (stacked marks can draw over other text on screen).
 */
const NOTE_CHAR = /^[\p{L}\p{N}\p{P}\p{S}\p{M} ]$/u;
const BLANK_LOOKING = /[\u115F\u1160\u3164\uFFA0]/u;
const TOO_MANY_MARKS = /\p{M}{3,}/u;

/**
 * describeNote — shows an attached note ("Data") as text only if it's short
 * and contains nothing that could hide or fake screen content. Otherwise it
 * says what it is (e.g. "data the Signer can't show as text (300 bytes)").
 * Notes are written by the asking app and aren't checked; the approval
 * screen labels them so.
 */
export function describeNote(bytes) {
  let text = null;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    text = null;
  }
  const ok = text !== null
    && text.length > 0
    && [...text].length <= MAX_NOTE_CHARS
    && [...text].every((ch) => NOTE_CHAR.test(ch))
    && !BLANK_LOOKING.test(text)
    && !TOO_MANY_MARKS.test(text);
  if (ok) return { text, readable: true };
  return { text: `data the Signer can't show as text (${bytes.length} bytes)`, readable: false };
}

/** shortAddress — "klv1usdny…ujlazy", for tight spaces. Full addresses are shown elsewhere. */
export function shortAddress(address) {
  return address.length > 20 ? `${address.slice(0, 10)}…${address.slice(-6)}` : address;
}

/** "klv1abcd…" → "klv1 abcd efgh …": groups of 4 characters, for comparing by eye. */
export function groupAddress(address) {
  return (String(address).match(/.{1,4}/g) || []).join(' ');
}
