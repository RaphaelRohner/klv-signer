/*
 * deviceChecks.js — turns the phone-safety facts into plain-words warnings
 * ========================================================================
 *
 * The native check (modules/klv-signer-requests, DeviceSecurity.kt) reports
 * raw facts: is there a "su" program, which rooting apps are installed, what
 * state Android's startup check ("verified boot") is in, is a screen lock set.
 * This file decides which of those deserve a warning and says why, in words.
 *
 * TWO LEVELS
 *   - Signing switched off ("blocks": true): signs of root, an unlocked
 *     bootloader, a failed Android startup check, or a copy of the Signer
 *     that is allowed to use the internet (it never should be). On such a phone other
 *     apps (or a changed Android) could take over the Signer, so it refuses to
 *     sign. You can still open it, see your address and remove the wallet, and
 *     your funds are safe on the blockchain: restore them anywhere else with
 *     your 24 recovery words. If you rooted on purpose, undoing that switches
 *     signing back on. If you didn't, it's a sign something is wrong.
 *   - Warning only: no screen lock, a keyboard you installed yourself, apps
 *     with accessibility access. These are worth knowing about, but can have
 *     good reasons, so the Signer keeps working.
 *
 * Pure calculations (no screens, no native code), so the automated tests can
 * check them on a computer.
 */

import { OFFICIAL_SIGNING_KEY } from '../config.js';

/** "82:D0:…" → "82D0…": fingerprints compared without colons, in capitals. */
export const plainFingerprint = (fp) => String(fp || '').replace(/:/g, '').toUpperCase();

/**
 * isOfficialCopy — does THIS installed copy carry the official seal?
 * true / false, or null if Android didn't say (then nothing is claimed).
 */
export function isOfficialCopy(signingCertificates) {
  if (!Array.isArray(signingCertificates) || signingCertificates.length === 0) return null;
  return signingCertificates.length === 1 && plainFingerprint(signingCertificates[0]) === plainFingerprint(OFFICIAL_SIGNING_KEY);
}

/** Shown under every warning: what these checks can and can't tell. */
export const DEVICE_CHECK_LIMIT =
  'Rooting tools can hide from apps, so no warning doesn\'t prove a phone is safe. It only means none of the usual signs were found.';

/**
 * describeDeviceSecurity — which warnings to show.
 *
 * @param {object|null} report  facts from getDeviceSecurity():
 *   { suBinary, testKeys, rootApps: string[], verifiedBootState, flashLocked, screenLockSet }
 *   plus keyboard: { package, label, trusted } | null
 *   and accessibilityApps: { package, label, cameWithPhone, isTool }[]
 *   and internetPermission: boolean
 *   and signingCertificates: string[] (this copy's seal, SHA-256 hex)
 * @returns {{ checked: boolean, findings: { id: string, title: string, text: string, blocks?: boolean }[] }}
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
      blocks: true,
      title: 'This phone looks rooted',
      text: `Found ${signs.join('; ')}. On a rooted phone, harmful apps can take full control and watch what the Signer does, including your key at the moment it signs.`,
    });
  }

  // 2. Android's startup check (verified boot)
  const boot = report.verifiedBootState;
  if (boot === 'orange' || report.flashLocked === '0') {
    findings.push({
      id: 'bootloader',
      blocks: true,
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
      blocks: true,
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

  // 4. This copy of the Signer can use the internet (it's built without it)
  if (report.internetPermission === true) {
    findings.push({
      id: 'internet',
      blocks: true,
      title: 'This copy of the Signer can use the internet',
      text: 'The Signer is built without internet access on purpose, so it can never send anything anywhere. This copy has it, so it was built wrongly or has been changed. Install the Signer from its official source.',
    });
  }

  // Not the official seal: a copy built by someone else (or by you, from the
  // source code). Warning only: building it yourself is allowed (GPL). A fake
  // copy could of course leave this check out; Settings → About shows the
  // seal Android reports, to compare with the README.
  if (isOfficialCopy(report.signingCertificates) === false) {
    findings.push({
      id: 'unofficial',
      title: 'This copy of the Signer isn\'t signed with the official key',
      text: 'Android says this copy carries a different seal than the official KLV Signer (Settings → About shows both). If you built it yourself from the source code, that\'s expected. Otherwise it may be a fake: don\'t use it with real funds, uninstall it, install the Signer from its official source and restore your wallet from your recovery words.',
    });
  }

  // 5. Keyboard: one you installed yourself sees every letter you type
  const kb = report.keyboard;
  if (kb && kb.trusted === false) {
    findings.push({
      id: 'keyboard',
      title: `You're typing with "${kb.label}"`,
      text: `This keyboard didn't come with the phone (${kb.package}). A keyboard sees everything you type, including your Signer password. Only keep using it if you trust whoever made it, or switch to the phone's own keyboard in Android's settings.`,
    });
  }

  // 6. Apps with accessibility access (can read the screen and press buttons)
  const watchers = (report.accessibilityApps || []).filter((a) => !a.cameWithPhone);
  if (watchers.length > 0) {
    const names = watchers.map((a) => `"${a.label}"`).join(', ');
    const tools = watchers.filter((a) => a.isTool).length;
    findings.push({
      id: 'accessibility',
      title: watchers.length > 1 ? 'Some apps can read and control the screen' : 'An app can read and control the screen',
      text: `Accessibility access is switched on for ${names}. Harmful apps misuse this access to watch what you type and press buttons for you. The Signer hides its screens from apps that aren't real accessibility tools${tools > 0 ? ', but apps that call themselves one can still see them' : ''}. If you don't recognise an app here, switch its access off in Android's settings (Accessibility).`,
    });
  }

  return { checked: true, findings };
}

/**
 * Shown when the phone check itself couldn't run (an error). Signing is
 * switched off until it works: an unknown phone isn't treated as a safe one.
 */
export const DEVICE_CHECK_FAILED = Object.freeze({
  id: 'checkFailed',
  blocks: true,
  title: 'The phone-safety check couldn\'t run',
  text: 'The Signer couldn\'t check whether this phone is rooted or unlocked, so signing is switched off for now. Close the Signer completely and open it again.',
});

/** True if any finding switches signing off (root, unlocked bootloader, failed startup check). */
export function isSigningBlocked(findings) {
  return (findings || []).some((f) => f.blocks);
}

/** What the Signer says when signing is switched off. */
export const SIGNING_BLOCKED_TEXT =
  'Signing is switched off on this phone, because it looks rooted, its protections are switched off, or this copy of the Signer isn\'t a proper one (details on the Signer\'s own screens). You can still see your address and remove the wallet. Your funds are safe on the blockchain: your 24 recovery words restore them on any other phone or in the Klever app.';
