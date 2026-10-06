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

/** Lowest Android version allowed: 12 (SDK 31). Older versions lack protections the Signer relies on. */
export const MIN_SDK = 31;

/**
 * Screens and services other apps may open. Only these two are meant to be
 * open: the home-screen icon and the request screen (by exact name).
 */
export const ALLOWED_OPEN_COMPONENTS = [
  'com.raphaelrohner.klvsigner.MainActivity',
  REQUEST_ACTIVITY,
];

/**
 * Libraries sometimes add open parts guarded by a permission that only
 * Android itself (or a computer connected by cable with developer tools)
 * holds. Those are fine. Example: androidx's ProfileInstallReceiver uses DUMP.
 */
export const SYSTEM_ONLY_PERMISSIONS = [
  'android.permission.DUMP',
  'android.permission.BIND_JOB_SERVICE',
];

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
 * → { packageName, versionCode, versionName, minSdk, permissions: [...], debuggable }
 */
export function parseBadging(text) {
  const lines = String(text || '').split(/\r?\n/);
  const pkg = lines.find((l) => l.startsWith('package:')) || '';
  const field = (name) => (pkg.match(new RegExp(`\\b${name}='([^']*)'`)) || [])[1];
  const permissions = lines
    .map((l) => l.match(/^uses-permission(?:-sdk-23)?: name='([^']+)'/))
    .filter(Boolean)
    .map((m) => m[1]);
  const sdk = lines.map((l) => l.match(/^(?:minSdkVersion|sdkVersion):'(\d+)'/)).find(Boolean);
  return {
    packageName: field('name') || null,
    minSdk: sdk ? Number(sdk[1]) : null,
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

  // 2b. Oldest Android it installs on (weekly check, 6 Oct 2026).
  if (!Number.isInteger(badging.minSdk)) problems.push('No minimum Android version found (minSdkVersion).');
  else if (badging.minSdk < MIN_SDK) problems.push(`Installs on Android older than 12 (minSdkVersion ${badging.minSdk}, must be ${MIN_SDK} or higher).`);

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
  else {
    if (app.attrs.allowBackup !== 'false') problems.push('Android backup is not switched off (allowBackup).');
    // Third review A10: explicit "copy nothing" rules for backup and phone-to-phone transfer.
    if (!app.attrs.dataExtractionRules) problems.push('The "copy nothing to a new phone" rules are missing (dataExtractionRules; plugins/withSignerHardening.js).');
  }

  // 5. No public entry points: no browsable links, and the request screen
  //    reachable only by exact name (no intent filter).
  // Only the app's own screens count (activity / activity-alias). A
  // <queries> entry with "BROWSABLE" just says the app may look for web
  // browsers on the phone (Expo adds one); it opens no way in.
  const screens = [...findAll(manifest, 'activity'), ...findAll(manifest, 'activity-alias')];
  const browsable = screens.some((a) => findAll(a, 'category').some((c) => c.attrs.name === 'android.intent.category.BROWSABLE'));
  if (browsable) problems.push('A screen of the app has a browsable link filter (a "scheme" in app.json?). The Signer must have none.');
  // Third review A4: the main screen shares no task with other apps.
  const mainScreen = findAll(manifest, 'activity').find((a) => /\.MainActivity$/.test(a.attrs.name || ''));
  if (!mainScreen) problems.push('The main screen (MainActivity) is missing.');
  else if (mainScreen.attrs.taskAffinity !== '') problems.push('The main screen has no empty taskAffinity (plugins/withSignerHardening.js).');
  const requestScreen = findAll(manifest, 'activity').find((a) => a.attrs.name === REQUEST_ACTIVITY);
  if (!requestScreen) problems.push(`The request screen ${REQUEST_ACTIVITY} is missing.`);
  else if (findAll(requestScreen, 'intent-filter').length > 0) problems.push('The request screen has an intent filter. It must be reachable only by exact name.');

  // 6. No other open entry points (weekly check, 6 Oct 2026). A library
  //    update could quietly add a screen, service, receiver or provider that
  //    other apps can reach. "Open" = exported="true", or an intent filter
  //    without an exported setting. Allowed: the two screens above, and parts
  //    guarded by a permission only Android itself holds.
  const kinds = ['activity', 'activity-alias', 'service', 'receiver', 'provider'];
  for (const part of kinds.flatMap((k) => findAll(manifest, k).map((node) => ({ k, node })))) {
    const { exported, name, permission } = part.node.attrs;
    const open = exported === 'true' || (exported === undefined && findAll(part.node, 'intent-filter').length > 0);
    if (!open || ALLOWED_OPEN_COMPONENTS.includes(name) || SYSTEM_ONLY_PERMISSIONS.includes(permission)) continue;
    problems.push(`Other apps can reach the ${part.k} ${name}${permission ? ` (guarded only by ${permission})` : ''}. Check where it comes from before publishing.`);
  }

  return problems;
}
