/*
 * WelcomeScreen.js — the first screen when no wallet is set up yet
 * ================================================================
 *
 * Offers two ways to get a wallet into the Signer:
 *   - Create a new wallet  → makes a fresh recovery phrase
 *   - Restore a wallet     → type in an existing recovery phrase
 *
 * This screen only shows buttons. What happens next is decided in App.js.
 */

import React from 'react';
import { Body, Button, Gap, NetworkBadge, Notice, Screen, Title } from '../components/ui.js';

/**
 * @param {object} props
 * @param {() => void} props.onCreate   called when "Create a new wallet" is tapped
 * @param {() => void} props.onRestore  called when "Restore a wallet" is tapped
 */
export default function WelcomeScreen({ onCreate, onRestore }) {
  return (
    <Screen>
      <NetworkBadge />
      <Title>KLV Signer</Title>
      <Body>
        This app keeps your Klever wallet's private key safe on this phone and signs transactions for
        other Klever apps, only when you approve. Those apps never see the key.
      </Body>
      <Notice kind="warning">
        Testing phase: please only use a brand-new wallet that has never held anything of real value.
      </Notice>
      <Gap />
      <Button title="Create a new wallet" onPress={onCreate} />
      <Button title="Restore a wallet from its recovery phrase" kind="secondary" onPress={onRestore} />
    </Screen>
  );
}
