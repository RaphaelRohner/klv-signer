/*
 * passwordStrength.js — "how good is this new password?"
 * =====================================================
 *
 * Shown under the password box when you choose or change the app password.
 * Two hard rules (isAcceptablePassword): the minimum length (config.js,
 * MIN_PASSWORD_LENGTH), and not "weak" (since the third review, 5 Oct 2026:
 * "password1234" or "111111111111" were accepted before). "Fair" is allowed;
 * "strong" is recommended.
 *
 * Three levels:
 *   - weak:   too short, a well-known password, or very repetitive
 *             (e.g. "aaaaaaaaaaaa", "123456789012", "password1234")
 *   - fair:   acceptable, but could be stronger
 *   - strong: 4 or more words, or long with a good mix of characters
 *
 * Why words? "maple tunnel orbit ginger" is easy to remember and far harder
 * to guess than "P@ssw0rd!", because guessers try the usual tricks
 * (capital first letter, digit at the end, @ for a) first.
 *
 * Deliberately simple and offline (no password list downloaded). Pure
 * calculations, so the automated tests can check them.
 */

import { MIN_PASSWORD_LENGTH } from '../config.js';

// Very common passwords and words people build passwords from. Checked after
// removing digits, symbols and capitals, so "Password2024!" counts as "password".
const COMMON = new Set([
  'password', 'passwort', 'passwords', 'qwerty', 'qwertz', 'qwertyuiop', 'asdfgh', 'asdfghjkl', 'zxcvbn',
  'letmein', 'welcome', 'iloveyou', 'admin', 'administrator', 'login', 'master', 'secret', 'dragon',
  'monkey', 'football', 'baseball', 'soccer', 'sunshine', 'princess', 'shadow', 'superman', 'batman',
  'starwars', 'pokemon', 'trustno', 'whatever', 'freedom', 'hello', 'helloworld', 'abc', 'abcdef',
  'klever', 'kleverwallet', 'klv', 'klvsigner', 'signer', 'wallet', 'bitcoin', 'crypto', 'ethereum',
  'devikins', 'changeme', 'default', 'test', 'testtest', 'mypassword', 'yourpassword',
]);

const SEQUENCES = ['0123456789', 'abcdefghijklmnopqrstuvwxyz', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

/** True if the text is mostly one run up or down a sequence (e.g. "123456789012", "abcdefghijkl"). */
function isSequence(text) {
  const t = text.toLowerCase();
  for (const seq of SEQUENCES) {
    const both = seq + seq + seq;
    const reversed = both.split('').reverse().join('');
    if (both.includes(t) || reversed.includes(t)) return true;
  }
  return false;
}

/**
 * "P@ssw0rd" → "password": the usual swaps guessers undo first
 * (weekly check, 6 Oct 2026: "Passw0rd1234" was accepted before).
 */
function undoSwaps(text) {
  const map = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i', '|': 'l' };
  return text.toLowerCase().replace(/[013457@$!|]/g, (c) => map[c]);
}

/**
 * True if a very common word (4+ letters) makes up a third or more of the
 * password, also with swapped characters ("Passw0rd1234", "Kl3ver2026!!").
 */
function containsCommonWord(pw) {
  const plain = undoSwaps(pw).replace(/[^a-z]/g, '');
  for (const word of COMMON) {
    if (word.length >= 4 && word.length >= pw.length / 3 && plain.includes(word)) return true;
  }
  return false;
}

/** How many kinds of characters: lower-case, capitals, digits, other symbols. */
function characterKinds(text) {
  let kinds = 0;
  if (/[a-z]/.test(text)) kinds += 1;
  if (/[A-Z]/.test(text)) kinds += 1;
  if (/[0-9]/.test(text)) kinds += 1;
  if (/[^a-zA-Z0-9\s]/.test(text)) kinds += 1;
  return kinds;
}

/** Words of 3+ letters, separated by spaces, dashes, dots or underscores. */
function wordCount(text) {
  return text.split(/[\s\-_.]+/).filter((w) => /^[\p{L}]{3,}$/u.test(w)).length;
}

/**
 * passwordStrength
 * @param {string} password
 * @returns {{ level: 'none'|'weak'|'fair'|'strong', hint: string }}
 */
export function passwordStrength(password) {
  const pw = String(password || '');
  if (pw.length === 0) return { level: 'none', hint: '' };

  if (pw.length < MIN_PASSWORD_LENGTH) {
    return { level: 'weak', hint: `Too short: at least ${MIN_PASSWORD_LENGTH} characters, please.` };
  }
  const letters = pw.toLowerCase().replace(/[^a-z]/g, '');
  if ((COMMON.has(letters) && letters.length >= pw.length / 3) || containsCommonWord(pw)) {
    return { level: 'weak', hint: 'Built on a very common password or word. Guessers try these first.' };
  }
  // The same short piece repeated ("passwordpassword", "qwertyqwerty", "ab12ab12ab12").
  if (/^(.{1,8}?)\1+$/.test(pw.toLowerCase().replace(/\s/g, ''))) {
    return { level: 'weak', hint: 'The same piece repeated. Guessers try these first.' };
  }
  if (new Set(pw.toLowerCase()).size < 5 || isSequence(pw.replace(/\s/g, ''))) {
    return { level: 'weak', hint: 'Too repetitive or a simple sequence. Guessers try these first.' };
  }

  const words = wordCount(pw);
  const kinds = characterKinds(pw);
  if (words >= 4 || (pw.length >= 16 && kinds >= 2) || (pw.length >= 14 && kinds >= 3)) {
    return { level: 'strong', hint: 'Strong.' };
  }
  return {
    level: 'fair',
    hint: 'OK, but could be stronger. Tip: 4 random words ("maple tunnel orbit ginger") are strong and easy to remember.',
  };
}

/**
 * isAcceptablePassword — may this be the new app password? Long enough and
 * not rated "weak". (Existing passwords keep working; this only applies when
 * choosing or changing one.)
 */
export function isAcceptablePassword(password) {
  const pw = String(password || '');
  return pw.length >= MIN_PASSWORD_LENGTH && passwordStrength(pw).level !== 'weak';
}
