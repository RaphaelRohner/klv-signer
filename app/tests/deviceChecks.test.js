/*
 * deviceChecks.test.js — automatic checks for the phone-safety warnings
 * =====================================================================
 * Checks src/security/deviceChecks.js: which facts lead to which warning.
 * Run with `npm test` from the `app` folder.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeDeviceSecurity, DEVICE_CHECK_LIMIT, isSigningBlocked, SIGNING_BLOCKED_TEXT,
} from '../src/security/deviceChecks.js';

const SAFE = {
  suBinary: false, testKeys: false, rootApps: [], verifiedBootState: 'green', flashLocked: '1', screenLockSet: true,
  keyboard: { package: 'com.google.android.inputmethod.latin', label: 'Gboard', trusted: true },
  accessibilityApps: [],
};
const findingsOf = (report) => describeDeviceSecurity(report).findings;
const ids = (report) => describeDeviceSecurity(report).findings.map((f) => f.id);

test('a normal, locked phone gets no warning', () => {
  assert.deepEqual(describeDeviceSecurity(SAFE), { checked: true, findings: [] });
});

test('no report (check could not run) means nothing checked, not "safe"', () => {
  assert.deepEqual(describeDeviceSecurity(null), { checked: false, findings: [] });
});

test('any sign of root gives one root warning naming what was found', () => {
  assert.deepEqual(ids({ ...SAFE, suBinary: true }), ['root']);
  assert.deepEqual(ids({ ...SAFE, testKeys: true }), ['root']);
  const r = describeDeviceSecurity({ ...SAFE, suBinary: true, rootApps: ['com.topjohnwu.magisk'] });
  assert.equal(r.findings.length, 1);
  assert.match(r.findings[0].text, /su.*superuser/);
  assert.match(r.findings[0].text, /com\.topjohnwu\.magisk/);
});

test('bootloader states map to the right warning', () => {
  assert.deepEqual(ids({ ...SAFE, verifiedBootState: 'orange' }), ['bootloader']);
  assert.deepEqual(ids({ ...SAFE, verifiedBootState: null, flashLocked: '0' }), ['bootloader']);
  assert.deepEqual(ids({ ...SAFE, verifiedBootState: 'yellow' }), ['customOs']);
  assert.deepEqual(ids({ ...SAFE, verifiedBootState: 'red' }), ['bootFailed']);
  // Unreadable values (null) are not treated as a problem.
  assert.deepEqual(ids({ ...SAFE, verifiedBootState: null, flashLocked: null }), []);
});

test('a missing screen lock is warned about', () => {
  assert.deepEqual(ids({ ...SAFE, screenLockSet: false }), ['noScreenLock']);
});

test('several problems give several warnings, root first', () => {
  assert.deepEqual(ids({ ...SAFE, rootApps: ['me.weishu.kernelsu'], verifiedBootState: 'orange', screenLockSet: false }),
    ['root', 'bootloader', 'noScreenLock']);
});

test('the limit of these checks is stated honestly', () => {
  assert.match(DEVICE_CHECK_LIMIT, /can hide/);
});

test('root, unlocked bootloader and a failed startup check switch signing off', () => {
  assert.equal(isSigningBlocked(findingsOf({ ...SAFE, suBinary: true })), true);
  assert.equal(isSigningBlocked(findingsOf({ ...SAFE, verifiedBootState: 'orange' })), true);
  assert.equal(isSigningBlocked(findingsOf({ ...SAFE, verifiedBootState: 'red' })), true);
  assert.match(SIGNING_BLOCKED_TEXT, /recovery words/);
});

test('warnings only do NOT switch signing off', () => {
  assert.equal(isSigningBlocked([]), false);
  assert.equal(isSigningBlocked(undefined), false);
  assert.equal(isSigningBlocked(findingsOf({ ...SAFE, screenLockSet: false })), false);
  assert.equal(isSigningBlocked(findingsOf({ ...SAFE, verifiedBootState: 'yellow' })), false); // custom Android: warn only
  assert.equal(isSigningBlocked(findingsOf({
    ...SAFE,
    keyboard: { package: 'x.fancy.keys', label: 'Fancy Keys', trusted: false },
    accessibilityApps: [{ package: 'x.cleaner', label: 'Cleaner', cameWithPhone: false, isTool: false }],
  })), false);
});

test('a keyboard you installed yourself is named in a warning', () => {
  const f = findingsOf({ ...SAFE, keyboard: { package: 'x.fancy.keys', label: 'Fancy Keys', trusted: false } });
  assert.deepEqual(f.map((x) => x.id), ['keyboard']);
  assert.match(f[0].title, /Fancy Keys/);
  assert.match(f[0].text, /x\.fancy\.keys/);
  // Unknown keyboard (Android wouldn't say) is not a warning
  assert.deepEqual(ids({ ...SAFE, keyboard: null }), []);
});

test('apps with accessibility access are named, apps that came with the phone are not', () => {
  const f = findingsOf({
    ...SAFE,
    accessibilityApps: [
      { package: 'com.google.android.marvin.talkback', label: 'TalkBack', cameWithPhone: true, isTool: true },
      { package: 'x.cleaner', label: 'Super Cleaner', cameWithPhone: false, isTool: false },
    ],
  });
  assert.deepEqual(f.map((x) => x.id), ['accessibility']);
  assert.match(f[0].text, /Super Cleaner/);
  assert.doesNotMatch(f[0].text, /TalkBack/);
  assert.deepEqual(ids({ ...SAFE, accessibilityApps: [{ package: 'a', label: 'A', cameWithPhone: true, isTool: true }] }), []);
});
