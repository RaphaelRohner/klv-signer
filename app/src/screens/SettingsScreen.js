/*
 * SettingsScreen.js — everything that isn't needed every day
 * ==========================================================
 *
 * Opened with "Settings" on Home (new layout, 1 Oct 2026). Grouped into:
 *
 *   UNLOCKING     Fingerprint or face (on/off), Change password
 *   SIGNING       Extra confirmation (with a one-line summary of your rules),
 *                 Connected apps (with Remove buttons)
 *   THIS PHONE    the phone-safety check results (root, bootloader, screen
 *                 lock, keyboard, accessibility apps), explained
 *   ABOUT         version, the seal (signing key) THIS copy carries as Android
 *                 reports it, whether it matches the official one, how long the
 *                 last unlock took (test info), "Before you start" (risks
 *                 and terms), "Share info for support" (plain text instead
 *                 of screenshots, which the Signer blocks), and the
 *                 developer tool "Sign a test transaction"
 *   DANGER ZONE   Remove wallet from this phone
 */

import React, { useEffect, useState } from 'react';
import { Platform, Share, StyleSheet, Text, View } from 'react-native';
import {
  Body, Button, Card, ListRow, Notice, Screen, ScreenHeader, SectionLabel, Strong, colors,
} from '../components/ui.js';
import BiometricSetting from '../components/BiometricSetting.js';
import ConnectedAppsList from '../components/ConnectedAppsList.js';
import RemoveWallet from '../components/RemoveWallet.js';
import { DEVICE_CHECK_LIMIT, isOfficialCopy, isSigningBlocked, SIGNING_BLOCKED_TEXT } from '../security/deviceChecks.js';
import { getDeviceSecurity } from '../../modules/klv-signer-requests/index.js';
import { DEFAULT_RULES, formatKlv } from '../security/extraConfirmation.js';
import { loadRules } from '../storage/signingRules.js';
import { NETWORK, OFFICIAL_SIGNING_KEY } from '../config.js';
import appJson from '../../app.json';

/** "6 rules on · over 100 KLV · wait 10 s" — a short summary of the extra-confirmation rules. */
export function describeRules(saved) {
  const r = { ...DEFAULT_RULES, ...(saved || {}) };
  const on = ['newReceiver', 'otherTokens', 'nfts', 'firstAppRequest', 'multiTransfer', 'burst'].filter((k) => r[k]).length
    + (r.klvThreshold ? 1 : 0);
  const parts = [on === 0 ? 'All rules off' : `${on} ${on === 1 ? 'rule' : 'rules'} on`];
  if (r.klvThreshold) parts.push(`over ${formatKlv(BigInt(r.klvThreshold))} KLV`);
  if (r.waitSeconds) parts.push(`wait ${r.waitSeconds} s`);
  if (r.trusted && r.trusted.length) parts.push(`${r.trusted.length} trusted`);
  return parts.join(' · ');
}

/**
 * @param {object} props
 * @param {object[]} props.deviceFindings
 * @param {{seconds:number, engine:string}|null} props.unlockInfo  test info from the last unlock
 * @param {string} [props.notice]  a one-off message (e.g. "Password changed")
 * @param {() => void} props.onBack
 * @param {() => void} props.onChangePassword
 * @param {() => void} props.onSigningRules
 * @param {() => void} props.onSignTest
 * @param {() => void} props.onRemoved
 * @param {() => void} props.onTerms   opens "Before you start" (risks and terms)
 */
