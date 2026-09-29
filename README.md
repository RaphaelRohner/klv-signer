# KLV Signer

A small Android app that keeps a Klever wallet's private key safe and signs
transactions for the **Devikins Legacy Hub**, without the Hub ever seeing the
key.

**New here? Read [HOW-IT-WORKS.md](HOW-IT-WORKS.md) first.** It explains the
whole idea in plain English, with a build plan and a glossary.
**Building and testing on your phone:** [TESTING.md](TESTING.md).

## Current status

**Stage 1 — Wallet + password: done and tested on the phone (29 Sep 2026).**
The Signer can create a new wallet (or restore one from its recovery phrase),
lock it with your app password, unlock it, and remove it. It can't sign
anything yet (that's Stage 2). It's set to **testnet**.

## What's in this folder

| Path | What it is |
|---|---|
| `README.md` | This file: the front page. |
| `HOW-IT-WORKS.md` | The plain-English guide: what the Signer does, why, and the build plan. |
| `TESTING.md` | Step-by-step: build the APK, then test each feature on your phone. |
| `AGENTS.md` | Notes for AI helpers (like Claude) who work on this project later. |
| `app/` | The actual Expo app. Everything below is inside it. |
| `app/app.json` | The app's settings: name, Android ID, link address (`klvsigner://`), cloud backup off. |
| `app/package.json` | The list of building blocks (libraries) the app uses, and the `npm test` command. |
| `app/index.js` | The first file that runs. Sets up secure randomness, then starts the app. |
| `app/App.js` | The "traffic controller": decides which screen you see. Has a map of all screens at the top. |
| `app/src/config.js` | All important settings in one place (network, password rules, waiting times…). |
| `app/src/crypto/` | The security core: `wallet.js` (making/restoring wallets), `passwordKey.js` (turning your password into a key), `vault.js` (scrambling the private key), `setupRandom.js` (secure randomness), `phraseInput.js` (the numbered word boxes on the Restore screen). |
| `app/src/security/` | `wrongPasswordPolicy.js`: the waiting-time rules after wrong passwords. |
| `app/src/storage/` | `secureStore.js`: the only file that saves anything on the phone. |
| `app/src/screens/` | One file per screen (Welcome, recovery phrase, check, restore, password, unlock, home). |
| `app/src/components/` | Shared looks (`ui.js`) and the "remove wallet" box (`RemoveWallet.js`). |
| `app/tests/` | Automatic checks for the security core. Run with `npm test`. |
| `app/eas.json` | Build settings (same as the Hub's). |
| `app/eslint.config.js` | Settings for the code checker (`npx expo lint`). |

## Key facts at a glance

| Setting | Value | Why it matters |
|---|---|---|
| App name | KLV Signer | What you see under the icon. |
| Android package | `com.raphaelrohner.klvsigner` | The app's permanent ID on Android. Never change it after installing, or Android treats it as a different app (and its stored wallet is gone). |
| Network | testnet | Set in `app/src/config.js`. |
| Link address | `klvsigner://` | How the Hub will open the Signer. |
| Hub's reply address | `dlh://` (to be added to the Hub in Stage 3) | How the Signer will open the Hub again. |
| Cloud backup | Off | The scrambled key never leaves the phone through Android backups. |
| Expo version | SDK 57 | Same as the Hub. |

## Building libraries used (and why)

| Library | Job |
|---|---|
| `@klever/connect-crypto` | Klever's official code for recovery phrases, keys and addresses. Pinned to exactly 0.2.0 so it can't change under us. |
| `@noble/hashes`, `@noble/ciphers` | Well-known, audited crypto code: the password recipe (scrypt) and the scrambling (AES-GCM). Klever's own library is built on the same family. |
| `react-native-quick-crypto` | Runs the slow password recipe in the phone's fast built-in crypto code. |
| `expo-secure-store` | Saves the scrambled wallet in Android's Keystore-protected storage. |
| `expo-crypto` | The phone's secure random number generator. |
| `expo-screen-capture` | Blocks screenshots while a recovery phrase is on screen. |
| `react-native-safe-area-context` | Keeps screens clear of the notch and status bar. |
