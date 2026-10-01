/*
 * ConnectAppScreen.js — "Allow this app to use the Signer?"
 * =========================================================
 *
 * Shown the first time an app asks the Signer for something (and again, with
 * a warning, if a remembered app suddenly has a different certificate).
 *
 * What you see comes from Android, not from the app:
 *   - the app's name (note: any app can CALL itself anything),
 *   - its package id (unique on this phone: the thing to check),
 *   - its certificate fingerprint (unique to its developer).
 *
 * Allowing only means the app may SEND requests. It learns your address, and
 * every transaction still needs your approval and password, one by one.
 * You can remove connected apps on the Home screen at any time.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Body, Button, NetworkBadge, Notice, Screen, Strong, Title, colors } from '../components/ui.js';
import { shortFingerprint, cleanLabel } from '../requests/appTrust.js';
import { describeAction } from '../requests/protocol.js';

/**
 * @param {object} props
 * @param {object} props.request   the incoming request (caller details from Android)
 * @param {'unknown'|'certChanged'} props.trust
 * @param {() => void} props.onAllow
 * @param {() => void} props.onDeny
 */
export default function ConnectAppScreen({ request, trust, onAllow, onDeny }) {
  const changed = trust === 'certChanged';
  return (
    <Screen>
      <NetworkBadge />
      <Title>{changed ? 'This app has changed' : 'Allow this app?'}</Title>

      {changed ? (
        <Notice kind="danger">
          <Body>
            <Strong>Careful:</Strong> an app with this id was allowed before, but it was signed by a different
            developer certificate. It may be a fake copy. Only allow it if you know it was reinstalled from a
            source you trust.
          </Body>
        </Notice>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.label}>App name</Text>
        <Text style={styles.name}>{cleanLabel(request.callerLabel)}</Text>
        <Text style={[styles.label, { marginTop: 10 }]}>App id (check this)</Text>
        <Text selectable style={styles.mono}>{request.callerPackage}</Text>
        <Text style={[styles.label, { marginTop: 10 }]}>Certificate fingerprint</Text>
        <Text selectable style={styles.monoSmall}>{shortFingerprint(request.callerCertSha256)}</Text>
      </View>

      <Body>
        It wants to <Strong>{describeAction(request.action)}</Strong>.
      </Body>
      <Notice kind="info">
        <Body>
          If you allow it, this app can see your wallet address and send you transactions to approve. It can never
          sign anything by itself: every transaction still needs your approval and password. You can remove it
          on the Home screen at any time.
        </Body>
      </Notice>

      <Button title="Allow" onPress={onAllow} />
      <Button title="Don't allow" kind="danger" onPress={onDeny} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 12,
    padding: 14, marginVertical: 12,
  },
  label: { color: colors.muted, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  name: { color: colors.text, fontSize: 22, fontWeight: '700' },
  mono: { color: colors.accent, fontSize: 15, fontFamily: 'monospace' },
  monoSmall: { color: colors.muted, fontSize: 13, fontFamily: 'monospace' },
});
