/*
 * BiometricButton.js — "Use fingerprint or face", where the password is asked
 * ==========================================================================
 *
 * Shown on the Unlock and approval screens, next to the password box. The
 * password box always stays: fingerprint/face is only a shortcut.
 *   - Option on and allowed right now → a button. Tapping it opens Android's
 *     own fingerprint/face prompt (drawn by Android, so no app can fake it).
 *   - Option on but the password is needed this time (phone restarted, or 7
 *     days without the password) → a short note saying why.
 *   - Option off → nothing.
 * See security/usePasswordCheck.js for what happens behind the button.
 */

import React from 'react';
import { Button, Notice } from './ui.js';
import { describeBlockedReason } from '../security/biometricPolicy.js';

/**
 * @param {object} props
 * @param {object} props.pw        the screen's usePasswordCheck()
 * @param {string} props.title     button text
 * @param {string} props.prompt    title of Android's fingerprint/face prompt
 * @param {(key: Uint8Array, info: object) => any} props.withKey  what to do with the key
 * @param {(result: object) => void} props.onDone   called after success
 * @param {boolean} [props.disabled]
 */
export default function BiometricButton({ pw, title, prompt, withKey, onDone, disabled }) {
  const b = pw.biometric;
  if (!b.enabled) return null;
  if (!b.supported) {
    return (
      <Notice kind="info">
        Fingerprint or face is switched on, but the phone has none set up right now. Use your password.
      </Notice>
    );
  }
  if (b.blockedReason) return <Notice kind="info">{describeBlockedReason(b.blockedReason)}</Notice>;

  async function go() {
    const result = await pw.checkBiometric(prompt, withKey);
    if (result.ok) onDone(result);
  }

  return <Button title={title} kind="secondary" onPress={go} disabled={disabled || pw.busy} />;
}
