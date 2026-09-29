/*
 * setupRandom.js — gives the app a proper source of randomness
 * ============================================================
 *
 * WHY THIS EXISTS
 * A new wallet's secret must be truly unpredictable. If it could be guessed,
 * anyone could rebuild your wallet. The crypto libraries we use (made by the
 * same people whose code Klever uses) ask for randomness through a standard
 * web function called `crypto.getRandomValues`.
 *
 * Phone apps don't always come with that function. So here we connect it to
 * Expo's `expo-crypto`, which uses the phone's own built-in, secure random
 * number generator (the same one Android uses for its own security).
 *
 * WHEN IT RUNS
 * `index.js` loads this file FIRST, before anything else, so the randomness
 * is in place before any wallet code could possibly need it.
 */

import * as ExpoCrypto from 'expo-crypto';

// If the app doesn't have a `crypto` object at all, create an empty one.
if (typeof globalThis.crypto !== 'object' || globalThis.crypto === null) {
  globalThis.crypto = {};
}

// If `getRandomValues` is missing, plug in the phone's secure generator.
if (typeof globalThis.crypto.getRandomValues !== 'function') {
  globalThis.crypto.getRandomValues = (array) => ExpoCrypto.getRandomValues(array);
}
