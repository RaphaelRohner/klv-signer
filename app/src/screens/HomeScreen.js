/*
 * HomeScreen.js — shown after unlocking
 * =====================================
 *
 * Stage 2 version. It shows:
 *   - your wallet address (public, safe to share: long-press to copy it),
 *   - which network the Signer is set to (testnet),
 *   - test information: how long the last unlock took and which engine did
 *     the password work (see crypto/passwordKey.js). This helps us tune the
 *     speed on your phone.
 *   - "Sign a test transaction" (Stage 2: paste a transaction by hand),
 *   - "Lock now" and "Remove wallet from this phone".
 *
 * From Stage 3 on, signing requests from other apps will open the approval
 * screen directly.
 */

import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Body, Button, Gap, NetworkBadge, Notice, Screen, Strong, Title, colors } from '../components/ui.js';
import RemoveWallet from '../components/RemoveWallet.js';

/**
 * @param {object} props
 * @param {string} props.address
 * @param {{seconds:number, engine:string}|null} props.unlockInfo  test info from the last unlock
 * @param {boolean} props.justCreated   true right after setup (shows a "saved" message)
 * @param {() => void} props.onLock
 * @param {() => void} props.onSignTest  opens the "sign a test transaction" screen
 * @param {() => void} props.onRemoved
 */
export default function HomeScreen({ address, unlockInfo, justCreated, onLock, onSignTest, onRemoved }) {
  const [showRemove, setShowRemove] = useState(false);

  return (
    <Screen>
      <NetworkBadge />
      <Title>Your wallet</Title>

      {justCreated ? (
        <Notice kind="info">
          Your wallet is set up and locked with your password. Try "Lock now" and unlock again to check the
          password works.
        </Notice>
      ) : null}

      <Body muted>Address (long-press to copy; safe to share)</Body>
      <Text selectable style={styles.address}>{address}</Text>

      <Notice kind="info">
        <Body>
          <Strong>Stage 2.</Strong> The Signer can read and sign transactions you paste in by hand. Other apps
          will be able to send it requests in Stage 3.
        </Body>
      </Notice>

      {unlockInfo ? (
        <Body muted>
          Test info: the last password check took {unlockInfo.seconds.toFixed(1)} s using the{' '}
          {unlockInfo.engine} engine.
        </Body>
      ) : null}

      <Gap />
      <Button title="Sign a test transaction" onPress={onSignTest} />
      <Button title="Lock now" kind="secondary" onPress={onLock} />
      <Gap size={24} />
      {showRemove ? (
        <RemoveWallet onRemoved={onRemoved} onCancel={() => setShowRemove(false)} />
      ) : (
        <Button title="Remove wallet from this phone…" kind="danger" onPress={() => setShowRemove(true)} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  address: { color: colors.accent, fontSize: 15, fontFamily: 'monospace', marginBottom: 12 },
});