export default function SettingsScreen({
  deviceFindings, unlockInfo, notice, onBack, onChangePassword, onSigningRules, onSignTest, onRemoved, onTerms,
}) {
  const [rulesSummary, setRulesSummary] = useState('');
  const [showRemove, setShowRemove] = useState(false);
  const blocked = isSigningBlocked(deviceFindings);
  // The seal THIS copy carries, as Android reports it (null = not known yet / unknown).
  const [ownSeal, setOwnSeal] = useState(null);
  useEffect(() => {
    getDeviceSecurity().then((r) => setOwnSeal((r && r.signingCertificates) || [])).catch(() => setOwnSeal([]));
  }, []);
  const official = ownSeal ? isOfficialCopy(ownSeal) : null;

  useEffect(() => {
    loadRules().then((r) => setRulesSummary(describeRules(r))).catch(() => setRulesSummary('Couldn\'t read your rules'));
  }, []);

  return (
    <Screen>
      <ScreenHeader title="Settings" onBack={onBack} />
      {notice ? <Notice kind="info">{notice}</Notice> : null}

      <SectionLabel>Unlocking</SectionLabel>
      <Card>
        <BiometricSetting />
        <View style={styles.divider} />
        <ListRow title="Change password" onPress={onChangePassword} last />
      </Card>

      <SectionLabel>Signing</SectionLabel>
      <Card>
        <ListRow title="Extra confirmation" subtitle={rulesSummary || ' '} onPress={onSigningRules} last />
      </Card>

      <SectionLabel>Connected apps</SectionLabel>
      <ConnectedAppsList />

      <SectionLabel>This phone</SectionLabel>
      <Card style={styles.padded}>
        {deviceFindings.length === 0 ? (
          <Line color={colors.accent} text="No problems found: not rooted, bootloader locked, screen lock set." />
        ) : (
          <>
            {blocked ? <Body><Strong>Signing is switched off.</Strong> {SIGNING_BLOCKED_TEXT}</Body> : null}
            {deviceFindings.map((f) => (
              <Line key={f.id} color={f.blocks ? colors.danger : colors.warning} text={`${f.title}. ${f.text}`} />
            ))}
          </>
        )}
        <Text style={styles.small}>{DEVICE_CHECK_LIMIT}</Text>
      </Card>

      <SectionLabel>About</SectionLabel>
      <Card style={styles.padded}>
        <View style={styles.pair}>
          <Text style={styles.key}>Version</Text>
          <Text style={styles.value}>{appJson.expo.version} · {NETWORK === 'testnet' ? 'testnet preview' : 'mainnet'}</Text>
        </View>
        <Text style={[styles.key, styles.spaced]}>This copy is signed with (as Android reports it)</Text>
        <Text selectable style={styles.mono}>
          {ownSeal === null ? 'Checking…' : ownSeal.length === 0 ? 'Android didn\'t say' : ownSeal.map((c) => c.match(/../g).join(':')).join('\n')}
        </Text>
        {official === true ? <Line color={colors.accent} text="Matches the official KLV Signer key." /> : null}
        {official === false ? <Line color={colors.danger} text="Does NOT match the official key. If you didn't build this copy yourself, it may be a fake." /> : null}
        <Text style={[styles.key, styles.spaced]}>Official signing key (SHA-256)</Text>
        <Text selectable style={styles.mono}>{OFFICIAL_SIGNING_KEY}</Text>
        <Text style={styles.small}>Also published in the README and the release notes.</Text>
        {unlockInfo ? (
          <Text style={[styles.small, styles.spaced]}>
            {unlockInfo.engine === 'fingerprint or face'
              ? 'Last unlock: fingerprint or face.'
              : `Last unlock: password check took ${unlockInfo.seconds.toFixed(1)} s (${unlockInfo.engine} engine).`}
          </Text>
        ) : null}
      </Card>
      <Card>
        <ListRow title="Before you start" subtitle="Risks and terms (free software, as is)" onPress={onTerms} />
        <ListRow
          title="Share info for support"
          subtitle="Version, phone checks and settings as text; no address, nothing secret. Opens the share sheet (the Signer locks)."
          onPress={() => Share.share({ message: supportInfo(deviceFindings, rulesSummary, ownSeal) }).catch(() => {})}
        />
        <ListRow
          title="Sign a test transaction"
          subtitle="Developer tool: paste a transaction by hand"
          onPress={onSignTest}
          disabled={blocked}
          last
        />
      </Card>

      <SectionLabel danger>Danger zone</SectionLabel>
      {showRemove ? (
        <RemoveWallet onRemoved={onRemoved} onCancel={() => setShowRemove(false)} />
      ) : (
        <Button title="Remove wallet from this phone…" kind="danger" onPress={() => setShowRemove(true)} />
      )}
    </Screen>
  );
}

/**
 * supportInfo — a plain-text summary for asking for help (e.g. on the forum),
 * instead of screenshots (which the Signer blocks). Contains NO address,
 * keys, words or passwords: only the version, Android version, the phone
 * check results, the extra-confirmation summary, and this copy's seal
 * compared with the official one (public, not secret).
 */
export function supportInfo(findings, rulesSummary, ownSeal) {
  const official = ownSeal ? isOfficialCopy(ownSeal) : null;
  return [
    'KLV Signer support info',
    `Version: ${appJson.expo.version} (${NETWORK})`,
    `Android: ${Platform.OS === 'android' ? `API ${Platform.Version}` : Platform.OS}`,
    `Phone checks: ${findings.length === 0 ? 'no problems found' : findings.map((f) => f.title).join('; ')}`,
    `Extra confirmation: ${rulesSummary || 'unknown'}`,
    `This copy's signing key: ${ownSeal && ownSeal.length ? ownSeal.join(', ') : 'unknown'}`,
    `Official key: ${OFFICIAL_SIGNING_KEY} (${official === true ? 'matches' : official === false ? 'DOES NOT MATCH' : 'not checked'})`,
    '(No address, keys, recovery words or passwords are included.)',
  ].join('\n');
}

/** One line with a coloured dot in front. */
function Line({ color, text }) {
  return (
    <View style={styles.line}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.lineText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  padded: { padding: 16 },
  line: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 7, marginRight: 10 },
  lineText: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 21 },
  small: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  pair: { flexDirection: 'row' },
  key: { color: colors.muted, fontSize: 14, flex: 1 },
  value: { color: colors.text, fontSize: 14 },
  spaced: { marginTop: 12 },
  mono: { color: colors.text, fontSize: 12, lineHeight: 18, fontFamily: 'monospace', marginTop: 4, marginBottom: 4 },
});
