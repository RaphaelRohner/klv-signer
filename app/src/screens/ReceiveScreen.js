/*
 * ReceiveScreen.js — your address as a QR code
 * ============================================
 *
 * Opened with "Show QR code" on Home. Shows your public klv1… address as a
 * QR code, so someone can scan it with the Klever app (or another wallet) to
 * send you KLV, and the address as text below it to compare.
 *
 * The QR code holds ONLY the address, nothing secret. It's drawn by the
 * Signer itself, offline (klever/qr.js works out which squares are dark,
 * and we draw them as plain boxes).
 * Screenshots are allowed here (you may want to share your address).
 */

import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AddressBlocks, Body, Button, Card, Screen, ScreenHeader, colors } from '../components/ui.js';
import { qrRuns } from '../klever/qr.js';

/** Size of the QR code on screen (points). */
const QR_SIZE = 260;
/** White border around the code, in squares (scanners need some quiet space). */
const QUIET = 3;

/**
 * @param {object} props
 * @param {string} props.address
 * @param {() => void} props.onBack
 */
export default function ReceiveScreen({ address, onBack }) {
  const code = useMemo(() => qrRuns(address), [address]);
  const cells = code.size + QUIET * 2;
  const unit = QR_SIZE / cells;

  return (
    <Screen>
      <ScreenHeader title="Receive" onBack={onBack} />
      <Body muted>Scan this with the Klever app or another wallet to send to this address.</Body>

      <View
        style={[styles.qr, { width: QR_SIZE, height: QR_SIZE }]}
        accessible
        accessibilityRole="image"
        accessibilityLabel="QR code of your address"
      >
        {code.rows.map((runs, r) => runs.map(([c, len]) => (
          <View
            key={`${r}-${c}`}
            style={{
              position: 'absolute',
              left: (c + QUIET) * unit,
              top: (r + QUIET) * unit,
              // A hair wider/taller than one square, so no thin gaps appear between boxes.
              width: len * unit + 0.5,
              height: unit + 0.5,
              backgroundColor: '#000',
            }}
          />
        )))}
      </View>

      <Card style={styles.card}>
        <Text style={styles.label}>Your address</Text>
        <AddressBlocks address={address} />
      </Card>
      <Body muted>Before someone sends you something, check together that the start and the end of the address match.</Body>
      <Button title="Done" kind="secondary" onPress={onBack} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  qr: { alignSelf: 'center', backgroundColor: '#fff', borderRadius: 16, marginVertical: 16, overflow: 'hidden' },
  card: { padding: 16 },
  label: { color: colors.muted, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
});
