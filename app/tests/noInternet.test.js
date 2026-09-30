/*
 * noInternet.test.js — the Signer must never be able to go online
 * ===============================================================
 * Two guards, so the rule can't quietly slip back in with a later change:
 *   1. app.json removes the INTERNET permission (and the other permissions
 *      the Signer doesn't need), so Android itself blocks any network use.
 *   2. None of the Signer's own code uses a network function.
 * (On the phone, the Signer also refuses to sign if a copy somehow HAS the
 * internet permission: see security/deviceChecks.js.)
 * Run with `npm test` from the `app` folder.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath: handles the spaces in "KLV Signer App" correctly.
const APP = fileURLToPath(new URL('..', import.meta.url));

test('app.json blocks the internet permission and adds no extra permissions', () => {
  const android = JSON.parse(readFileSync(join(APP, 'app.json'), 'utf8')).expo.android;
  assert.deepEqual(android.permissions, [], 'only the permissions the libraries truly need');
  for (const p of [
    'android.permission.INTERNET',
    'android.permission.ACCESS_NETWORK_STATE',
    'android.permission.SYSTEM_ALERT_WINDOW',
  ]) {
    assert.ok(android.blockedPermissions.includes(p), `${p} must be blocked`);
  }
  assert.equal(android.allowBackup, false);
});

/** All .js/.kt files under a folder. */
function filesIn(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return filesIn(path);
    return /\.(js|kt)$/.test(name) ? [path] : [];
  });
}

test("the Signer's own code uses no network functions", () => {
  const files = [join(APP, 'App.js'), join(APP, 'index.js'), ...filesIn(join(APP, 'src')), ...filesIn(join(APP, 'modules'))];
  const NETWORK = /\bfetch\s*\(|XMLHttpRequest|WebSocket|HttpURLConnection|java\.net\.URL|okhttp|Socket\(/;
  for (const file of files) {
    // Comments may mention these words; only real code counts.
    const code = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    assert.doesNotMatch(code, NETWORK, `network use in ${file.slice(APP.length)}`);
  }
});
