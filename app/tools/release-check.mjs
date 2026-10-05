#!/usr/bin/env node
/*
 * release-check.mjs — check a finished Signer APK before publishing it
 * ===================================================================
 *
 * Run from the `app` folder:
 *
 *     node tools/release-check.mjs klv-signer-0.2.0.apk
 *
 * It asks Android's own tools (from the Android SDK on this Mac, which local
 * builds already need) and checks, in plain words:
 *
 *   1. The SEAL: the signature is valid (nothing changed after signing),
 *      there's exactly one signer, and it's the official KLV Signer key.
 *   2. The APP: the right app id, and a versionCode higher than every
 *      earlier release (tools/released-versions.json), so Android never
 *      lets an older version be installed over a newer one.
 *   3. PERMISSIONS: no internet (or any other removed permission), and the
 *      overlay protection present.
 *   4. Not a debug build; Android backup switched off.
 *   5. No public entry points: no browsable link filter, and the request
 *      screen reachable only by its exact name.
 *
 * Only if EVERYTHING passes does it print OK, the CHECKSUM (SHA-256 of the
 * whole file, for the release notes) and write `<apk name>.sha256` to upload
 * with the APK. Otherwise it says STOP and why, and writes nothing.
 *
 * The rules themselves are in tools/apkChecks.mjs (tested by
 * tests/releaseCheck.test.js). Third AI review, 5 Oct 2026 (R3, R4, R6).
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { checkApk, parseApksigner, parseBadging, parseManifestTree } from './apkChecks.mjs';

/**
 * The Signer's official signing-key fingerprint (SHA-256 of its certificate).
 * Also published in README.md and SIGNER-PROTOCOL.md. Never change this
 * unless the key itself is (deliberately) replaced.
 */
const OFFICIAL_FINGERPRINT =
  '82D09DD7D327A48DDB97EE05FEEC0A8CF414C4817F0FB7268B8A88F0257E8611';

/** "AABB…" → "AA:BB:…" (the way Android tools show fingerprints). */
const withColons = (hex) => hex.match(/../g).join(':');

/**
 * Reads the signing certificates straight out of the APK's "signing block"
 * (v2/v3/v3.1), as a second, independent reading next to apksigner's.
 */
function signingFingerprints(apk) {
  const eocd = apk.lastIndexOf(Buffer.from('504b0506', 'hex'));
  if (eocd < 0) throw new Error('This is not an APK (no ZIP directory found).');
  const cdOffset = apk.readUInt32LE(eocd + 16);
  if (apk.toString('latin1', cdOffset - 16, cdOffset) !== 'APK Sig Block 42') {
    throw new Error('This APK has no modern signature (v2/v3). Was it signed at all?');
  }
  const blockSize = Number(apk.readBigUInt64LE(cdOffset - 24));
  const blockStart = cdOffset - blockSize - 8;
  const piece = (buf, at) => {
    const len = buf.readUInt32LE(at);
    return [buf.subarray(at + 4, at + 4 + len), at + 4 + len];
  };
  const found = new Set();
  let at = blockStart + 8;
  while (at < cdOffset - 24) {
    const len = Number(apk.readBigUInt64LE(at));
    const id = apk.readUInt32LE(at + 8);
    if (id === 0x7109871a || id === 0xf05368c0 || id === 0x1b93ad61) { // v2, v3, v3.1
      const value = apk.subarray(at + 12, at + 8 + len);
      const [signers] = piece(value, 0);
      let pos = 0;
      while (pos < signers.length) {
        const [signer, next] = piece(signers, pos);
        pos = next;
        const [signedData] = piece(signer, 0);
        const [, afterDigests] = piece(signedData, 0);
        const [certs] = piece(signedData, afterDigests);
        let c = 0;
        while (c < certs.length) {
          const [cert, nextCert] = piece(certs, c);
          c = nextCert;
          found.add(createHash('sha256').update(cert).digest('hex').toUpperCase());
        }
      }
    }
    at += 8 + len;
  }
  if (found.size === 0) throw new Error('No signing certificate found in this APK.');
  return [...found];
}

