/*
 * qr.js — which squares of a QR code are dark
 * ===========================================
 * Used by the Receive screen to show your address as a QR code. The QR maths
 * comes from `qrcode-generator` (MIT licence, no dependencies of its own,
 * pinned exactly in package.json). It runs entirely on the phone.
 */

// Default import on purpose: the phone build loads the library's CommonJS file,
// where the function is the whole export (a named import would be undefined there).
// eslint-disable-next-line import/no-named-as-default
import qrcode from 'qrcode-generator';

/**
 * qrRuns — the QR code as rows of dark stretches, e.g. [[0, 7], [9, 2]]
 * = "7 dark squares from column 0, then 2 from column 9". Drawing stretches
 * instead of single squares keeps it to a few hundred boxes.
 */
export function qrRuns(text) {
  const qr = qrcode(0, 'M'); // 0 = pick the size automatically; M = medium error correction
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const rows = [];
  for (let r = 0; r < n; r += 1) {
    const runs = [];
    let start = -1;
    for (let c = 0; c <= n; c += 1) {
      const dark = c < n && qr.isDark(r, c);
      if (dark && start < 0) start = c;
      if (!dark && start >= 0) { runs.push([start, c - start]); start = -1; }
    }
    rows.push(runs);
  }
  return { size: n, rows };
}

