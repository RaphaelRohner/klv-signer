/*
 * eslint.config.js — settings for the code checker ("linter")
 * ===========================================================
 *
 * `npx expo lint` reads the code and points out likely mistakes (misspelled
 * names, unused leftovers, React rules broken) without running the app.
 * Guide: https://docs.expo.dev/guides/using-eslint/
 */
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    rules: {
      // This rule complains about apostrophes and quote marks in on-screen
      // text (like "don't"). It exists for websites, where those characters
      // can clash with HTML. React Native shows them fine, so it's switched off.
      'react/no-unescaped-entities': 'off',
    },
  },
]);
