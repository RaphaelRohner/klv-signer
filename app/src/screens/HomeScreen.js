/*
 * HomeScreen.js — shown after unlocking
 * =====================================
 *
 * Stage 3 version. It shows:
 *   - your wallet address (public, safe to share: long-press to copy it),
 *   - which network the Signer is set to (testnet),
 *   - test information: how long the last unlock took and which engine did
 *     the password work (see crypto/passwordKey.js). This helps us tune the
 *     speed on your phone.
 *   - "Sign a test transaction" (Stage 2: paste a transaction by hand),
 *   - a warning if the phone looks rooted or unlocked (then signing is
 *     switched off), has no screen lock, a keyboard you installed yourself,
 *     or apps with accessibility access,
 *   - the "Fingerprint or face" switch (optional shortcut for the password),
 *   - the apps you've allowed to use the Signer ("Connected apps"),
 *   - "Extra confirmation" settings (when a transaction needs a second, stricter
 *     confirmation; see security/extraConfirmation.js),
 *   - "Change password", "Lock now" and "Remove wallet from this phone".
 *
 * From Stage 3 on, signing requests from other apps will open the approval
 * screen directly.
 */

import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Body, Button, Gap, NetworkBadge, Notice, Screen, Strong, Title, colors } from '../components/ui.js';
import RemoveWallet from '../components/RemoveWallet.js';
import ConnectedAppsList from '../components/ConnectedAppsList.js';
import DeviceWarning from '../components/DeviceWarning.js';
import BiometricSetting from '../components/BiometricSetting.js';

/**
 * @param {object} props
 * @param {string} props.address
 * @param {{seconds:number, engine:string}|null} props.unlockInfo  test info from the last unlock
 * @param {boolean} props.justCreated   true right after setup (shows a "saved" message)
 * @param {() => void} props.onLock
 * @param {object[]} props.deviceFindings  phone-safety warnings (security/deviceChecks.js)
 * @param {() => void} props.onSignTest  opens the "sign a test transaction" screen
 * @param {string} [props.notice]  a one-off message (e.g. "Password changed")
 * @param {() => void} props.onChangePassword  opens the change-password screen
 * @param {() => void} props.onSigningRules    opens the "Extra confirmation" settings
 * @param {boolean} props.signingBlocked  true on a rooted/unlocked phone: no signing
 * @param {() => void} props.onRemoved
 */
export default function HomeScreen({ address, unlockInfo, justCreated, onLock, onSignTest, onRemoved, deviceFindings, signingBlocked, notice, onChangePassword, onSigningRules }) {
  const [showRemove, setShowRemove] = useState(false);

  return (
    <Screen>
      <NetworkBadge />
      <Title>Your wallet</Title>
      <DeviceWarning findings={deviceFindings} />
      {notice ? <Notice kind="info">{notice}</Notice> : null}

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
          <Strong>Stage 3.</Strong> Other apps can now ask the Signer to sign, and you approve each request here.
          You can still paste a test transaction by hand.
        </Body>
      </Notice>

      {unlockInfo ? (
        <Body muted>
          {unlockInfo.engine === 'fingerprint or face'
            ? 'Unlocked with fingerprint or face.'
            : `Test info: the last password check took ${unlockInfo.seconds.toFixed(1)} s using the ${unlockInfo.engine} engine.`}
        </Body>
      ) : null}

      <Gap />
      <Button title="Sign a test transaction" onPress={onSignTest} disabled={signingBlocked} />
      <Button title="Lock now" kind="secondary" onPress={onLock} />
      <Button title="Extra confirmation settings" kind="secondary" onPress={onSigningRules} />
      <Button title="Change password" kind="secondary" onPress={onChangePassword} />
      <BiometricSetting />
      <ConnectedAppsList />
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
