/*
 * App.js — the Signer's starting screen
 * =====================================
 *
 * This is the first file Expo runs when the app opens (via index.js).
 *
 * Right now (Stage 0 — Skeleton) it only shows a short "not ready yet"
 * message. It does NOT touch any wallet or key.
 *
 * In later stages this file becomes the "traffic controller" that decides
 * which screen to show:
 *   - no wallet set up yet      → the Wallet setup screen
 *   - wallet exists, locked     → the Lock screen (asks for your password)
 *   - a request came from Hub   → the Approval screen
 *   - otherwise                 → the Settings / home screen
 *
 * See HOW-IT-WORKS.md (section 4) for what each of those screens does.
 */

// "import" lines borrow ready-made building blocks.
// StatusBar controls the phone's top bar (clock, battery) colour.
import { StatusBar } from 'expo-status-bar';
// StyleSheet = how things look; Text = words on screen; View = a box that holds things.
import { StyleSheet, Text, View } from 'react-native';

// This function describes what the screen shows. React calls it to draw the app.
export default function App() {
  return (
    // The outer box fills the whole screen (see "container" in styles below).
    <View style={styles.container}>
      <Text style={styles.title}>KLV Signer</Text>
      <Text style={styles.subtitle}>Stage 0: skeleton. Nothing to sign yet.</Text>
      {/* "light" = white clock/battery icons, which suit our dark background. */}
      <StatusBar style="light" />
    </View>
  );
}

// All the visual settings in one place. Colours match the Hub's dark icon background.
const styles = StyleSheet.create({
  container: {
    flex: 1,                    // take up all available space
    backgroundColor: '#121214', // near-black, same as the Hub's icon background
    alignItems: 'center',       // centre left-to-right
    justifyContent: 'center',   // centre top-to-bottom
    padding: 24,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: '#9B968A',
    fontSize: 15,
    textAlign: 'center',
  },
});
