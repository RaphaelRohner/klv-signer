/*
 * releaseCheck.test.js — the rules a published APK must pass
 * ==========================================================
 * Checks tools/apkChecks.mjs (used by tools/release-check.mjs) with sample
 * output of Android's own tools: a good APK passes; each kind of bad APK is
 * stopped with a plain reason. Third AI review, 5 Oct 2026 (R3, R4).
 * Run with `npm test` from the `app` folder.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkApk, parseApksigner, parseBadging, parseManifestTree, plainHex,
} from '../tools/apkChecks.mjs';

const OFFICIAL = '82D09DD7D327A48DDB97EE05FEEC0A8CF414C4817F0FB7268B8A88F0257E8611';
const OTHER = 'AB'.repeat(32);

const signerOutput = (fp = OFFICIAL.toLowerCase(), verifies = true) => `${verifies ? 'Verifies' : 'DOES NOT VERIFY\nERROR: APK Signature Scheme v2 signer #1: APK integrity check failed.'}
Verified using v1 scheme (JAR signing): false
Verified using v2 scheme (APK Signature Scheme v2): true
Verified using v3 scheme (APK Signature Scheme v3): true
Verified using v3.1 scheme (APK Signature Scheme v3.1): false
Verified using v4 scheme (APK Signature Scheme v4): false
Verified for SourceStamp: false
Number of signers: 1
Signer #1 certificate DN: CN=Unknown
Signer #1 certificate SHA-256 digest: ${fp}
Signer #1 certificate SHA-1 digest: 0000000000000000000000000000000000000000
Signer #1 certificate MD5 digest: 00000000000000000000000000000000
`;

const badgingOutput = ({ versionCode = 2, extraPerms = [], debuggable = false, pkg = 'com.raphaelrohner.klvsigner', overlay = true } = {}) => [
  `package: name='${pkg}' versionCode='${versionCode}' versionName='0.2.0' platformBuildVersionName='16' platformBuildVersionCode='36' compileSdkVersion='36' compileSdkVersionCodename='16'`,
  "minSdkVersion:'31'",
  "targetSdkVersion:'36'",
  "uses-permission: name='android.permission.USE_BIOMETRIC'",
  "uses-permission: name='android.permission.USE_FINGERPRINT'",
  overlay ? "uses-permission: name='android.permission.HIDE_OVERLAY_WINDOWS'" : '',
  "uses-permission: name='android.permission.DETECT_SCREEN_CAPTURE'",
  ...extraPerms.map((p) => `uses-permission: name='${p}'`),
  "application-label:'KLV Signer'",
  "application: label='KLV Signer' icon='res/mipmap-anydpi-v26/ic_launcher.xml'",
  debuggable ? 'application-debuggable' : '',
  "launchable-activity: name='com.raphaelrohner.klvsigner.MainActivity'  label='' icon=''",
].join('\n');

const A = 'http://schemas.android.com/apk/res/android';
const manifestOutput = ({ allowBackup = 'false', browsable = false, requestFilter = false, typedBool = false, rules = true, affinity = true } = {}) => `N: android=${A} (line=2)
  E: manifest (line=2)
    A: ${A}:versionCode(0x0101021b)=2
    A: ${A}:versionName(0x0101021c)="0.2.0" (Raw: "0.2.0")
    A: package="com.raphaelrohner.klvsigner" (Raw: "com.raphaelrohner.klvsigner")
      E: queries (line=8)
          E: intent (line=9)
              E: action (line=9)
                A: ${A}:name(0x01010003)="android.intent.action.VIEW" (Raw: "android.intent.action.VIEW")
              E: category (line=9)
                A: ${A}:name(0x01010003)="android.intent.category.BROWSABLE" (Raw: "android.intent.category.BROWSABLE")
              E: data (line=9)
                A: ${A}:scheme(0x01010027)="https" (Raw: "https")
      E: uses-permission (line=10)
        A: ${A}:name(0x01010003)="android.permission.HIDE_OVERLAY_WINDOWS" (Raw: "android.permission.HIDE_OVERLAY_WINDOWS")
      E: application (line=20)
        A: ${A}:label(0x01010001)=@0x7f0f0001
        A: ${A}:allowBackup(0x01010280)=${typedBool ? (allowBackup === 'false' ? '(type 0x12)0x0' : '(type 0x12)0xffffffff') : allowBackup}
${rules ? `        A: ${A}:dataExtractionRules(0x0101063a)=@0x7f150000
` : ''}
          E: activity (line=30)
            A: ${A}:name(0x01010003)="com.raphaelrohner.klvsigner.MainActivity" (Raw: "com.raphaelrohner.klvsigner.MainActivity")
${affinity ? `            A: ${A}:taskAffinity(0x01010012)="" (Raw: "")
` : ''}
            A: ${A}:exported(0x01010010)=true
              E: intent-filter (line=35)
                  E: action (line=36)
                    A: ${A}:name(0x01010003)="android.intent.action.MAIN" (Raw: "android.intent.action.MAIN")
                  E: category (line=37)
                    A: ${A}:name(0x01010003)="android.intent.category.LAUNCHER" (Raw: "android.intent.category.LAUNCHER")
${browsable ? `              E: intent-filter (line=40)
                  E: action (line=41)
                    A: ${A}:name(0x01010003)="android.intent.action.VIEW" (Raw: "android.intent.action.VIEW")
                  E: category (line=42)
                    A: ${A}:name(0x01010003)="android.intent.category.BROWSABLE" (Raw: "android.intent.category.BROWSABLE")
                  E: data (line=43)
                    A: ${A}:scheme(0x01010027)="klvsigner" (Raw: "klvsigner")
` : ''}          E: activity (line=50)
            A: ${A}:name(0x01010003)="com.raphaelrohner.klvsigner.requests.SignRequestActivity" (Raw: "com.raphaelrohner.klvsigner.requests.SignRequestActivity")
            A: ${A}:exported(0x01010010)=true
${requestFilter ? `              E: intent-filter (line=55)
                  E: action (line=56)
                    A: ${A}:name(0x01010003)="com.raphaelrohner.klvsigner.action.SIGN_TRANSACTION" (Raw: "com.raphaelrohner.klvsigner.action.SIGN_TRANSACTION")
` : ''}          E: activity (line=60)
            A: ${A}:name(0x01010003)="expo.modules.devlauncher.Other" (Raw: "expo.modules.devlauncher.Other")
`;

function facts(overrides = {}) {
  return {
    signer: parseApksigner(overrides.signer ?? signerOutput()),
    badging: parseBadging(overrides.badging ?? badgingOutput()),
    manifest: parseManifestTree(overrides.manifest ?? manifestOutput()),
    ownFingerprints: overrides.ownFingerprints ?? [OFFICIAL],
    official: OFFICIAL,
    releasedVersionCodes: overrides.released ?? [1],
  };
}

test('the tools\' output is read correctly', () => {
  const s = parseApksigner(signerOutput());
  assert.equal(s.verifies, true);
  assert.equal(s.signerCount, 1);
  assert.deepEqual(s.fingerprints, [OFFICIAL]);
  assert.equal(s.schemes.v2, true);
  const b = parseBadging(badgingOutput());
  assert.equal(b.packageName, 'com.raphaelrohner.klvsigner');
  assert.equal(b.versionCode, 2);
  assert.equal(b.versionName, '0.2.0');
  assert.ok(b.permissions.includes('android.permission.HIDE_OVERLAY_WINDOWS'));
  assert.equal(b.debuggable, false);
  assert.equal(plainHex('82:d0:9d'), '82D09D');
});

test('a good APK passes every rule (a <queries> entry for web browsers is fine)', () => {
  assert.deepEqual(checkApk(facts()), []);
  // Older aapt2 versions print booleans as "(type 0x12)0x0".
  assert.deepEqual(checkApk(facts({ manifest: manifestOutput({ typedBool: true }) })), []);
});

test('the seal: an invalid signature, another key or a disagreement is stopped', () => {
  assert.match(checkApk(facts({ signer: signerOutput(OFFICIAL, false) })).join(' '), /NOT valid/);
  const other = checkApk(facts({ signer: signerOutput(OTHER), ownFingerprints: [OTHER] }));
  assert.match(other.join(' '), /different key/);
  assert.match(checkApk(facts({ ownFingerprints: [OTHER] })).join(' '), /don't agree/);
});

test('version: must be higher than every earlier release', () => {
  assert.match(checkApk(facts({ released: [2] })).join(' '), /isn't higher/);
  assert.match(checkApk(facts({ released: [1, 5] })).join(' '), /isn't higher than the last release \(5\)/);
  assert.deepEqual(checkApk(facts({ released: [] })), []);
});

test('permissions: internet (or any removed one) stops it; overlay protection must be there', () => {
  for (const p of ['android.permission.INTERNET', 'android.permission.ACCESS_NETWORK_STATE', 'android.permission.VIBRATE']) {
    assert.match(checkApk(facts({ badging: badgingOutput({ extraPerms: [p] }) })).join(' '), new RegExp(p));
  }
  assert.match(checkApk(facts({ badging: badgingOutput({ overlay: false }) })).join(' '), /HIDE_OVERLAY_WINDOWS/);
});

test('a debug build, backup on, or the wrong app id is stopped', () => {
  assert.match(checkApk(facts({ badging: badgingOutput({ debuggable: true }) })).join(' '), /debuggable/);
  assert.match(checkApk(facts({ manifest: manifestOutput({ allowBackup: 'true' }) })).join(' '), /backup/);
  assert.match(checkApk(facts({ manifest: manifestOutput({ allowBackup: 'true', typedBool: true }) })).join(' '), /backup/);
  assert.match(checkApk(facts({ badging: badgingOutput({ pkg: 'com.evil.klvsigner' }) })).join(' '), /Wrong app id/);
});

test('public entry points: a browsable link or a filter on the request screen is stopped', () => {
  assert.match(checkApk(facts({ manifest: manifestOutput({ browsable: true }) })).join(' '), /browsable/);
  assert.match(checkApk(facts({ manifest: manifestOutput({ requestFilter: true }) })).join(' '), /request screen has an intent filter/);
});

test('empty tool output (a tool failed) never passes', () => {
  const problems = checkApk({
    signer: parseApksigner(''), badging: parseBadging(''), manifest: parseManifestTree(''),
    ownFingerprints: [OFFICIAL], official: OFFICIAL, releasedVersionCodes: [],
  });
  assert.ok(problems.length >= 3);
});

test('the "copy nothing" rules and the empty taskAffinity must be there (third review, A10/A4)', () => {
  assert.match(checkApk(facts({ manifest: manifestOutput({ rules: false }) })).join(' '), /copy nothing/);
  assert.match(checkApk(facts({ manifest: manifestOutput({ affinity: false }) })).join(' '), /taskAffinity/);
});
