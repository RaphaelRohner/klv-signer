/*
 * extraConfirmation.js — when a transaction needs a second, stricter confirmation
 * ==============================================================================
 *
 * You choose the rules on the "Extra confirmation" settings screen (Home).
 * When a request hits one of them, the approval screen asks for more than
 * usual (see screens/ApproveScreen.js):
 *   - your PASSWORD (the fingerprint/face shortcut isn't offered),
 *   - the LAST CHARACTERS of each receiver address, typed by you, so you
 *     stop and compare it with where you meant to send (it can't prove the
 *     address is the right one, but it makes you look at it),
 *   - optionally a short WAIT before "Approve" can be tapped.
 * Nothing is ever blocked or limited: every transaction can still be signed.
 *
 * THE RULES (each can be switched on or off)
 *   - Amount: more than X KLV in total in one transaction.
 *   - New receiver: an address you've never signed a transfer to before.
 *   - Other tokens / NFTs: any transfer of a token other than KLV, or of an NFT.
 *   - First request from an app: an app that has never had a signature before.
 *   - Several transfers in one transaction.
 *   - Burst: 3 or more signing requests within 2 minutes.
 * Trusted receivers (e.g. your own other wallets) don't trigger the
 * per-transfer rules (amount, new receiver, tokens, NFTs).
 *
 * WHAT THE SIGNER CAN'T KNOW
 * It has no internet, so it can't know your balance or prices in euros.
 * Amounts are compared in KLV. The "history" (receivers, apps, recent
 * requests) is what this Signer itself has seen; it stays on the phone.
 * Receivers are remembered by the last 16 characters of their address
 * (enough to tell them apart, and it keeps the saved history small).
 * Plain KLV always arrives here as assetId 'KLV' (readTransaction fills it
 * in when the transaction leaves the token name empty), and readTransaction
 * refuses anything that isn't a transfer, so every rule sees real transfers.
 *
 * CHANGING THE RULES
 * Making them stricter needs nothing. Making them LESS strict needs the
 * password (never the fingerprint): see isRelaxing() below.
 *
 * Pure calculations (no screens, no storage), so the automated tests can check them.
 */

import { addressGroups } from '../klever/format.js';

/** How many characters of each receiver address you type (one box of the address). */
export const CONFIRM_GROUP_LENGTH = 6;
/** How many characters of an address are shown at the end in short messages. */
const SHORT_END = 6;
/** Burst rule: this many requests (including the current one) within BURST_WINDOW_MS. */
export const BURST_COUNT = 3;
export const BURST_WINDOW_MS = 2 * 60 * 1000;
/** Waiting times offered on the settings screen, in seconds. */
export const WAIT_CHOICES = [0, 10, 30];

/** The rules a new Signer starts with: helpful, not annoying. */
export const DEFAULT_RULES = Object.freeze({
  version: 1,
  // Smallest units as text ("10000000000" = 10,000 KLV); null = off. On by
  // default since 5 Oct 2026 at 10,000 KLV, about 10 US dollars then (owner's
  // decision, third review T1). Only for new wallets: saved rules keep theirs.
  klvThreshold: '10000000000',
  newReceiver: true,
  otherTokens: true,       // on since the second review: token amounts can't always be shown in whole tokens
  nfts: false,
  firstAppRequest: true,
  multiTransfer: true,
  burst: true,
  repeat: true,            // the same transfer again within an hour (third review, T6)
  waitSeconds: 0,
  trusted: [],             // klv1… addresses
});

// receivers: { last 16 characters of address: time last signed }
// apps:      { app ID: time last signed }
// recent:    [{ t: time, h: transaction fingerprint }]  (requests, for the burst rule)
// signed:    [{ t: time, k: "receiver|token|amount" }]  (signed transfers, for the repeat rule)
export const EMPTY_HISTORY = Object.freeze({ receivers: {}, apps: {}, recent: [], signed: [] });

/** The on/off rules (switches on the settings screen), in one place. */
export const RULE_SWITCHES = Object.freeze(['newReceiver', 'otherTokens', 'nfts', 'firstAppRequest', 'multiTransfer', 'burst', 'repeat']);

/** Repeat rule: the same transfer signed again within this time counts as a possible double payment. */
export const REPEAT_WINDOW_MS = 60 * 60 * 1000;
/** How many signed transfers are remembered for the repeat rule. */
const MAX_SIGNED = 50;

