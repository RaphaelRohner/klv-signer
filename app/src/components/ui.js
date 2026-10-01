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
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NETWORK } from '../config.js';
import { addressGroups } from '../klever/format.js';

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
  dangerText: '#FF8A7F',   // red text on dark (easier to read than the pure red)
  warning: '#F2C14E',
  raised: '#2A2722',       // small tiles, e.g. an app's letter
  // Tinted boxes for messages (background, edge)
  infoBg: '#16231F', infoEdge: '#22433D',
  warningBg: '#2A2415', warningEdge: '#6B5622',
  dangerBg: '#2E1A18', dangerEdge: '#6B2E28',
};

/**
 * Screen — the page every screen sits on.
 * Keeps content clear of the notch/status bar, lets long pages scroll, and
 * moves content up when the keyboard opens so text boxes stay visible.
 * An optional `footer` stays fixed at the bottom, outside the scrolling part.
 */
export function Screen({ children, footer }) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        {/* `footer`: a bar fixed at the bottom that doesn't scroll (e.g. "Unsaved changes · Save"). */}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
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
  const tint = kind === 'danger'
    ? { backgroundColor: colors.dangerBg, borderColor: colors.dangerEdge }
    : kind === 'warning'
      ? { backgroundColor: colors.warningBg, borderColor: colors.warningEdge }
      : { backgroundColor: colors.infoBg, borderColor: colors.infoEdge };
  return (
    // accessibilityLiveRegion: screen readers (TalkBack) read the message out
    // when it appears, e.g. "Wrong password." ('assertive' for problems).
    <View
      style={[styles.notice, tint]}
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
export function Button({ title, onPress, kind = 'primary', disabled, busy, style }) {
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
        style,
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
            kind === 'danger' && { color: colors.dangerText },
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
export function NetworkBadge({ style }) {
  const isTest = NETWORK === 'testnet';
  return (
    <View
      style={[styles.badge, { backgroundColor: isTest ? colors.warning : colors.danger }, style]}
      accessibilityLabel={isTest ? 'Testnet, the practice network' : 'Mainnet, the real network'}
    >
      <Text style={styles.badgeText}>{isTest ? 'TESTNET' : 'MAINNET'}</Text>
    </View>
  );
}

/**
 * ScreenHeader — the top line of a screen: an optional "‹ Back" button and a
 * title, with room for something on the right (e.g. the network badge).
 */
export function ScreenHeader({ title, onBack, right }) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={8} style={styles.back}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
      ) : null}
      <Text style={styles.headerTitle} accessibilityRole="header">{title}</Text>
      {right || null}
    </View>
  );
}

/** Card — a rounded box that groups related things. */
export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** SectionLabel — small grey capitals above a group ("UNLOCKING"). */
export function SectionLabel({ children, danger }) {
  return <Text style={[styles.sectionLabel, danger && { color: colors.dangerText }]} accessibilityRole="header">{children}</Text>;
}

/**
 * ListRow — one line inside a Card: a title, an optional grey line under it,
 * and on the right either an on/off switch (`toggle`), a "›" (`onPress`), or
 * anything you pass as `right`. `last` leaves out the divider line below.
 */
export function ListRow({ title, subtitle, onPress, toggle, right, last, disabled }) {
  const content = (
    <>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, disabled && styles.dim]}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {toggle ? (
        <Switch
          value={toggle.value}
          onValueChange={toggle.onChange}
          disabled={disabled}
          accessibilityLabel={title}
          trackColor={{ false: colors.raised, true: colors.accent }}
          thumbColor={toggle.value ? colors.accentText : colors.muted}
        />
      ) : null}
      {right || null}
      {onPress && !toggle && !right ? <Text style={styles.chevron}>›</Text> : null}
    </>
  );
  const rowStyle = [styles.row, !last && styles.rowDivider];
  if (onPress && !toggle) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
        accessibilityState={{ disabled: !!disabled }}
        onPress={disabled ? undefined : onPress}
        style={({ pressed }) => [rowStyle, pressed && styles.buttonPressed]}
      >
        {content}
      </Pressable>
    );
  }
  return <View style={rowStyle}>{content}</View>;
}

/**
 * AddressBlocks — a klv1… address shown as little boxes (see addressGroups
 * in klever/format.js: "klv1", 4, then boxes of 6; the last box is the
 * 6 characters typed for the extra confirmation). `markLast` outlines that
 * last box in teal; `muted` shows the text in the normal colour instead of
 * teal. Screen readers get the address in one piece.
 */
export function AddressBlocks({ address, markLast, muted }) {
  const groups = addressGroups(address);
  return (
    <View style={styles.blocks} accessible accessibilityLabel={`Address ${address}`}>
      {groups.map((g, i) => {
        const marked = markLast && i === groups.length - 1;
        return (
          <View key={i} style={[styles.block, marked && styles.blockMarked]}>
            <Text style={[styles.blockText, muted && { color: colors.text }, marked && styles.blockTextMarked]}>{g}</Text>
          </View>
        );
      })}
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
  footer: {
    borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card,
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14,
  },
  title: { color: colors.text, fontSize: 24, fontWeight: '600', marginBottom: 12 },
  body: { color: colors.text, fontSize: 16, lineHeight: 23, marginBottom: 8 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  strong: { fontWeight: '700' },
  notice: { borderWidth: 1, borderRadius: 14, padding: 14, marginVertical: 8 },
  button: {
    minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 16, marginTop: 12,
  },
  buttonPrimary: { backgroundColor: colors.accent },
  buttonOutline: { borderWidth: 1, borderColor: colors.border },
  buttonInactive: { opacity: 0.4 },
  buttonPressed: { opacity: 0.75 },
  buttonText: { fontSize: 16, fontWeight: '600' },
  fieldWrap: { marginVertical: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  reveal: {
    minWidth: 64, minHeight: 50, marginLeft: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10,
  },
  revealText: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  label: { color: colors.muted, fontSize: 13, marginBottom: 6 },
  input: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    color: colors.text, fontSize: 16, paddingHorizontal: 14, minHeight: 50, paddingVertical: 12,
  },
  inputMultiline: { minHeight: 130, textAlignVertical: 'top' },
  error: { color: colors.danger, fontSize: 14, marginTop: 6 },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: colors.background, fontFamily: 'monospace' },
  header: { flexDirection: 'row', alignItems: 'center', minHeight: 48, marginBottom: 12 },
  back: { width: 44, height: 44, marginLeft: -10, alignItems: 'center', justifyContent: 'center' },
  backText: { color: colors.text, fontSize: 34, lineHeight: 38, marginTop: -4 },
  headerTitle: { flex: 1, color: colors.text, fontSize: 20, fontWeight: '600' },
  card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 16, marginVertical: 6 },
  sectionLabel: {
    color: colors.muted, fontSize: 12, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase',
    marginTop: 18, marginBottom: 4, marginHorizontal: 4,
  },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: 16, paddingVertical: 12 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowText: { flex: 1, paddingRight: 12 },
  rowTitle: { color: colors.text, fontSize: 15 },
  rowSubtitle: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  chevron: { color: colors.muted, fontSize: 24, lineHeight: 26 },
  dim: { opacity: 0.45 },
  blocks: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3 },
  block: {
    margin: 3, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.background,
    borderWidth: 1, borderColor: colors.border,
  },
  blockText: { color: colors.accent, fontSize: 15, fontFamily: 'monospace' },
  blockMarked: { borderColor: colors.accent, borderWidth: 2 },
  blockTextMarked: { color: colors.accent, fontWeight: '700', textDecorationLine: 'underline' },
});
