/*
 * SetPasswordScreen.js — choosing the app password
 * ================================================
 *
 * The password you choose here scrambles the wallet's private key (see
 * crypto/vault.js). It's never saved anywhere, only used to scramble and,
 * later, to unscramble.
 *
 * You type it twice so a typo can't lock you out. The "Show" button next to
 * each box reveals what you typed (screenshots are blocked on this screen). Tapping "Save" hands it to
 * App.js, which scrambles the key and saves the result. That takes a moment,
 * on purpose (see crypto/passwordKey.js), so the button shows a spinner.
 */

import React, { useState } from 'react';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { Body, Button, Field, Notice, Screen, Strong, Title } from '../components/ui.js';
import { MIN_PASSWORD_LENGTH } from '../config.js';
import PasswordStrength from '../components/PasswordStrength.js';
import { isAcceptablePassword, passwordStrength } from '../security/passwordStrength.js';

/**
 * @param {object} props
 * @param {(password: string) => Promise<void>} props.onSubmit  scrambles and saves the wallet
 * @param {() => void} props.onBack
 */
export default function SetPasswordScreen({ onSubmit, onBack }) {
  // The "Show" button can put the password on screen, so block screenshots here.
  usePreventScreenCapture('set-password');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');

  // Work out what (if anything) is still wrong, to show under the boxes.
  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const tooWeak = !tooShort && password.length > 0 && !isAcceptablePassword(password);
  const different = repeat.length > 0 && repeat !== password;
  const ready = isAcceptablePassword(password) && repeat === password;

  async function save() {
    setBusy(true);
    setFailure('');
    try {
      await onSubmit(password);
      // Success: App.js moves on to the next screen, so nothing else to do here.
    } catch (error) {
      setFailure(`Saving failed: ${error.message}`);
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Title>Choose an app password</Title>
      <Body>You'll type this every time you approve a transaction in the Signer.</Body>
      <Notice kind="info">
        <Body>
          <Strong>Tip:</Strong> 3–4 random words (like "maple tunnel orbit ginger") are strong and easy to remember.
          Don't reuse a password from anywhere else.
        </Body>
      </Notice>

      <Field
        label={`Password (at least ${MIN_PASSWORD_LENGTH} characters)`}
        value={password}
        secret
        editable={!busy}
        onChangeText={setPassword}
        error={tooShort ? `Please use at least ${MIN_PASSWORD_LENGTH} characters.` : tooWeak ? `Too easy to guess: ${passwordStrength(password).hint} Please choose a stronger one.` : ''}
      />
      <PasswordStrength password={password} />
      <Field
        label="Type it again"
        value={repeat}
        secret
        editable={!busy}
        onChangeText={setRepeat}
        error={different ? "The two passwords don't match yet." : ''}
      />

      <Body muted>
        If you forget this password, nobody can recover it. You'd remove the wallet from the Signer and restore it
        from your recovery phrase with a new password.
      </Body>

      {failure ? <Notice kind="danger">{failure}</Notice> : null}

      <Button title={busy ? 'Locking your wallet…' : 'Save and lock my wallet'} onPress={save} disabled={!ready} busy={busy} />
      {busy ? <Body muted>This takes a moment on purpose. It's what makes guessing your password so slow.</Body> : null}
      <Button title="Back" kind="secondary" onPress={onBack} disabled={busy} />
    </Screen>
  );
}
