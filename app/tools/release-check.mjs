#!/usr/bin/env node
/*
 * release-check.mjs — check a finished Signer APK before publishing it
 * ===================================================================
 *
 * Run from the `app` folder:
 *
 *     node tools/release-check.mjs build-1234567890.apk
 *
 * It prints two things that go into the release notes:
 *
 *   1. The APK's CHECKSUM (SHA-256 of the whole file). Anyone who downloads
 *      the APK can compute it themselves and compare: if one letter differs,
 *      the file isn't the one you published.
 *   2. The fingerprint of the SIGNING KEY (the Signer's "seal") the APK was
 *      signed with. It must be the official one below, or phones would treat
 *      it as a different app, and client apps would refuse it.
 *
 * If the seal is NOT the official one, it says so loudly and exits with an
 * error: don't publish that APK.
 *
 * It also writes `<apk name>.sha256` next to the APK (the standard format
 * `sha256sum -c` understands), to upload together with the APK.
 *
 * No extra packages needed: it only reads the file.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { Buffer } from 'node:buffer';

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
 * Reads the signing certificates out of the APK's "signing block" (APK
 * Signature Scheme v2/v3, what modern Android uses). Returns their SHA-256
 * fingerprints as upper-case hex.
 */
function signingFingerprints(apk) {
  // The ZIP's last record ("end of central directory") says where its table
  // of contents starts; the signing block sits right before that.
  const eocd = apk.lastIndexOf(Buffer.from('504b0506', 'hex'));
  if (eocd < 0) throw new Error('This is not an APK (no ZIP directory found).');
  const cdOffset = apk.readUInt32LE(eocd + 16);
  if (apk.toString('latin1', cdOffset - 16, cdOffset) !== 'APK Sig Block 42') {
    throw new Error('This APK has no modern signature (v2/v3). Was it signed at all?');
  }
  const blockSize = Number(apk.readBigUInt64LE(cdOffset - 24));
  const blockStart = cdOffset - blockSize - 8;

  // Read a "length-prefixed" piece: 4-byte length, then that many bytes.
  const piece = (buf, at) => {
    const len = buf.readUInt32LE(at);
    return [buf.subarray(at + 4, at + 4 + len), at + 4 + len];
  };

  const found = new Set();
  let at = blockStart + 8;
  while (at < cdOffset - 24) {
    const len = Number(apk.readBigUInt64LE(at));
    const id = apk.readUInt32LE(at + 8);
    if (id === 0x7109871a || id === 0xf05368c0) { // v2 or v3 signature
      const value = apk.subarray(at + 12, at + 8 + len);
      let [signers] = piece(value, 0);
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

const file = process.argv[2];
if (!file) {
  console.error('Usage: node tools/release-check.mjs build-1234567890.apk');
  process.exit(2);
}

const apk = readFileSync(file);
const checksum = createHash('sha256').update(apk).digest('hex');
const fingerprints = signingFingerprints(apk);
const official = fingerprints.length === 1 && fingerprints[0] === OFFICIAL_FINGERPRINT;

writeFileSync(`${file}.sha256`, `${checksum}  ${basename(file)}\n`);

console.log(`\nAPK:                 ${basename(file)} (${(apk.length / 1e6).toFixed(1)} MB)`);
console.log(`Checksum (SHA-256):  ${checksum}`);
console.log(`Signing key:         ${fingerprints.map(withColons).join('\n                     ')}`);
console.log(`Checksum file:       ${basename(file)}.sha256 (upload it with the APK)\n`);

if (official) {
  console.log('OK: signed with the official KLV Signer key.\n');
} else {
  console.error('STOP: this APK is NOT signed with the official KLV Signer key.');
  console.error(`Expected:            ${withColons(OFFICIAL_FINGERPRINT)}`);
  console.error("Don't publish it. Phones with the Signer installed would refuse it as an update.\n");
  process.exit(1);
}
