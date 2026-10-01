/*
 * ui.js — the Signer's shared building blocks for screens
 * =======================================================
 *
 * Every screen is built from the same few pieces: a page, a title, some
 * text, text boxes and buttons. Defining them once here keeps all screens
 * looking the same, and means a colour or size change happens in one place.
 *
 * Nothing in this file knows about wallets or passwords. It's only looks.
 */

import React from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NETWORK } from '../config.js';

// ---------------------------------------------------------------------------
// Colours: dark background like the Hub, one teal accent, red for danger
// ---------------------------------------------------------------------------
export const colors = {
  background: '#121214',
  card: '#1E1C18',
  border: '#37342C',
  text: '#EDEAE3',
  muted: '#9B968A',
  accent: '#3FD1C6',
  accentText: '#0B0B0C',
  danger: '#FF6B5E',
  warning: '#F2C14E',
};

/**
 * Screen — the page every screen sits on.
 * Keeps content clear of the notch/status bar, lets long pages scroll, and
 * moves content up when the keyboard opens so text boxes stay visible.
 */
export function Screen({ children }) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Title — the big heading at the top of a screen. */
export function Title({ children }) {
  return <Text style={styles.title}>{children}</Text>;
}

/** Body — normal paragraph text. `muted` makes it grey (for side notes). */
export function Body({ children, muted, style }) {
  return <Text style={[styles.body, muted && styles.muted, style]}>{children}</Text>;
}

/** Strong — bold text inside a Body. */
export function Strong({ children }) {
  return <Text style={styles.strong}>{children}</Text>;
}

/**
 * Notice — a coloured box for important messages.
 * kind: 'warning' (yellow), 'danger' (red) or 'info' (teal).
 */
export function Notice({ kind = 'info', children }) {
  const edge = kind === 'danger' ? colors.danger : kind === 'warning' ? colors.warning : colors.accent;
  return (
    // accessibilityLiveRegion: screen readers (TalkBack) read the message out
    // when it appears, e.g. "Wrong password." ('assertive' for problems).
    <View
      style={[styles.notice, { borderLeftColor: edge }]}
      accessibilityLiveRegion={kind === 'danger' ? 'assertive' : 'polite'}
    >
      {isPlainText(children) ? <Text style={styles.body}>{children}</Text> : children}
    </View>
  );
}

/**
 * Is this only text (and numbers)? E.g. `Try again in {waitText}.` arrives as
 * several pieces, not one string. Text must sit inside a <Text>, or Android
 * shows nothing (this hid the "try again in …" countdown until 1 Oct 2026).
 */
function isPlainText(children) {
  const parts = React.Children.toArray(children);
  return parts.length > 0 && parts.every((p) => typeof p === 'string' || typeof p === 'number');
}

/**
 * Button — a tappable button.
 *   kind: 'primary' (filled teal), 'secondary' (outlined) or 'danger' (red outline)
 *   busy: shows a spinner and ignores taps (while something slow runs)
 *   disabled: greyed out and ignores taps
 */
export function Button({ title, onPress, kind = 'primary', disabled, busy }) {
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      onPress={inactive ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        kind === 'primary' ? styles.buttonPrimary : styles.buttonOutline,
        kind === 'danger' && { borderColor: colors.danger },
        inactive && styles.buttonInactive,
        pressed && !inactive && styles.buttonPressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={kind === 'primary' ? colors.accentText : colors.accent} />
      ) : (
        <Text
          style={[
            styles.buttonText,
            kind === 'primary' ? { color: colors.accentText } : { color: colors.text },
            kind === 'danger' && { color: colors.danger },
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

/**
 * Field — a labelled text box.
 *
 * `secret` hides what you type (for passwords) and adds a "Show"/"Hide"
 * button, so you can check what you typed. For secret words we also
 * switch off auto-correct, auto-capitals and the keyboard's word
 * suggestions, so the keyboard app doesn't "learn" your recovery words.
 * Any other TextInput settings can be passed through (`...rest`).
 */
export function Field({ label, secret, noLearning, error, ...rest }) {
  // For password boxes: is the password currently shown in plain text?
  // Starts hidden every time the screen opens.
  const [revealed, setRevealed] = React.useState(false);
  const privacy = secret || noLearning
    ? {
      autoCorrect: false,
      autoCapitalize: 'none',
      autoComplete: 'off',
      importantForAutofill: 'no',
      spellCheck: false,
      // On Android, 'visible-password' turns off suggestions and learning
      // while still showing the letters (used for recovery words, and for a
      // password while "Show" is on: otherwise some keyboards start learning
      // the password as soon as it's visible; second review).
      keyboardType: (noLearning && !secret) || (secret && revealed) ? 'visible-password' : 'default',
    }
    : {};
  return (
    <View style={styles.fieldWrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.inputRow}>
        <TextInput
          style={[
            styles.input, styles.flex, rest.multiline && styles.inputMultiline,
            error && { borderColor: colors.danger },
          ]}
          placeholderTextColor={colors.muted}
          accessibilityLabel={label || rest.placeholder}
          secureTextEntry={!!secret && !revealed}
          {...privacy}
          {...rest}
        />
        {secret ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            onPress={() => setRevealed(!revealed)}
            style={styles.reveal}
            hitSlop={8}
          >
            <Text style={styles.revealText}>{revealed ? 'Hide' : 'Show'}</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
    </View>
  );
}

/** NetworkBadge — a small label saying which network the Signer is set to. */
export function NetworkBadge() {
  const isTest = NETWORK === 'testnet';
  return (
    <View style={[styles.badge, { borderColor: isTest ? colors.warning : colors.danger }]}>
      <Text style={[styles.badgeText, { color: isTest ? colors.warning : colors.danger }]}>
        {isTest ? 'TESTNET · practice network' : 'MAINNET · real network'}
      </Text>
    </View>
  );
}

/** Gap — empty vertical space between blocks. */
export function Gap({ size = 16 }) {
  return <View style={{ height: size }} />;
}

// ---------------------------------------------------------------------------
// All sizes and spacing
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 20, paddingBottom: 40, flexGrow: 1 },
  title: { color: colors.text, fontSize: 26, fontWeight: '700', marginBottom: 12 },
  body: { color: colors.text, fontSize: 16, lineHeight: 23, marginBottom: 8 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  strong: { fontWeight: '700' },
  notice: {
    backgroundColor: colors.card, borderLeftWidth: 4, borderRadius: 8, padding: 14, marginVertical: 10,
  },
  button: {
    minHeight: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 16, marginTop: 12,
  },
  buttonPrimary: { backgroundColor: colors.accent },
  buttonOutline: { borderWidth: 1.5, borderColor: colors.border },
  buttonInactive: { opacity: 0.4 },
  buttonPressed: { opacity: 0.75 },
  buttonText: { fontSize: 16, fontWeight: '600' },
  fieldWrap: { marginVertical: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  reveal: { paddingHorizontal: 12, paddingVertical: 12, marginLeft: 6 },
  revealText: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  label: { color: colors.muted, fontSize: 14, marginBottom: 6 },
  input: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    color: colors.text, fontSize: 16, paddingHorizontal: 12, paddingVertical: 12,
  },
  inputMultiline: { minHeight: 130, textAlignVertical: 'top' },
  error: { color: colors.danger, fontSize: 14, marginTop: 6 },
  badge: {
    alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 16,
  },
  badgeText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
});
