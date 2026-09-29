/*
 * index.js — the very first file that runs when the Signer starts
 * ===============================================================
 *
 * Order matters here:
 *   1. setupRandom.js FIRST: connects the phone's secure random number
 *      generator, so it's ready before any wallet code could need it.
 *   2. Then the app itself (App.js).
 */

import './src/crypto/setupRandom.js';

import { registerRootComponent } from 'expo';
import App from './App';

// registerRootComponent tells Expo "App is the app". It works the same in
// development and in a finished APK.
registerRootComponent(App);
