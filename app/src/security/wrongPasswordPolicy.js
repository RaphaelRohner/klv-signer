/*
 * wrongPasswordPolicy.js — the rules for slowing down password guessing
 * =====================================================================
 *
 * WHAT THIS FILE DOES
 * Pure calculations, no saving: given how many wrong passwords were typed in
 * a row, how long must the person wait before the next try?
 * The numbers themselves live in config.js (WRONG_PASSWORD_POLICY).
 *
 * WHAT IT PROTECTS AGAINST (AND WHAT NOT)
 * This stops someone who picks up your phone from sitting there trying
 * password after password in the app. It can't stop a skilled attacker who
 * copies the scrambled vault off the phone and guesses on a computer. That's
 * what the slow scrypt recipe is for (see passwordKey.js), and why a
 * good password matters most.
 */

import { WRONG_PASSWORD_POLICY } from '../config.js';

/**
 * waitSecondsAfter — how long to wait after `failures` wrong passwords in a row.
 *
 * @param {number} failures  wrong attempts in a row so far
 * @param {object} [policy]  normally WRONG_PASSWORD_POLICY from config.js
 * @returns {number} seconds to wait (0 = may try again right away)
 */
export function waitSecondsAfter(failures, policy = WRONG_PASSWORD_POLICY) {
  const { FREE_ATTEMPTS, FIRST_WAIT_SECONDS, MAX_WAIT_SECONDS } = policy;
  if (failures <= FREE_ATTEMPTS) return 0;
  const doublings = failures - FREE_ATTEMPTS - 1; // 0 for the first wait
  // Math.min stops the doubling at the maximum. The "30" cap on doublings
  // avoids silly giant numbers.
  return Math.min(FIRST_WAIT_SECONDS * 2 ** Math.min(doublings, 30), MAX_WAIT_SECONDS);
}

/**
 * recordFailure — the new state after one more wrong password.
 *
 * @param {{failures:number, lockedUntil:number}} state  current state
 * @param {number} now  current time in milliseconds
 * @returns {{failures:number, lockedUntil:number}}  lockedUntil = time
 *   (in milliseconds) before which no new attempt is allowed; 0 = none
 */
export function recordFailure(state, now, policy = WRONG_PASSWORD_POLICY) {
  const failures = (state?.failures || 0) + 1;
  const wait = waitSecondsAfter(failures, policy);
  return { failures, lockedUntil: wait > 0 ? now + wait * 1000 : 0 };
}

/** The state after a correct password: everything reset. */
export const FRESH_STATE = Object.freeze({ failures: 0, lockedUntil: 0 });

/**
 * secondsLeft — how many seconds until the next attempt is allowed (0 = now).
 *
 * @param {{lockedUntil:number}} state
 * @param {number} now  current time in milliseconds
 */
export function secondsLeft(state, now) {
  const until = state?.lockedUntil || 0;
  return until > now ? Math.ceil((until - now) / 1000) : 0;
}
