/*
 * config.js — the Signer's settings, all in one place
 * ====================================================
 *
 * Instead of scattering important numbers around the code, we keep them here
 * so they're easy to find and change. Every setting says what it does.
 */

/*
 * NETWORK — which Klever network the Signer works with.
 *
 * 'testnet' = Klever's practice network (tokens and NFTs have no real value).
 * 'mainnet' = the real network.
 *
 * Note: a Klever wallet (recovery phrase + address) is the same on both
 * networks. This setting decides which network's requests the Signer will
 * accept once signing exists (Stage 2). It stays 'testnet' until you decide
 * to switch.
 */
export const NETWORK = 'testnet';

/*
 * RECOVERY_PHRASE_WORDS — how many words a brand-new recovery phrase has.
 * 24 words is the strongest standard option. (Restoring also accepts the
 * shorter 12-word phrases some wallets use.)
 */
export const RECOVERY_PHRASE_WORDS = 24;

/*
 * MIN_PASSWORD_LENGTH — the shortest app password we accept.
 * Longer is better. A few random words ("maple tunnel orbit ginger") is
 * both strong and memorable.
 */
export const MIN_PASSWORD_LENGTH = 8;

/*
 * PASSWORD_STRETCHING — settings for "key stretching" (see HOW-IT-WORKS.md,
 * section 5). This is the deliberately slow recipe that turns your password
 * into the key that scrambles your wallet.
 *
 *   N — how much work each password check takes. Doubling N doubles the time
 *       (for you AND for anyone trying to guess). 32768 (= 2^15) is a common,
 *       well-regarded choice for phones.
 *   r, p — standard companion settings for this recipe (scrypt). Leave them.
 *
 * These numbers are saved alongside each scrambled wallet, so changing them
 * here later only affects wallets set up after the change. Old ones still
 * unlock fine.
 */
export const PASSWORD_STRETCHING = { N: 32768, r: 8, p: 1 };

/*
 * WRONG_PASSWORD_POLICY — how the lock screen slows down guessing.
 *
 * The first FREE_ATTEMPTS wrong passwords in a row cost nothing (typos
 * happen). After that, each further wrong attempt makes you wait, starting at
 * FIRST_WAIT_SECONDS and doubling each time, up to MAX_WAIT_SECONDS.
 * A correct password resets everything.
 *
 * Example with the values below: wrong #5 → wait 30 s, #6 → 1 min,
 * #7 → 2 min, #8 → 4 min … up to 1 hour.
 */
export const WRONG_PASSWORD_POLICY = {
  FREE_ATTEMPTS: 4,
  FIRST_WAIT_SECONDS: 30,
  MAX_WAIT_SECONDS: 60 * 60,
};

/*
 * LOCK_WHEN_LEFT — if true, the Signer locks itself as soon as you switch to
 * another app or turn off the screen, so you must enter your password again.
 */
export const LOCK_WHEN_LEFT = true;
