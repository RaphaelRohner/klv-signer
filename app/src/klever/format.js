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
  const wholeText = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); // 1234567 → 1,234,567
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

/**
 * describeNote — shows an attached note ("Data") as text if it's readable,
 * otherwise says it's unreadable data and how big it is.
 */
export function describeNote(bytes) {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    // Refuse invisible control characters (except line breaks and tabs), which could hide content.
    if (!/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/.test(text)) {
      return { text, readable: true };
    }
  } catch {
    // fall through
  }
  return { text: `unreadable data (${bytes.length} bytes)`, readable: false };
}

/** shortAddress — "klv1usdny…ujlazy", for tight spaces. Full addresses are shown elsewhere. */
export function shortAddress(address) {
  return address.length > 20 ? `${address.slice(0, 10)}…${address.slice(-6)}` : address;
}
