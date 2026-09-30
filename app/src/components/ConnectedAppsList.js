/*
 * ConnectedAppsList.js — the "Connected apps" section on the Home screen
 * ======================================================================
 *
 * Lists the apps you've allowed to send requests (see requests/appTrust.js),
 * with a Remove button for each. A removed app has to ask "Allow this app?"
 * again next time.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Body, Button, colors } from './ui.js';
import { loadConnectedApps, saveConnectedApps } from '../storage/connectedApps.js';
import { withoutApp } from '../requests/appTrust.js';

export default function ConnectedAppsList() {
  const [apps, setApps] = useState(null);

  useEffect(() => {
    loadConnectedApps().then(setApps).catch(() => setApps({}));
  }, []);

  async function remove(packageName) {
    const next = withoutApp(apps, packageName);
    await saveConnectedApps(next);
    setApps(next);
  }

  if (apps === null) return null;
  const entries = Object.entries(apps);

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Connected apps</Text>
      {entries.length === 0 ? (
        <Body muted>No apps yet. When an app asks to use the Signer, you'll be asked whether to allow it.</Body>
      ) : (
        entries.map(([packageName, app]) => (
          <View key={packageName} style={styles.row}>
            <Text style={styles.name}>{app.label}</Text>
            <Text style={styles.mono}>{packageName}</Text>
            <Button title="Remove" kind="secondary" onPress={() => remove(packageName)} />
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 24 },
  heading: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 8 },
  row: {
    backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 12,
    padding: 12, marginBottom: 10,
  },
  name: { color: colors.text, fontSize: 16, fontWeight: '600' },
  mono: { color: colors.muted, fontSize: 13, fontFamily: 'monospace' },
});
