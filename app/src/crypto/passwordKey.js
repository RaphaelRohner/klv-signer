/*
 * passwordKey.js — turning your password into a scrambling key ("key stretching")
 * ===============================================================================
 *
 * WHAT THIS FILE DOES
 * It takes your app password plus a random "salt" (explained below) and runs
 * them through a deliberately slow, memory-hungry recipe called **scrypt**.
 * Out comes a 32-byte key. The vault (vault.js) uses that key to scramble
 * and unscramble your wallet's private key.
 *
 * WHY SLOW ON PURPOSE?
 * For you, one password check takes about a second. Someone who has copied
 * the scrambled wallet and tries to guess the password must pay that same
 * cost for every single guess, which makes guessing millions of passwords
 * impractical.
 *
 * WHAT IS THE "SALT"?
 * A random number saved next to the scrambled wallet. It makes sure two
 * people with the same password still get completely different keys, so an
 * attacker can't prepare a big "password → key" table in advance.
 * The salt is not secret.
 *
 * TWO ENGINES, SAME RESULT
 * scrypt is a published standard, so every correct implementation gives
 * exactly the same answer for the same inputs. We use two:
 *
 *   1. FAST (native): `react-native-quick-crypto` runs scrypt in the phone's
 *      built-in, compiled crypto code (OpenSSL). Takes about a second.
 *   2. BACKUP (JavaScript): `@noble/hashes` runs the same recipe in plain
 *      JavaScript. Much slower on a phone (possibly 5–15 seconds), but it
 *      always works.
 *
 * On first use we quickly check that the fast engine gives the same answer as
 * the backup engine on a tiny test. If it doesn't load, or doesn't match, we
 * quietly use the backup engine. Either way your wallet unlocks, only the
 * waiting time differs. The Home screen shows which engine is in use.
 */

import { scrypt as jsScrypt, scryptAsync as jsScryptAsync } from '@noble/hashes/scrypt';

/*
 * scrypt needs some working memory: 128 × N × r bytes (128 MB for our
 * settings). Engines refuse by default above a limit, so we allow a bit more
 * than we need.
 */
function memoryLimitFor({ N, r }) {
  return 128 * N * r * 2;
}

/**
 * passwordToBytes — turns the password text into bytes in a consistent way.
 *
 * "NFKC normalisation" makes sure characters that look identical but can be
 * typed in different ways (for example an accented letter typed as one key
 * vs. letter + accent) always give the same bytes. Without it, a password
 * typed on a different keyboard might not unlock.
 *
 * @param {string} password
 * @returns {Uint8Array}
 */
export function passwordToBytes(password) {
  return new TextEncoder().encode(String(password).normalize('NFKC'));
}

// ---------------------------------------------------------------------------
// Engine 1: the fast, native engine (only exists inside the real phone app)
// ---------------------------------------------------------------------------

/**
 * loadNativeScrypt — tries to find the fast engine.
 * Returns a function, or null if it isn't available (for example when the
 * tests run on a computer instead of a phone).
 */
function loadNativeScrypt() {
  try {
    // `require` inside try/catch: if the native library is missing or broken,
    // we land in `catch` instead of crashing the app.
    const lib = require('react-native-quick-crypto');
    const scryptFn = lib.scrypt || (lib.default && lib.default.scrypt);
    if (typeof scryptFn !== 'function') return null;

    // Wrap the library's "callback" style into a simple async function.
    return (passwordBytes, salt, params, dkLen) =>
      new Promise((resolve, reject) => {
        scryptFn(
          passwordBytes,
          salt,
          dkLen,
          { N: params.N, r: params.r, p: params.p, maxmem: memoryLimitFor(params) },
          (error, result) => {
            if (error) reject(error);
            else resolve(new Uint8Array(result)); // copy into a plain byte array
          },
        );
      });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Choosing the engine (done once, then remembered)
// ---------------------------------------------------------------------------

let chosenEngine = null;       // the function we'll use
let chosenEngineName = null;   // 'fast (native)' or 'backup (JavaScript)'
let overrideForTests = null;   // lets automated tests plug in their own engine

/**
 * useEngineForTests — ONLY for the automated tests in the `tests/` folder.
 * Lets a test pretend a particular "native" engine exists (or pass null to
 * pretend none exists). Never called by the app itself.
 */
export function useEngineForTests(nativeEngineOrNull) {
  overrideForTests = { native: nativeEngineOrNull };
  chosenEngine = null;
  chosenEngineName = null;
}

/**
 * pickEngine — decides which engine to use, the first time it's needed.
 *
 * The self-check: run a TINY scrypt (instant) on both engines and compare.
 * scrypt is a standard, so a correct fast engine must produce exactly the
 * same bytes as the backup engine.
 */
async function pickEngine() {
  if (chosenEngine) return chosenEngine;

  const backup = (passwordBytes, salt, params, dkLen) =>
    jsScryptAsync(passwordBytes, salt, { N: params.N, r: params.r, p: params.p, dkLen, maxmem: memoryLimitFor(params) });

  const native = overrideForTests ? overrideForTests.native : loadNativeScrypt();

  if (native) {
    try {
      const tinyParams = { N: 16, r: 1, p: 1 };
      const testPassword = new TextEncoder().encode('self-check');
      const testSalt = new TextEncoder().encode('klv-signer-salt!');
      const expected = jsScrypt(testPassword, testSalt, { ...tinyParams, dkLen: 32 });
      const actual = await native(testPassword, testSalt, tinyParams, 32);
      if (bytesEqual(expected, actual)) {
        chosenEngine = native;
        chosenEngineName = 'fast (native)';
        return chosenEngine;
      }
    } catch {
      // fall through to the backup engine
    }
  }

  chosenEngine = backup;
  chosenEngineName = 'backup (JavaScript)';
  return chosenEngine;
}

/**
 * engineName — which engine is in use ("fast (native)" or "backup (JavaScript)").
 * Shown on the Home screen as test information. Returns null before first use.
 */
export function engineName() {
  return chosenEngineName;
}

// ---------------------------------------------------------------------------
// The one function the rest of the app uses
// ---------------------------------------------------------------------------

/**
 * keyFromPassword — the main job of this file.
 *
 * @param {string} password   what you typed
 * @param {Uint8Array} salt   the random salt stored with the vault
 * @param {{N:number, r:number, p:number}} params   stretching settings (see config.js)
 * @returns {Promise<Uint8Array>}  a 32-byte key for scrambling/unscrambling
 */
export async function keyFromPassword(password, salt, params) {
  const engine = await pickEngine();
  const passwordBytes = passwordToBytes(password);
  try {
    return await engine(passwordBytes, salt, params, 32);
  } finally {
    passwordBytes.fill(0); // wipe the password bytes once used
  }
}

/** bytesEqual — true if two byte arrays hold exactly the same bytes. */
function bytesEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a[i] ^ b[i];
  return difference === 0;
}
