/*
 * qr.test.js — the Receive screen's QR code
 * Run with `npm test` from the `app` folder.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qrRuns } from '../src/klever/qr.js';
import { groupAddress, shortAddress } from '../src/klever/format.js';

const A = 'klv1rr0kkwkv9var3as20unaaek57cyrmt2mszvp757ljchmatyc8xasv4a0cy';

test('a Klever address becomes a square QR code with the three corner markers', () => {
  const { size, rows } = qrRuns(A);
  assert.equal(rows.length, size);
  assert.ok(size >= 21 && (size - 17) % 4 === 0, 'a valid QR size');
  // Each corner marker starts with a dark stretch of 7 squares.
  assert.deepEqual(rows[0][0], [0, 7]);
  assert.ok(rows[0].some(([c, len]) => c === size - 7 && len === 7));
  assert.deepEqual(rows[size - 1][0], [0, 7]);
});

test('addresses are shown in groups of 4 and shortened with their last 6 characters', () => {
  assert.equal(groupAddress(A).split(' ').length, 16);
  assert.equal(groupAddress(A).replace(/ /g, ''), A);
  assert.equal(shortAddress(A), 'klv1rr0kkw…v4a0cy');
});
