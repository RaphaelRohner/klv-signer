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
