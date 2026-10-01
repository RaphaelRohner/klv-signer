/*
 * screens.test.js — every screen locks (or resets) when you leave the Signer
 * Run with `npm test` from the `app` folder.
 *
 * App.js decides what happens when you leave the app, by screen name
 * (UNLOCKED_SCREENS lock, SETUP_SCREENS forget the recovery words,
 * REQUEST_SCREENS answer "you left"). A new screen that isn't in any list
 * would stay open (this happened with Settings on 1 Oct 2026). This check
 * reads App.js and fails if a screen is missing from the lists.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const app = readFileSync(fileURLToPath(new URL('../App.js', import.meta.url)), 'utf8');
const list = (name) => JSON.parse(app.match(new RegExp(`const ${name} = (\\[[^\\]]*\\])`))[1].replace(/'/g, '"'));

// Screens where nothing is unlocked and nothing secret is shown.
const PUBLIC = ['welcome', 'unlock', 'storageProblem'];

test('every screen is covered by the leave-the-app rules', () => {
  const screens = [...app.matchAll(/case '([A-Za-z]+)':/g)].map((m) => m[1]);
  assert.ok(screens.includes('settings') && screens.includes('home'));
  const covered = new Set([...list('UNLOCKED_SCREENS'), ...list('REQUEST_SCREENS'), ...list('SETUP_SCREENS'), ...PUBLIC]);
  const missing = screens.filter((s) => !covered.has(s));
  assert.deepEqual(missing, [], `screens that wouldn't lock when you leave: ${missing.join(', ')}`);
});
