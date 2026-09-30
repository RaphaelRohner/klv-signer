/*
 * deviceChecks.test.js — automatic checks for the phone-safety warnings
 * =====================================================================
 * Checks src/security/deviceChecks.js: which facts lead to which warning.
 * Run with `npm test` from the `app` folder.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeDeviceSecurity, DEVICE_CHECK_LIMIT } from '../src/security/deviceChecks.js';

const SAFE = {
  suBinary: false, testKeys: false, rootApps: [], verifiedBootState: 'green', flashLocked: '1', screenLockSet: true,
};
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
