/*
 * RemoveWallet.js — the "remove this wallet from the phone" box
 * =============================================================
 *
 * Used in two places:
 *   - the Home screen ("Remove wallet from this phone"),
 *   - the lock screen ("I forgot my password").
 *
 * WHAT REMOVING DOES
 * Deletes the scrambled key, the address and the wrong-password counter from
 * this phone. The wallet itself still exists on the Klever chain with
 * everything in it. You get it back by restoring from the recovery phrase.
 *
 * WHY IT'S ALLOWED WITHOUT THE PASSWORD
 * Removing gives nobody access to the wallet (that needs the recovery
 * phrase). It only clears this phone. Someone holding your phone could do the
 * same by uninstalling the app, so asking for the password here would add no
 * protection. It would only trap people who forgot it.
 *
 * To prevent accidents, you have to type the word REMOVE first.
 */

import React, { useState } from 'react';
import { Body, Button, Field, Notice, Strong } from './ui.js';
import { removeWallet } from '../storage/secureStore.js';

const CONFIRM_WORD = 'REMOVE';

/**
 * @param {object} props
 * @param {() => void} props.onRemoved  called after the wallet is deleted
 * @param {() => void} props.onCancel
 */
export default function RemoveWallet({ onRemoved, onCancel }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');

  async function remove() {
    setBusy(true);
    try {
      await removeWallet();
      onRemoved();
    } catch (error) {
      setFailure(`Removing failed: ${error.message}`);
      setBusy(false);
    }
  }

  return (
    <Notice kind="danger">
      <Body>
        <Strong>Remove this wallet from the Signer?</Strong>
      </Body>
      <Body>
        The wallet and everything in it stay safe on the Klever chain, but this phone forgets it. You can only get
        it back with the recovery phrase. <Strong>Make sure you have it on paper.</Strong>
      </Body>
      <Field
        label={`Type ${CONFIRM_WORD} to confirm`}
        value={typed}
        autoCapitalize="characters"
        autoCorrect={false}
        onChangeText={setTyped}
      />
      {failure ? <Body style={{ color: '#FF6B5E' }}>{failure}</Body> : null}
      <Button title="Remove wallet from this phone" kind="danger" onPress={remove} busy={busy}
        disabled={typed.trim() !== CONFIRM_WORD} />
      {onCancel ? <Button title="Cancel" kind="secondary" onPress={onCancel} disabled={busy} /> : null}
    </Notice>
  );
}
