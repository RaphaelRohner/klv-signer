/*
 * HomeScreen.js — shown after unlocking
 * =====================================
 *
 * Only what you need day to day (new layout, 1 Oct 2026):
 *   - the top line: "KLV Signer", the network badge and a Settings button,
 *   - one-off messages (e.g. "Password changed", "Your wallet is set up"),
 *   - your wallet address: in little boxes of 4 characters, with "Show QR
 *     code" (another wallet scans it to send to you) and "Copy or share"
 *     (Android's share sheet, which includes "Copy"),
 *   - a status line: "Ready to sign", or a warning if the phone looks unsafe
 *     (details are on the Settings screen; on a rooted or unlocked phone
 *     signing is switched off),
 *   - the apps you've allowed ("Connected apps"), with when each last had
 *     something signed,
 *   - "Lock now".
 *
 * Everything else (fingerprint/face, password, extra confirmation, removing
 * the wallet, test tools) is on the Settings screen (SettingsScreen.js).
 * Signing requests from other apps open the approval screen directly.
 */

import React, { useEffect, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { AddressBlocks, Body, Button, Card, NetworkBadge, Notice, Screen, colors } from '../components/ui.js';
import { loadConnectedApps } from '../storage/connectedApps.js';
import { loadHistory } from '../storage/signingRules.js';
import { isSigningBlocked } from '../security/deviceChecks.js';

/**
 * @param {object} props
 * @param {string} props.address
 * @param {boolean} props.justCreated   true right after setup (shows a "saved" message)
 * @param {object[]} props.deviceFindings  phone-safety warnings (security/deviceChecks.js)
 * @param {boolean} props.deviceChecked    false until the first phone check has finished
 * @param {string} [props.notice]  a one-off message (e.g. "Password changed")
 * @param {() => void} props.onLock
 * @param {() => void} props.onSettings   opens the Settings screen
 * @param {() => void} props.onReceive    opens the QR code screen
 * @param {() => void} [props.onShareStart]  called just before the share sheet opens
 *        (so leaving for it doesn't lock the Signer, see App.js SHARE_GRACE_MS)
 */
export default function HomeScreen({
  address, justCreated, notice, deviceFindings, deviceChecked = true, onLock, onSettings, onReceive, onShareStart,
}) {
  return (
    <Screen>
      <View style={styles.top}>
        <Text style={styles.appName} accessibilityRole="header">KLV Signer</Text>
        <NetworkBadge />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          onPress={onSettings}
          style={({ pressed }) => [styles.settings, pressed && styles.pressed]}
        >
          <Text style={styles.settingsText}>Settings</Text>
        </Pressable>
      </View>

      {notice ? <Notice kind="info">{notice}</Notice> : null}
      {justCreated ? (
        <Notice kind="info">
          Your wallet is set up and locked with your password. Try "Lock now" and unlock again to check the
          password works.
        </Notice>
      ) : null}

      {/* The address: public, safe to share. */}
      <Card style={styles.addressCard}>
        <Text style={styles.label}>Your address · safe to share</Text>
        <AddressBlocks address={address} />
        <View style={styles.buttonRow}>
          <Button title="Show QR code" kind="secondary" onPress={onReceive} style={styles.half} />
          <Button title="Copy or share" kind="secondary" onPress={() => { if (onShareStart) onShareStart(); shareAddress(address); }} style={styles.half} />
        </View>
      </Card>

      <Status findings={deviceFindings} checked={deviceChecked} />

      <ConnectedApps onManage={onSettings} />

      <View style={styles.spacer} />
      <Body muted style={styles.footnote}>Apps send their requests here. Every signature needs your password or fingerprint.</Body>
      <Button title="Lock now" onPress={onLock} />
    </Screen>
  );
}

/**
 * Opens Android's share sheet with the address. It has a "Copy" option, so
 * this also copies the address, without the Signer needing clipboard access.
 */
function shareAddress(address) {
  Share.share({ message: address }).catch(() => {});
}

/** "Ready to sign", or what's wrong with the phone (details in Settings). */
function Status({ findings, checked }) {
  if (!checked) return <Notice kind="info">Checking the phone…</Notice>;
  if (isSigningBlocked(findings)) {
    return (
      <Notice kind="danger">
        <Text style={styles.statusTitle}>Signing is switched off on this phone</Text>
        <Text style={styles.statusText}>{findings.map((f) => f.title).join('; ')}. Details in Settings → This phone.</Text>
      </Notice>
    );
  }
  if (findings && findings.length > 0) {
    return (
      <Notice kind="warning">
        <Text style={styles.statusTitle}>Ready to sign, with {findings.length === 1 ? 'a warning' : `${findings.length} warnings`}</Text>
        <Text style={styles.statusText}>{findings.map((f) => f.title).join('; ')}. Details in Settings → This phone.</Text>
      </Notice>
    );
  }
  return (
    <Notice kind="info">
      <Text style={styles.statusTitle}>Ready to sign</Text>
      <Text style={styles.statusText}>Phone checks passed · no internet access</Text>
    </Notice>
  );
}

/** The allowed apps, with when each last had something signed (from this phone's own history). */
function ConnectedApps({ onManage }) {
  const [apps, setApps] = useState(null);
  const [lastSigned, setLastSigned] = useState({});

  useEffect(() => {
    loadConnectedApps().then(setApps).catch(() => setApps({}));
    loadHistory().then((h) => setLastSigned(h.apps || {})).catch(() => {});
  }, []);

  if (apps === null) return null;
  const entries = Object.entries(apps);

  return (
    <View style={styles.apps}>
      <View style={styles.appsHead}>
        <Text style={styles.appsTitle} accessibilityRole="header">Connected apps</Text>
        <Pressable accessibilityRole="button" onPress={onManage} hitSlop={10}>
          <Text style={styles.link}>Manage</Text>
        </Pressable>
      </View>
      {entries.length === 0 ? (
        <Body muted>No apps yet. When an app asks to use the Signer, you'll be asked whether to allow it.</Body>
      ) : (
        <Card>
          {entries.map(([packageName, app], i) => (
            <View key={packageName} style={[styles.appRow, i < entries.length - 1 && styles.divider]}>
              <View style={styles.appLetter}><Text style={styles.appLetterText}>{(app.label || '?').slice(0, 1).toUpperCase()}</Text></View>
              <View style={styles.flex}>
                <Text style={styles.appName2} numberOfLines={1}>{app.label}</Text>
                <Text style={styles.appSub} numberOfLines={1}>
                  {lastSigned[packageName] ? `Last signature ${describeWhen(lastSigned[packageName])}` : 'Allowed, nothing signed yet'}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      )}
    </View>
  );
}

/** "today, 14:23" / "yesterday" / "3 Oct 2026". */
function describeWhen(time) {
  const d = new Date(time);
  const now = new Date();
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (sameDay(d, now)) return `today, ${hhmm}`;
  const yesterday = new Date(now.getTime() - 86400000);
  if (sameDay(d, yesterday)) return `yesterday, ${hhmm}`;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, minHeight: 48 },
  appName: { flex: 1, color: colors.text, fontSize: 18, fontWeight: '600' },
  settings: {
    marginLeft: 10, minHeight: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  settingsText: { color: colors.text, fontSize: 14 },
  pressed: { opacity: 0.7 },
  addressCard: { padding: 18 },
  label: { color: colors.muted, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 },
  buttonRow: { flexDirection: 'row', marginHorizontal: -5, marginTop: 4 },
  half: { flex: 1, marginHorizontal: 5 },
  statusTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  statusText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 2 },
  apps: { marginTop: 16 },
  appsHead: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 4, paddingHorizontal: 2 },
  appsTitle: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '600' },
  link: { color: colors.accent, fontSize: 14 },
  appRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  appLetter: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: colors.raised, alignItems: 'center',
    justifyContent: 'center', marginRight: 12,
  },
  appLetterText: { color: colors.warning, fontSize: 16, fontWeight: '600' },
  appName2: { color: colors.text, fontSize: 15 },
  appSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  spacer: { flexGrow: 1, minHeight: 24 },
  footnote: { marginBottom: 0 },
});
