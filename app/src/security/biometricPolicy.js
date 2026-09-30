/*
 * biometricPolicy.js — when fingerprint/face is allowed, and when the password is needed
 * ===================================================================================
 *
 * Fingerprint or face is an OPTIONAL shortcut for the app password. The
 * password always works and stays the real lock. To keep it that way, the
 * Signer asks for the password instead of the fingerprint:
 *
 *   - after the phone was restarted (like Android's own lock screen does),
 *   - when the password hasn't been used for 7 days, so you don't forget it.
 *     Forgetting it would mean restoring the wallet from the recovery words.
 *
 * After the password has been used once, fingerprint/face works again.
 *
 * Pure calculations (no screens, no storage), so the automated tests can check them.
 */

/** How long fingerprint/face may be used without the password in between. */
export const PASSWORD_REFRESH_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The saved state: is the option on, and when/after which start-up was the password last used. */
export const BIOMETRIC_OFF = Object.freeze({ enabled: false, lastPasswordAt: 0, bootCount: -1 });

/**
 * biometricBlockedReason — why the password is needed this time, or null if
 * fingerprint/face may be used.
 *
 * @param {{enabled:boolean, lastPasswordAt:number, bootCount:number}} state
 * @param {{now:number, bootCount:number}} current   bootCount -1 = unknown
 * @returns {null | 'off' | 'restart' | 'week'}
 */
export function biometricBlockedReason(state, { now, bootCount }) {
  if (!state || !state.enabled) return 'off';
  // The phone restarted since the password was last used. (If Android won't
  // tell the start-up count, this check is skipped; the 7 days still apply.)
  if (bootCount >= 0 && state.bootCount >= 0 && bootCount !== state.bootCount) return 'restart';
  // A "last used" time in the future means the phone's clock was changed:
  // treat it as too long ago.
  const last = state.lastPasswordAt;
  if (!last || last > now || now - last > PASSWORD_REFRESH_DAYS * DAY_MS) return 'week';
  return null;
}

/** The same in plain words, for the screens. */
export function describeBlockedReason(reason) {
  if (reason === 'restart') return 'The phone was restarted, so please use your password this time. Fingerprint or face works again afterwards.';
  if (reason === 'week') return `You haven't used your password for ${PASSWORD_REFRESH_DAYS} days, so please use it this time, to keep it fresh in your mind. Fingerprint or face works again afterwards.`;
  return '';
}

/** New state after the password was used successfully. */
export function afterPasswordUsed(state, { now, bootCount }) {
  return { ...(state || BIOMETRIC_OFF), lastPasswordAt: now, bootCount };
}
