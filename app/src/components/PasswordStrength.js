/*
 * PasswordStrength.js — the small "Strength: …" line under a new password box
 * ==========================================================================
 * Shows the result of security/passwordStrength.js: red for weak, orange for
 * fair, green for strong. Nothing while the password is still too short (the
 * box itself says so). A hint only: the
 * only hard rule is the minimum length.
 */

import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { colors } from './ui.js';
import { passwordStrength } from '../security/passwordStrength.js';
import { MIN_PASSWORD_LENGTH } from '../config.js';

const LOOK = {
  weak: { word: 'Weak', color: 'danger' },
  fair: { word: 'Fair', color: 'warning' },
  strong: { word: 'Strong', color: 'accent' },
};

export default function PasswordStrength({ password }) {
  // Too short is already said by the box itself ("Please use at least …").
  if (!password || password.length < MIN_PASSWORD_LENGTH) return null;
  const { level, hint } = passwordStrength(password);
  const look = LOOK[level];
  return (
    <Text style={styles.line}>
      <Text style={[styles.word, { color: colors[look.color] }]}>Strength: {look.word}. </Text>
      {level === 'strong' ? '' : hint}
    </Text>
  );
}

const styles = StyleSheet.create({
  line: { color: colors.muted, fontSize: 14, marginTop: -4, marginBottom: 10 },
  word: { fontWeight: '700' },
});
