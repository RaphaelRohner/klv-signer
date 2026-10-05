/*
 * apkChecks.mjs — the rules a Signer APK must pass before it's published
 * =====================================================================
 *
 * Used by release-check.mjs. Kept separate (and free of file or tool access)
 * so the automatic tests can check every rule with sample tool output
 * (tests/releaseCheck.test.js).
 *
 * The facts come from Android's own tools, which ship with the Android SDK
 * that local builds already need:
 *   apksigner verify --verbose --print-certs <apk>   is the signature valid,
 *                                                     and by which key?
 *   aapt2 dump badging <apk>                          name, version, permissions,
 *                                                     debuggable?
 *   aapt2 dump xmltree --file AndroidManifest.xml <apk>
 *                                                     backup setting, link filters
 *
 * checkApk() returns a list of problems in plain words. Empty = OK.
 */

export const SIGNER_PACKAGE = 'com.raphaelrohner.klvsigner';
export const REQUEST_ACTIVITY = 'com.raphaelrohner.klvsigner.requests.SignRequestActivity';

/** Permissions a published Signer must NOT have (same list as app.json's blockedPermissions). */
export const FORBIDDEN_PERMISSIONS = [
  'android.permission.INTERNET',
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.ACCESS_WIFI_STATE',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.VIBRATE',
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
];

/** Permissions it MUST have (hides other apps' overlays on the Signer's screens). */
export const REQUIRED_PERMISSIONS = ['android.permission.HIDE_OVERLAY_WINDOWS'];

/** "aa:bb…" or "aabb…" → "AABB…". */
export const plainHex = (s) => String(s || '').replace(/[^0-9a-fA-F]/g, '').toUpperCase();

/**
 * Reads `apksigner verify --verbose --print-certs` output.
 * → { verifies, signerCount, fingerprints: ["AABB…"], schemes: { v2: true, … } }
 */
export function parseApksigner(text) {
  const lines = String(text || '').split(/\r?\n/);
  const fingerprints = [];
  const schemes = {};
  let signerCount = null;
  for (const line of lines) {
    const fp = line.match(/^Signer #\d+ certificate SHA-256 digest:\s*([0-9a-fA-F:]+)\s*$/);
    if (fp) fingerprints.push(plainHex(fp[1]));
    const n = line.match(/^Number of signers:\s*(\d+)/);
    if (n) signerCount = Number(n[1]);
    const scheme = line.match(/^Verified using (v[\d.]+) scheme.*:\s*(true|false)/);
    if (scheme) schemes[scheme[1]] = scheme[2] === 'true';
  }
  const verifies = lines.some((l) => l.trim() === 'Verifies') && !lines.some((l) => /DOES NOT VERIFY/.test(l));
  return { verifies, signerCount, fingerprints, schemes };
}

/**
 * Reads `aapt2 dump badging` output.
 * → { packageName, versionCode, versionName, permissions: [...], debuggable }
 */
export function parseBadging(text) {
  const lines = String(text || '').split(/\r?\n/);
  const pkg = lines.find((l) => l.startsWith('package:')) || '';
  const field = (name) => (pkg.match(new RegExp(`\\b${name}='([^']*)'`)) || [])[1];
  const permissions = lines
    .map((l) => l.match(/^uses-permission(?:-sdk-23)?: name='([^']+)'/))
    .filter(Boolean)
    .map((m) => m[1]);
  return {
    packageName: field('name') || null,
    versionCode: field('versionCode') ? Number(field('versionCode')) : null,
    versionName: field('versionName') || null,
    permissions,
    debuggable: lines.some((l) => l.trim() === 'application-debuggable'),
  };
}

/**
 * Reads `aapt2 dump xmltree --file AndroidManifest.xml` output into a tree of
 * { name, attrs: { allowBackup: 'false', name: 'com…', … }, children, depth }.
 * Elements are lines "E: <name> (line=…)", attributes "A: …:<attr>(0x…)=<value>",
 * nested by indentation.
 */
export function parseManifestTree(text) {
  const root = { name: '#root', attrs: {}, children: [], depth: -1 };
  const stack = [root];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const depth = raw.length - raw.trimStart().length;
    const line = raw.trim();
    const el = line.match(/^E: ([\w.-]+)/);
    const at = line.match(/^A: (?:[^=]*[:/])?([\w]+)(?:\(0x[0-9a-fA-F]+\))?=(.*)$/);
    if (el) {
      while (stack.length > 1 && stack[stack.length - 1].depth >= depth) stack.pop();
      const node = { name: el[1], attrs: {}, children: [], depth };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    } else if (at) {
      while (stack.length > 1 && stack[stack.length - 1].depth >= depth) stack.pop();
      stack[stack.length - 1].attrs[at[1]] = cleanValue(at[2]);
    }
  }
  return root;
}

