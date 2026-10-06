/*
 * appTrust.js — which apps you've allowed to talk to the Signer
 * =============================================================
 *
 * The first time an app asks, you decide whether to allow it. The Signer
 * remembers each allowed app by two things Android tells it (the app can't
 * fake either):
 *   - its package id, e.g. com.raphaelrohner.devikinslegacyhub (unique on the phone)
 *   - the fingerprint of the certificate it was signed with (unique to its developer)
 *
 * If a remembered app shows up with a DIFFERENT certificate, it's not the
 * same app, for example a fake one installed after the real one was removed.
 * Then the Signer asks again, with a warning.
 *
 * Pure calculations (no storage). Saving is done in storage/connectedApps.js.
 */

/**
 * trustStatus — is this caller allowed?
 * @param {object} apps     the remembered apps: { [package]: { label, certSha256, allowedAt } }
 * @param {object} request  { callerPackage, callerCertSha256 }
 * @returns {'allowed' | 'unknown' | 'certChanged'}
 */
export function trustStatus(apps, request) {
  const known = apps && apps[request.callerPackage];
  if (!known) return 'unknown';
  if (!request.callerCertSha256 || known.certSha256 !== request.callerCertSha256) return 'certChanged';
  return 'allowed';
}

/** withApp — the list with this caller added (or updated). */
export function withApp(apps, request, now = Date.now()) {
  return {
    ...(apps || {}),
    [request.callerPackage]: {
      label: request.callerLabel,
      certSha256: request.callerCertSha256,
      allowedAt: now,
    },
  };
}

/**
 * cleanLabel — an app's name as Android reports it, made safe to show. The
 * name is chosen by the app itself, so a harmful app could put invisible or
 * direction-changing characters or line breaks in it to fake screen content.
 * Those are removed, spaces collapsed, and it's cut to 40 characters.
 */
export function cleanLabel(label) {
  const text = String(label || '')
    .replace(/[\p{C}\u2028\u2029\u115F\u1160\u3164\uFFA0\u2800\uFFFC\u034F\u17B4\u17B5\u180B-\u180F\uFE00-\uFE0F\p{Me}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '(no name)';
  // A name mixing right-to-left letters with other letters or digits can show
  // its parts in a different order than written (weekly check, 6 Oct 2026):
  // shown in parts the screen can't reorder, the app id below stays the check.
  const rtl = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}]/u;
  const other = /[\p{N}]|(?![\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}])\p{L}/u;
  if (rtl.test(text) && other.test(text)) return '(name in mixed writing directions: check the app id)';
  const chars = [...text];
  return chars.length > 40 ? `${chars.slice(0, 40).join('')}…` : text;
}

/** withoutApp — the list with this package removed. */
export function withoutApp(apps, packageName) {
  const copy = { ...(apps || {}) };
  delete copy[packageName];
  return copy;
}

/**
 * shortFingerprint — "a1b2c3d4…e5f6a7b8", for showing a certificate fingerprint
 * in a readable length. (For apps signed with several certificates, the first one.)
 */
export function shortFingerprint(certSha256) {
  if (!certSha256) return 'unknown';
  const first = certSha256.split(',')[0];
  return first.length > 20 ? `${first.slice(0, 8)}…${first.slice(-8)}` : first;
}
