/*
 * qr.test.js — the Receive screen's QR code
 * Run with `npm test` from the `app` folder.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qrRuns } from '../src/klever/qr.js';
import { addressGroups, groupAddress, shortAddress } from '../src/klever/format.js';

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

test('addresses are shown as klv1, 4, then boxes of 6, ending with exactly the last 6 characters', () => {
  const groups = addressGroups(A);
  assert.deepEqual(groups.map((g) => g.length), [4, 4, 6, 6, 6, 6, 6, 6, 6, 6, 6]);
  assert.equal(groups[0], 'klv1');
  assert.equal(groups[groups.length - 1], A.slice(-6));
  assert.equal(groupAddress(A).replace(/ /g, ''), A);
  assert.deepEqual(addressGroups('abcdefghij'), ['abcd', 'efgh', 'ij']); // not an address: plain boxes of 4
  assert.equal(shortAddress(A), 'klv1rr0kkw…v4a0cy');
});
