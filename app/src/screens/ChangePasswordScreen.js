/*
 * ChangePasswordScreen.js — choosing a new app password
 * ====================================================
 *
 * Opened from the Home screen ("Change password").
 *
 * WHAT HAPPENS WHEN YOU TAP "CHANGE PASSWORD"
 *   1. Your CURRENT password unlocks the key, through the same shared check as
 *      everywhere else (security/usePasswordCheck.js). So wrong tries count
 *      towards the waiting times, exactly like on the lock screen.
 *   2. The key is scrambled again with the NEW password: a fresh vault with a
 *      new random salt (crypto/vault.js), using the Signer's current password
 *      settings. The new vault replaces the old one in one save.
 *   3. The key is wiped from memory, as always.
 *   4. Fingerprint or face is switched off, because its stored copy belongs to
 *      the old vault (storage/biometricStore.js). Switch it on again on Home.
 *
 * Your wallet, address and recovery phrase don't change: only the password
 * that scrambles the key on this phone. If the save failed half-way, the old
 * vault (and old password) would simply stay in place.
 *
 * Screenshots are blocked here (passwords can be shown with "Show").
 */

import React, { useState } from 'react';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { Body, Button, Field, Notice, Screen, Title } from '../components/ui.js';
import { usePasswordCheck } from '../security/usePasswordCheck.js';
import { lockKeyChecked } from '../crypto/vault.js';
import { saveVault } from '../storage/secureStore.js';
import { MIN_PASSWORD_LENGTH, PASSWORD_STRETCHING } from '../config.js';
import PasswordStrength from '../components/PasswordStrength.js';
import { isAcceptablePassword } from '../security/passwordStrength.js';

/**
 * @param {object} props
 * @param {string} props.address   the wallet's address (sealed into the vault)
 * @param {(info: {biometricWasOn: boolean}) => void} props.onChanged
 * @param {() => void} props.onBack
 */
export default function ChangePasswordScreen({ address, onChanged, onBack }) {
  usePreventScreenCapture('change-password');
  const pw = usePasswordCheck();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');

  // What (if anything) is still wrong, shown under the boxes.
  const tooShort = next.length > 0 && next.length < MIN_PASSWORD_LENGTH;
  const tooWeak = !tooShort && next.length > 0 && !isAcceptablePassword(next);
  const same = next.length > 0 && next === current;
  const different = repeat.length > 0 && repeat !== next;
  const ready = current.length > 0 && isAcceptablePassword(next) && !same && repeat === next && pw.wait === 0;

  async function change() {
    const biometricWasOn = pw.biometric.enabled;
    const result = await pw.check(current, async (privateKey) => {
      const vault = await lockKeyChecked(privateKey, next, address, PASSWORD_STRETCHING);
      await saveVault(vault); // also switches fingerprint/face off
    });
    setCurrent('');
    if (result.ok) {
      setNext('');
      setRepeat('');
      onChanged({ biometricWasOn });
    }
  }

  return (
    <Screen>
      <Title>Change password</Title>
      <Body>
        Your wallet, address and recovery phrase stay the same. Only the password that protects the key on this phone
        changes.
      </Body>

      {pw.message ? <Notice kind="danger">{pw.message}</Notice> : null}
      {pw.wait > 0 ? (
        <Notice kind="warning">Too many wrong passwords. You can try again in {pw.waitText}.</Notice>
      ) : null}

      <Field
        label="Current password"
        value={current}
        secret
        editable={!pw.busy && pw.wait === 0}
        onChangeText={(value) => { setCurrent(value); pw.clearMessage(); }}
      />
      <Field
        label={`New password (at least ${MIN_PASSWORD_LENGTH} characters)`}
        value={next}
        secret
        editable={!pw.busy}
        onChangeText={setNext}
        error={tooShort ? `Please use at least ${MIN_PASSWORD_LENGTH} characters.` : tooWeak ? 'Too easy to guess. Please choose a stronger one (see the hint below).' : same ? 'The new password is the same as the current one.' : ''}
      />
      {same ? null : <PasswordStrength password={next} />}
      <Field
        label="Type the new password again"
        value={repeat}
        secret
        editable={!pw.busy}
        onChangeText={setRepeat}
        error={different ? "The two new passwords don't match yet." : ''}
      />

      {pw.biometric.enabled ? (
        <Body muted>Fingerprint or face will be switched off. You can switch it on again on Home with the new password.</Body>
      ) : null}
      <Body muted>
        If you forget the new password, nobody can recover it. You'd restore the wallet from your recovery phrase.
      </Body>

      <Button title={pw.busy ? 'Changing…' : 'Change password'} onPress={change} disabled={!ready} busy={pw.busy} />
      {pw.busy ? <Body muted>This takes a moment on purpose (two password checks).</Body> : null}
      <Button title="Back" kind="secondary" onPress={onBack} disabled={pw.busy} />
    </Screen>
  );
}