/** Finds apksigner and aapt2 in the newest "build-tools" of the Android SDK. */
function findBuildTools() {
  const sdks = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    join(homedir(), 'Library', 'Android', 'sdk'), // Mac default (Android Studio)
    join(homedir(), 'Android', 'Sdk'), // Linux default
  ].filter(Boolean);
  for (const sdk of sdks) {
    const dir = join(sdk, 'build-tools');
    if (!existsSync(dir)) continue;
    // Usually "36.0.0", "35.0.1"…; newest first (any other folder name last).
    const versions = readdirSync(dir).sort((a, b) => {
      const na = /^\d/.test(a);
      const nb = /^\d/.test(b);
      if (na !== nb) return na ? -1 : 1;
      return b.localeCompare(a, undefined, { numeric: true });
    });
    for (const v of versions) {
      const apksigner = join(dir, v, 'apksigner');
      const aapt2 = join(dir, v, 'aapt2');
      if (existsSync(apksigner) && existsSync(aapt2)) return { apksigner, aapt2, version: v };
    }
  }
  return null;
}

/** Runs a tool and returns its output, also when it ends with an error (apksigner does that for bad signatures). */
function run(tool, args) {
  try {
    return execFileSync(tool, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    return `${e.stdout || ''}\n${e.stderr || ''}\nDOES NOT VERIFY (tool error)`;
  }
}

function stop(lines) {
  console.error('\nSTOP: don\'t publish this APK.');
  for (const l of lines) console.error(`  - ${l}`);
  console.error('');
  process.exit(1);
}

// ---------------------------------------------------------------------------

const file = process.argv[2];
if (!file) {
  console.error('Usage: node tools/release-check.mjs klv-signer-0.2.0.apk');
  process.exit(2);
}

const tools = findBuildTools();
if (!tools) {
  stop([
    "Android's build tools (apksigner, aapt2) weren't found.",
    'They come with the Android SDK that local builds use. Set ANDROID_HOME to the SDK folder',
    '(usually ~/Library/Android/sdk), or install "Android SDK Build-Tools" in Android Studio → SDK Manager.',
  ]);
}

const here = fileURLToPath(new URL('.', import.meta.url));
const released = JSON.parse(readFileSync(join(here, 'released-versions.json'), 'utf8'));
const releasedVersionCodes = released.map((r) => r.versionCode);

const apk = readFileSync(file);
const checksum = createHash('sha256').update(apk).digest('hex');
let ownFingerprints;
try {
  ownFingerprints = signingFingerprints(apk);
} catch (e) {
  stop([e.message]);
}

const signer = parseApksigner(run(tools.apksigner, ['verify', '--verbose', '--print-certs', file]));
const badging = parseBadging(run(tools.aapt2, ['dump', 'badging', file]));
const manifest = parseManifestTree(run(tools.aapt2, ['dump', 'xmltree', '--file', 'AndroidManifest.xml', file]));

const problems = checkApk({
  signer, badging, manifest, ownFingerprints, official: OFFICIAL_FINGERPRINT, releasedVersionCodes,
});

console.log(`\nAPK:                 ${basename(file)} (${(apk.length / 1e6).toFixed(1)} MB)`);
console.log(`App / version:       ${badging.packageName} ${badging.versionName} (versionCode ${badging.versionCode})`);
console.log(`Signing key:         ${(signer.fingerprints.length ? signer.fingerprints : ownFingerprints).map(withColons).join('\n                     ')}`);
console.log(`Checked with:        Android build-tools ${tools.version}`);

if (problems.length) {
  console.error(`Official key:        ${withColons(OFFICIAL_FINGERPRINT)}`);
  stop(problems);
}

writeFileSync(`${file}.sha256`, `${checksum}  ${basename(file)}\n`);
console.log(`Checksum (SHA-256):  ${checksum}`);
console.log(`Checksum file:       ${basename(file)}.sha256 (upload it with the APK)\n`);
console.log('OK: valid signature with the official KLV Signer key, no internet or other removed permissions,');
console.log('    not debuggable, backup off, no public entry points, version higher than every earlier release.');
console.log(`After publishing: add { "version": "${badging.versionName}", "versionCode": ${badging.versionCode} } to tools/released-versions.json.\n`);