/** "receiver|token|amount": what makes two transfers "the same" for the repeat rule. */
function transferKey(t) {
  return `${receiverKey(t.to)}|${t.assetId}|${BigInt(t.amount).toString()}`;
}

/** How receivers are remembered (see top of file). */
export function receiverKey(address) {
  return String(address).slice(-16);
}

const KLV_DECIMALS = 6;

/** "12.5" (plain: digits, optionally one "." and up to 6 decimals) → 12500000n, or null. */
function plainToUnits(t) {
  if (!/^\d+(\.\d{1,6})?$/.test(t)) return null;
  const [whole, fraction = ''] = t.split('.');
  const units = BigInt(whole) * 10n ** BigInt(KLV_DECIMALS) + BigInt(fraction.padEnd(KLV_DECIMALS, '0'));
  return units > 0n ? units : null;
}

/**
 * klvCandidates — every amount a typed KLV number could mean, in smallest units.
 *   []        not a valid amount
 *   [x]       clear: "12.5", "12,5" (comma = decimal point, as on many
 *             European keyboards), "1,000,000", "1.000.000", "1,000.5", "1.000,5"
 *   [x, y]    AMBIGUOUS: "1,000" or "1.000" (one comma or dot followed by
 *             exactly 3 digits) could be 1 KLV or 1000 KLV. The settings
 *             screen then asks which one you meant.
 */
export function klvCandidates(text) {
  const t = String(text || '').trim().replace(/\s/g, '');
  const found = [];
  const add = (plain) => {
    const u = plainToUnits(plain);
    if (u !== null && !found.some((x) => x === u)) found.push(u);
  };
  if (/^\d{1,3}([.,])\d{3}$/.test(t)) {          // "1,000" / "1.000": two readings
    add(t.replace(/[.,]/, '.'));
    add(t.replace(/[.,]/, ''));
  } else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) { // "1,000,000" / "1,000.5" (English style)
    add(t.replace(/,/g, ''));
  } else if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) { // "1.000.000" / "1.000,5" (European style)
    add(t.replace(/\./g, '').replace(',', '.'));
  } else {
    add(t.replace(',', '.'));                        // "12.5" / "12,5" / "100"
  }
  return found;
}

/** The amount, only if the text is clear (exactly one reading); otherwise null. */
export function parseKlv(text) {
  const c = klvCandidates(text);
  return c.length === 1 ? c[0] : null;
}

/** 12500000n → "12.5" */
export function formatKlv(units) {
  const u = BigInt(units);
  const base = 10n ** BigInt(KLV_DECIMALS);
  const fraction = (u % base).toString().padStart(KLV_DECIMALS, '0').replace(/0+$/, '');
  return `${u / base}${fraction ? `.${fraction}` : ''}`;
}

/** "klv1abc…xyz" for messages. */
function short(address) {
  return `${address.slice(0, 8)}…${address.slice(-SHORT_END)}`;
}

/**
 * reasonsForExtraConfirmation — which rules this transaction hits.
 *
 * @param {object} reading   from readTransaction(): { transfers: [{ to, assetId, amount, isNft }] }
 * @param {object} rules     the saved rules (DEFAULT_RULES shape)
 * @param {object} history   { receivers: {address: count}, apps: {appId: count}, recent: [time ms] }
 * @param {{ appId: string|null, now: number }} context  appId = the asking app (null = pasted by hand)
 * @returns {{ id: string, text: string }[]}  empty = no extra confirmation needed
 */
