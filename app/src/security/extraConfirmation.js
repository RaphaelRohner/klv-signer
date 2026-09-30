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

/** How many characters of each receiver address you type. */
export const ADDRESS_ENDING_LENGTH = 6;
/** Burst rule: this many requests (including the current one) within BURST_WINDOW_MS. */
export const BURST_COUNT = 3;
export const BURST_WINDOW_MS = 2 * 60 * 1000;
/** Waiting times offered on the settings screen, in seconds. */
export const WAIT_CHOICES = [0, 10, 30];

/** The rules a new Signer starts with: helpful, not annoying. */
export const DEFAULT_RULES = Object.freeze({
  version: 1,
  klvThreshold: null,      // smallest units as text, e.g. "100000000" = 100 KLV; null = off
  newReceiver: true,
  otherTokens: false,
  nfts: false,
  firstAppRequest: true,
  multiTransfer: true,
  burst: true,
  waitSeconds: 0,
  trusted: [],             // klv1… addresses
});

// receivers: { last 16 characters of address: time last signed }
// apps:      { app ID: time last signed }
// recent:    [{ t: time, h: transaction fingerprint }]  (requests, for the burst rule)
export const EMPTY_HISTORY = Object.freeze({ receivers: {}, apps: {}, recent: [] });

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
  return `${address.slice(0, 8)}…${address.slice(-ADDRESS_ENDING_LENGTH)}`;
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
    const total = watched.filter((t) => t.assetId === 'KLV').reduce((sum, t) => sum + BigInt(t.amount), 0n);
    const limit = BigInt(r.klvThreshold);
    if (total > limit) {
      reasons.push({ id: 'amount', text: `It sends ${formatKlv(total)} KLV, more than your ${formatKlv(limit)} KLV setting.` });
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

  if (r.burst) {
    // Other requests in the last 2 minutes (the same transaction shown again doesn't count twice).
    const recent = (h.recent || []).filter((e) => e && e.h !== reading.hashHex && now - e.t >= 0 && now - e.t < BURST_WINDOW_MS);
    if (recent.length + 1 >= BURST_COUNT) {
      reasons.push({ id: 'burst', text: `It's request number ${recent.length + 1} within 2 minutes.` });
    }
  }

  return reasons;
}

/** The receiver addresses whose endings you must type (each once). */
export function receiversToConfirm(reading) {
  return [...new Set(reading.transfers.map((t) => t.to))];
}

/** Does the typed text match the address ending? (Spaces and capitals don't matter.) */
export function endingMatches(address, typed) {
  const t = String(typed || '').trim().toLowerCase();
  return t.length === ADDRESS_ENDING_LENGTH && address.toLowerCase().endsWith(t);
}

/**
 * isRelaxing — do the new rules make the Signer LESS strict anywhere?
 * If so, saving them needs the password.
 */
export function isRelaxing(oldRules, newRules) {
  const o = { ...DEFAULT_RULES, ...(oldRules || {}) };
  const n = { ...DEFAULT_RULES, ...(newRules || {}) };
  for (const key of ['newReceiver', 'otherTokens', 'nfts', 'firstAppRequest', 'multiTransfer', 'burst']) {
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
  return { ...h, receivers: newest(receivers, MAX_RECEIVERS), apps: newest(apps, MAX_APPS) };
}

/** Checks saved rules are well-formed (throws if not, so the Signer asks for the extra confirmation to be safe). */
export function checkRules(rules) {
  const r = { ...DEFAULT_RULES, ...(rules || {}) };
  const ok = (r.klvThreshold === null || /^[1-9]\d{0,30}$/.test(String(r.klvThreshold)))
    && WAIT_CHOICES.includes(r.waitSeconds)
    && Array.isArray(r.trusted) && r.trusted.every((a) => typeof a === 'string')
    && ['newReceiver', 'otherTokens', 'nfts', 'firstAppRequest', 'multiTransfer', 'burst'].every((k) => typeof r[k] === 'boolean');
  if (!ok) throw new Error('The saved extra-confirmation settings are damaged.');
  return r;
}
