/*
 * StorageProblemScreen.js — "the wallet couldn't be read"
 * ======================================================
 *
 * Shown when the Signer starts and its saved wallet is only partly there or
 * can't be read (e.g. the phone's secure storage had a problem). Before the
 * second review (1 Oct 2026) the Signer then offered a fresh start, and a
 * new wallet could quietly replace what was still stored. Now it explains,
 * and the only way on is a deliberate "Remove wallet", then restoring from
 * the recovery words.
 */

import React from 'react';
import { Body, Notice, Screen, Strong, Title } from '../components/ui.js';
import RemoveWallet from '../components/RemoveWallet.js';

/**
 * @param {object} props
 * @param {() => void} props.onRemoved  after the wallet was removed (back to Welcome)
 */
export default function StorageProblemScreen({ onRemoved }) {
  return (
    <Screen>
      <Title>The wallet couldn't be read</Title>
      <Notice kind="warning">
        <Body>
          The Signer's saved wallet on this phone is incomplete or can't be read. Your funds are not affected: they
          are on the Klever blockchain, and your 24 recovery words bring the wallet back.
        </Body>
      </Notice>
      <Body>
        <Strong>First, try again:</Strong> close the Signer completely (Android's app switcher, swipe it away) and
        open it again. Restarting the phone can help too.
      </Body>
      <Body>
        If it keeps showing this screen: remove the wallet below, then choose "Restore" and type your recovery words.
      </Body>
      <RemoveWallet onRemoved={onRemoved} />
    </Screen>
  );
}