export function reasonsForExtraConfirmation(reading, rules, history, { appId, now }) {
  const r = { ...DEFAULT_RULES, ...(rules || {}) };
  const h = { ...EMPTY_HISTORY, ...(history || {}) };
  const trusted = new Set(r.trusted || []);
  const reasons = [];
  const watched = reading.transfers.filter((t) => !trusted.has(t.to));

  // Amount: total KLV to receivers that aren't trusted
  if (r.klvThreshold) {
    // The network fee counts too (second review): it's KLV leaving your wallet.
    // It's only added when something goes to a receiver that isn't trusted.
    const fee = watched.length > 0 ? BigInt(reading.feeUnits || 0n) : 0n;
    const total = watched.filter((t) => t.assetId === 'KLV').reduce((sum, t) => sum + BigInt(t.amount), 0n) + fee;
    const limit = BigInt(r.klvThreshold);
    if (total > limit) {
      reasons.push({
        id: 'amount',
        text: `It sends ${formatKlv(total)} KLV${fee > 0n ? ' (network fee included)' : ''}, more than your ${formatKlv(limit)} KLV setting.`,
      });
    }
  }

  // New receivers
  if (r.newReceiver) {
    const fresh = [...new Set(watched.map((t) => t.to))].filter((to) => !(h.receivers && h.receivers[receiverKey(to)]));
    if (fresh.length > 0) {
      reasons.push({
        id: 'newReceiver',
        text: fresh.length === 1
          ? `You've never sent to ${short(fresh[0])} before.`
          : `You've never sent to ${fresh.length} of these receivers before.`,
      });
    }
  }

  if (r.otherTokens && watched.some((t) => t.assetId !== 'KLV' && !t.isNft)) {
    reasons.push({ id: 'otherTokens', text: 'It sends a token other than KLV.' });
  }
  if (r.nfts && watched.some((t) => t.isNft)) {
    reasons.push({ id: 'nfts', text: 'It sends an NFT.' });
  }

  if (r.firstAppRequest && appId && !(h.apps && h.apps[appId])) {
    reasons.push({ id: 'firstAppRequest', text: 'It\'s the first signature this app has asked for.' });
  }

  if (r.multiTransfer && reading.transfers.length > 1) {
    reasons.push({ id: 'multiTransfer', text: `It contains ${reading.transfers.length} transfers in one go.` });
  }

  if (r.repeat) {
    // The same transfer (receiver, token, amount) signed within the last hour:
    // e.g. an app says "it failed, approve again", but the first one went
    // through. A new transaction number makes it a different transaction, so
    // without this rule both would be paid. Trusted receivers count too.
    const earlier = (h.signed || []).filter((e) => e && now - e.t >= 0 && now - e.t < REPEAT_WINDOW_MS);
    const matches = reading.transfers
      .map((t) => earlier.filter((e) => e.k === transferKey(t)).reduce((latest, e) => Math.max(latest, e.t), 0))
      .filter((t) => t > 0);
    if (matches.length > 0) {
      const minutes = Math.max(1, Math.round((now - Math.max(...matches)) / 60000));
      reasons.push({
        id: 'repeat',
        text: `You signed ${matches.length === reading.transfers.length && matches.length === 1 ? 'exactly this transfer' : 'the same transfer'} (same receiver, token and amount) ${minutes} minute${minutes === 1 ? '' : 's'} ago. If an app says the first one failed, check on Kleverscan first: it may have gone through, and this would pay twice.`,
      });
    }
  }

  if (r.burst) {
    // Other requests in the last 2 minutes (the same transaction shown again doesn't count twice).
    const recent = (h.recent || []).filter((e) => e && e.h !== reading.hashHex && now - e.t >= 0 && now - e.t < BURST_WINDOW_MS);
    if (recent.length + 1 >= BURST_COUNT) {
      reasons.push({ id: 'burst', text: `It's request number ${recent.length + 1} within 2 minutes.` });
    }
  }

  return reasons;
}

/** The receiver addresses you must confirm by typing one of their boxes (each once). */
export function receiversToConfirm(reading) {
  return [...new Set(reading.transfers.map((t) => t.to))];
}

/*
 * WHICH CHARACTERS YOU TYPE (third review, 5 Oct 2026)
 * An address is shown in boxes: "klv1", 4 characters, then nine boxes of 6
 * (klever/format.js, addressGroups). You type ONE of the middle 6-character
 * boxes, chosen at random for every request and outlined on screen.
 * Why not the last 6 any more: they're a checksum, and a scammer can generate
 * a look-alike address whose last 6 (or first and last) characters match
 * yours in minutes. If they can't know WHICH box you'll be asked for, they'd
 * have to match all of them: practically impossible. The last box is never
 * asked for, the most commonly copied part of a look-alike.
 */

/** Index of the first and last box that may be asked for (in addressGroups' list). */
const FIRST_ASKABLE = 2;
const LAST_ASKABLE = 9; // box 10 (the last) is excluded on purpose

