/*
 * ConnectedAppsList.js — the "Connected apps" section (Settings screen)
 * ======================================================================
 *
 * Lists the apps you've allowed to send requests (see requests/appTrust.js),
 * with a Remove button for each. A removed app has to ask "Allow this app?"
 * again next time.
 */

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Body, Card, ListRow, colors } from './ui.js';
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

  if (entries.length === 0) {
    return (
      <Card style={styles.empty}>
        <Body muted>No apps yet. When an app asks to use the Signer, you'll be asked whether to allow it.</Body>
      </Card>
    );
  }
  return (
    <Card>
      {entries.map(([packageName, app], i) => (
        <ListRow
          key={packageName}
          title={app.label}
          subtitle={packageName}
          last={i === entries.length - 1}
          right={(
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${app.label}`}
              onPress={() => remove(packageName)}
              style={({ pressed }) => [styles.remove, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.removeText}>Remove</Text>
            </Pressable>
          )}
        />
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  empty: { padding: 16 },
  remove: {
    minHeight: 40, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  removeText: { color: colors.dangerText, fontSize: 13 },
});
