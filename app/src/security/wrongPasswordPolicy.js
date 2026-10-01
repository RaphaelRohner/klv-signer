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

/*
 * TIME THAT CAN'T BE CHEATED (second review, 1 Oct 2026)
 * Waiting times used to be measured with the phone's clock, which anyone
 * holding the phone can change in Settings (move it forward = no waiting).
 * Now each wait is measured with a stopwatch that runs since the phone
 * started ("elapsed realtime") and can't be changed. A "clock" here is:
 *   { now: wall clock ms, elapsed: stopwatch ms (-1 = unknown), boot: start-up count (-1 = unknown) }
 * After a phone restart the stopwatch starts from zero, so a wait that was
 * running starts again from the beginning (see restartIfRebooted).
 * Without a stopwatch (e.g. in the tests on a computer), the wall clock is
 * used, but a wait can never be longer than it was set to (so moving the
 * clock BACK can't lock you out for ages either).
 */

/**
 * waitSecondsAfter — how long to wait after this many wrong passwords in a row.
 * 4 free tries, then 30 s, 1 min, 2 min, 4 min … up to 1 hour.
 */
export function waitSecondsAfter(failures, policy = WRONG_PASSWORD_POLICY) {
  const { FREE_ATTEMPTS, FIRST_WAIT_SECONDS, MAX_WAIT_SECONDS } = policy;
  if (failures <= FREE_ATTEMPTS) return 0;
  const doublings = failures - FREE_ATTEMPTS - 1; // 0 for the first wait
  // Math.min stops the doubling at the maximum. The "30" cap on doublings
  // avoids silly giant numbers.
  return Math.min(FIRST_WAIT_SECONDS * 2 ** Math.min(doublings, 30), MAX_WAIT_SECONDS);
}

/** Accepts a plain number (wall-clock ms, older code and tests) or a clock object. */
function asClock(clock) {
  return typeof clock === 'number' ? { now: clock, elapsed: -1, boot: -1 } : clock;
}

/** The state after one more wrong password (starts a wait if past the free tries). */
export function recordFailure(state, clock, policy = WRONG_PASSWORD_POLICY) {
  const c = asClock(clock);
  const failures = (state?.failures || 0) + 1;
  const waitMs = waitSecondsAfter(failures, policy) * 1000;
  return {
    failures,
    lockedUntil: waitMs > 0 ? c.now + waitMs : 0, // wall clock (fallback)
    waitMs,                                       // how long this wait is
    startElapsed: c.elapsed,                      // stopwatch when it started
    boot: c.boot,                                 // which phone start-up
  };
}

/** The state after a correct password: everything reset. */
export const FRESH_STATE = Object.freeze({ failures: 0, lockedUntil: 0, waitMs: 0, startElapsed: -1, boot: -1 });

/**
 * restartIfRebooted — after a phone restart the stopwatch starts from zero,
 * so a running wait is anchored to the new start-up (it starts again).
 * Returns the same object if nothing changed.
 */
export function restartIfRebooted(state, clock) {
  const c = asClock(clock);
  if (!state || !state.waitMs || c.boot < 0 || c.elapsed < 0) return state;
  if (state.boot === c.boot && state.startElapsed >= 0 && state.startElapsed <= c.elapsed) return state;
  return { ...state, startElapsed: c.elapsed, boot: c.boot, lockedUntil: c.now + state.waitMs };
}

/** formatWait — turns 75 into "1 min 15 s", for the waiting message. */
export function formatWait(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m} min ${s} s` : `${s} s`;
}

/** secondsLeft — how many seconds until the next try is allowed (0 = now). */
export function secondsLeft(state, clock) {
  const c = asClock(clock);
  if (!state) return 0;
  const waitMs = state.waitMs || 0;
  // Stopwatch: same start-up, so elapsed time is exact and can't be changed.
  if (waitMs > 0 && c.boot >= 0 && c.elapsed >= 0 && state.boot === c.boot && state.startElapsed >= 0) {
    const passed = c.elapsed - state.startElapsed;
    const left = passed < 0 ? waitMs : waitMs - passed;
    return left > 0 ? Math.ceil(left / 1000) : 0;
  }
  // Fallback: wall clock, never more than the wait itself.
  const until = state.lockedUntil || 0;
  if (until <= c.now) return 0;
  const cap = waitMs > 0 ? waitMs : WRONG_PASSWORD_POLICY.MAX_WAIT_SECONDS * 1000; // older saved states have no waitMs
  const left = Math.min(until - c.now, cap);
  return Math.ceil(left / 1000);
}