/**
 * pickConfirmGroup — which box of this address to ask for: a random middle
 * box, from the phone's secure random generator. Returns the box's index in
 * addressGroups(address).
 * @param {string} address
 * @param {(n: number) => number} [randomBelow]  for the tests; default: secure random 0..n-1
 */
export function pickConfirmGroup(address, randomBelow = secureRandomBelow) {
  const groups = addressGroups(address);
  if (groups.length !== 11) return groups.length - 1; // not a normal address (readTransaction refuses those anyway)
  return FIRST_ASKABLE + randomBelow(LAST_ASKABLE - FIRST_ASKABLE + 1);
}

/** 0..n-1 from crypto.getRandomValues (n ≤ 256; 8 here, which divides 256 evenly: no bias). */
function secureRandomBelow(n) {
  const byte = new Uint8Array(1);
  globalThis.crypto.getRandomValues(byte);
  return byte[0] % n;
}

/** Does the typed text match box `index` of the address? (Spaces and capitals don't matter.) */
export function groupMatches(address, index, typed) {
  const group = addressGroups(address)[index];
  const t = String(typed || '').replace(/\s+/g, '').toLowerCase();
  return !!group && t.length === group.length && t === group.toLowerCase();
}

/**
 * isRelaxing — do the new rules make the Signer LESS strict anywhere?
 * If so, saving them needs the password.
 */
export function isRelaxing(oldRules, newRules) {
  const o = { ...DEFAULT_RULES, ...(oldRules || {}) };
  const n = { ...DEFAULT_RULES, ...(newRules || {}) };
  for (const key of RULE_SWITCHES) {
    if (o[key] && !n[key]) return true;
  }
  if (o.klvThreshold && (!n.klvThreshold || BigInt(n.klvThreshold) > BigInt(o.klvThreshold))) return true;
  if (n.waitSeconds < o.waitSeconds) return true;
  const oldTrusted = new Set(o.trusted || []);
  if ((n.trusted || []).some((a) => !oldTrusted.has(a))) return true;
  return false;
}

/**
 * History after a request arrived (for the burst rule). Keeps the last 10
 * minutes (at most 20 entries); the same transaction shown again isn't
 * added twice; times in the future (clock changed) are dropped.
 */
export function withRequest(history, now, hash) {
  const h = { ...EMPTY_HISTORY, ...(history || {}) };
  const kept = (h.recent || []).filter((e) => e && now - e.t >= 0 && now - e.t < 10 * 60 * 1000 && e.h !== hash);
  return { ...h, recent: [...kept, { t: now, h: hash }].slice(-20) };
}

export const MAX_RECEIVERS = 200;
export const MAX_APPS = 100;

/** Keeps the `max` most recently used entries of { key: time }. */
function newest(map, max) {
  return Object.fromEntries(Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, max));
}

/** History after a successful signature: remembers the receivers and the app. */
export function withSigned(history, reading, appId, now) {
  const h = { ...EMPTY_HISTORY, ...(history || {}) };
  const receivers = { ...(h.receivers || {}) };
  for (const t of reading.transfers) receivers[receiverKey(t.to)] = now;
  const apps = { ...(h.apps || {}) };
  if (appId) apps[appId] = now;
  const signed = [
    ...(h.signed || []).filter((e) => e && now - e.t >= 0 && now - e.t < REPEAT_WINDOW_MS),
    ...reading.transfers.map((t) => ({ t: now, k: transferKey(t) })),
  ].slice(-MAX_SIGNED);
  return { ...h, receivers: newest(receivers, MAX_RECEIVERS), apps: newest(apps, MAX_APPS), signed };
}

/** Checks saved rules are well-formed (throws if not, so the Signer asks for the extra confirmation to be safe). */
export function checkRules(rules) {
  const r = { ...DEFAULT_RULES, ...(rules || {}) };
  const ok = (r.klvThreshold === null || /^[1-9]\d{0,30}$/.test(String(r.klvThreshold)))
    && WAIT_CHOICES.includes(r.waitSeconds)
    && Array.isArray(r.trusted) && r.trusted.every((a) => typeof a === 'string')
    && RULE_SWITCHES.every((k) => typeof r[k] === 'boolean');
  if (!ok) throw new Error('The saved extra-confirmation settings are damaged.');
  return r;
}
