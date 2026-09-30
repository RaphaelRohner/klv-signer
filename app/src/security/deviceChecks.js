/*
 * deviceChecks.js — turns the phone-safety facts into plain-words warnings
 * ========================================================================
 *
 * The native check (modules/klv-signer-requests, DeviceSecurity.kt) reports
 * raw facts: is there a "su" program, which rooting apps are installed, what
 * state Android's startup check ("verified boot") is in, is a screen lock set.
 * This file decides which of those deserve a warning and says why, in words.
 *
 * The Signer only WARNS. It never refuses to work: it's your phone and your
 * decision. But a wallet on a rooted or unlocked phone is much easier to
 * attack, and you should know that before you trust it with real funds.
 *
 * Pure calculations (no screens, no native code), so the automated tests can
 * check them on a computer.
 */

/** Shown under every warning: what these checks can and can't tell. */
export const DEVICE_CHECK_LIMIT =
  'Rooting tools can hide from apps, so no warning doesn\'t prove a phone is safe. It only means none of the usual signs were found.';

/**
 * describeDeviceSecurity — which warnings to show.
 *
 * @param {object|null} report  facts from getDeviceSecurity():
 *   { suBinary, testKeys, rootApps: string[], verifiedBootState, flashLocked, screenLockSet }
 * @returns {{ checked: boolean, findings: { id: string, title: string, text: string }[] }}
 *   checked = false when the check couldn't run (e.g. in the tests on a computer)
 */
export function describeDeviceSecurity(report) {
  if (!report) return { checked: false, findings: [] };
  const findings = [];

  // 1. Signs of root
  const signs = [];
  if (report.suBinary) signs.push('a "su" superuser program');
  const apps = report.rootApps || [];
  if (apps.length > 0) signs.push(`the rooting app${apps.length > 1 ? 's' : ''} ${apps.join(', ')}`);
  if (report.testKeys) signs.push('an Android system built with public test keys');
  if (signs.length > 0) {
    findings.push({
      id: 'root',
      title: 'This phone looks rooted',
      text: `Found ${signs.join('; ')}. On a rooted phone, harmful apps can take full control and watch what the Signer does, including your key at the moment it signs.`,
    });
  }

  // 2. Android's startup check (verified boot)
  const boot = report.verifiedBootState;
  if (boot === 'orange' || report.flashLocked === '0') {
    findings.push({
      id: 'bootloader',
      title: 'The bootloader is unlocked',
      text: 'Android\'s startup check is switched off, so the operating system itself could have been changed without you noticing. Anyone with the phone in hand can also load tools that copy its data.',
    });
  } else if (boot === 'yellow') {
    findings.push({
      id: 'customOs',
      title: 'This phone runs a custom Android version',
      text: 'Its startup check is locked to a system that isn\'t the manufacturer\'s. That can be fine, but only trust it as much as you trust whoever built that system.',
    });
  } else if (boot === 'red') {
    findings.push({
      id: 'bootFailed',
      title: 'Android\'s startup check failed',
      text: 'The phone reported that its operating system didn\'t pass its own integrity check. Don\'t use a wallet on it.',
    });
  }

  // 3. Screen lock
  if (report.screenLockSet === false) {
    findings.push({
      id: 'noScreenLock',
      title: 'No screen lock is set',
      text: 'Anyone who picks up the phone can open it. Your wallet still needs the Signer password, but please set a PIN, pattern or password in Android\'s settings.',
    });
  }

  return { checked: true, findings };
}