/** '"text" (Raw: "text")' → 'text'; '(type 0x12)0x0' → 'false'; '(type 0x12)0xffffffff' → 'true'. */
function cleanValue(v) {
  const s = v.trim();
  const quoted = s.match(/^"([^"]*)"/);
  if (quoted) return quoted[1];
  const typedBool = s.match(/^\(type 0x12\)0x([0-9a-f]+)/i);
  if (typedBool) return Number.parseInt(typedBool[1], 16) === 0 ? 'false' : 'true';
  return s;
}

/** All elements with this name anywhere below `node`. */
export function findAll(node, name) {
  const out = [];
  for (const child of node.children) {
    if (child.name === name) out.push(child);
    out.push(...findAll(child, name));
  }
  return out;
}

/**
 * checkApk — every rule, in plain words. Returns [] when the APK may be published.
 *
 * @param {object} facts
 * @param {object} facts.signer      parseApksigner() result
 * @param {object} facts.badging     parseBadging() result
 * @param {object} facts.manifest    parseManifestTree() result
 * @param {string} facts.ownFingerprints  fingerprints read directly from the file (cross-check)
 * @param {string} facts.official    official fingerprint (plain hex)
 * @param {number[]} facts.releasedVersionCodes  versionCodes of earlier public releases
 */
export function checkApk({ signer, badging, manifest, ownFingerprints, official, releasedVersionCodes = [] }) {
  const problems = [];

  // 1. The seal: a valid signature, exactly one signer, the official key.
  if (!signer.verifies) problems.push('The signature is NOT valid (apksigner: DOES NOT VERIFY). The file was changed or damaged after signing.');
  if (signer.signerCount !== 1 || signer.fingerprints.length !== 1) {
    problems.push(`Expected exactly one signer, found ${signer.signerCount ?? signer.fingerprints.length}.`);
  } else if (signer.fingerprints[0] !== plainHex(official)) {
    problems.push('Signed with a different key than the official KLV Signer key.');
  }
  if (ownFingerprints && (ownFingerprints.length !== 1 || ownFingerprints[0] !== signer.fingerprints[0])) {
    problems.push("apksigner and this script's own reading of the certificate don't agree.");
  }

  // 2. Which app, which version.
  if (badging.packageName !== SIGNER_PACKAGE) problems.push(`Wrong app id: ${badging.packageName} (expected ${SIGNER_PACKAGE}).`);
  if (!Number.isInteger(badging.versionCode)) {
    problems.push('No versionCode found.');
  } else {
    const last = releasedVersionCodes.length ? Math.max(...releasedVersionCodes) : 0;
    if (badging.versionCode <= last) {
      problems.push(`versionCode ${badging.versionCode} isn't higher than the last release (${last}). Raise "versionCode" in app/app.json.`);
    }
  }

  // 3. Permissions: none of the forbidden ones, the required one present.
  for (const p of FORBIDDEN_PERMISSIONS) {
    if (badging.permissions.includes(p)) problems.push(`Has the forbidden permission ${p}.`);
  }
  for (const p of REQUIRED_PERMISSIONS) {
    if (!badging.permissions.includes(p)) problems.push(`Missing the permission ${p}.`);
  }

  // 4. Not a debug build; backups off.
  if (badging.debuggable) problems.push('This is a debuggable build. Never publish one.');
  const app = findAll(manifest, 'application')[0];
  if (!app) problems.push("Couldn't read the app's manifest.");
  else if (app.attrs.allowBackup !== 'false') problems.push('Android backup is not switched off (allowBackup).');

  // 5. No public entry points: no browsable links, and the request screen
  //    reachable only by exact name (no intent filter).
  const browsable = findAll(manifest, 'category').some((c) => c.attrs.name === 'android.intent.category.BROWSABLE');
  if (browsable) problems.push('The app has a browsable link filter (a "scheme" in app.json?). The Signer must have none.');
  const requestScreen = findAll(manifest, 'activity').find((a) => a.attrs.name === REQUEST_ACTIVITY);
  if (!requestScreen) problems.push(`The request screen ${REQUEST_ACTIVITY} is missing.`);
  else if (findAll(requestScreen, 'intent-filter').length > 0) problems.push('The request screen has an intent filter. It must be reachable only by exact name.');

  return problems;
}
