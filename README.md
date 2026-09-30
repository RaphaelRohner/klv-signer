# KLV Signer

A small Android app that keeps a Klever wallet's private key safe and signs
transactions for **any Android app that uses the Klever chain**, without
those apps ever seeing the key. You see which app is asking and what it
wants, and nothing is signed unless you approve it with your password.
It fills a gap: the Klever Wallet app for Android doesn't let other apps ask
it to sign Klever transactions, so any developer can call the Signer from
their own app instead. The **Devikins Legacy Hub** is the first app that will use it.

**New here? Read [HOW-IT-WORKS.md](HOW-IT-WORKS.md) first.** It explains the
whole idea in plain English, with a build plan and a glossary.
**Building and testing on your phone:** [TESTING.md](TESTING.md).

## Current status

**Stage 1 — Wallet + password: done and tested on the phone (29 Sep 2026).**
**Stage 2 — Reading and signing: done and tested (30 Sep 2026)**, including a real testnet transfer.
**Stage 3 — Other apps asking: done and tested (30 Sep 2026).** The Hub (4.1.0) is the first app using it.
The Signer can create a new wallet (or restore one from its recovery phrase),
lock it with your app password, unlock it, and remove it. It can't sign
anything yet (that's Stage 2). It's set to **testnet**.

## What's in this folder

| Path | What it is |
|---|---|
| `README.md` | This file: the front page. |
| `HOW-IT-WORKS.md` | The plain-English guide: what the Signer does, why, and the build plan. |
| `TESTING.md` | Step-by-step: build the APK, then test each feature on your phone. |
| `SECURITY.md` | The common attacks on Android wallet apps, where the Signer stands against each, the planned fixes, and how to report a vulnerability privately. |
| `SIGNER-PROTOCOL.md` | **For developers:** exactly how any Android app asks the Signer for an address or a signature, with examples. |
| `AGENTS.md` | Notes for AI helpers (like Claude) who work on this project later. |
| `app/` | The actual Expo app. Everything below is inside it. |
| `app/app.json` | The app's settings: name, Android ID, link address (`klvsigner://`), cloud backup off. |
| `app/package.json` | The list of building blocks (libraries) the app uses, and the `npm test` command. |
| `app/index.js` | The first file that runs. Sets up secure randomness, then starts the app. |
| `app/App.js` | The "traffic controller": decides which screen you see. Has a map of all screens at the top. |
| `app/src/config.js` | All important settings in one place (network, password rules, waiting times…). |
| `app/src/crypto/` | The security core: `wallet.js` (making/restoring wallets), `passwordKey.js` (turning your password into a key), `vault.js` (scrambling the private key), `setupRandom.js` (secure randomness), `phraseInput.js` (the numbered word boxes on the Restore screen). |
| `app/src/security/` | `wrongPasswordPolicy.js`: the waiting-time rules after wrong passwords. `usePasswordCheck.js`: the one shared "check the password, use the key, wipe it" step. |
| `app/src/klever/` | Reading and signing Klever transactions: `readTransaction.js` (the strict reader and all safety checks), `signTransaction.js`, `protobuf.js` + `schema.js` (Klever's data format, from the node's official definitions), `format.js` (plain-words amounts), `networks.js`. |
| `app/tools/` | Helper tools for your Mac (testnet only): `make-test-tx.mjs` prepares a test transaction, `send-signed-tx.mjs` checks and sends a signed one. |
| `app/src/storage/` | `secureStore.js` (the wallet) and `connectedApps.js` (the apps you've allowed): the only files that save anything on the phone. |
| `app/src/screens/` | One file per screen (Welcome, recovery phrase, check, restore, password, unlock, home, paste transaction, approve, signed, allow this app, request refused). |
| `app/src/components/` | Shared looks (`ui.js`) and the "remove wallet" box (`RemoveWallet.js`). |
| `app/modules/klv-signer-requests/` | The Signer's own small piece of native Android code (Kotlin): the "front door" that receives requests from other apps, learns from Android which app is asking, and sends the answer back only to that app. |
| `app/src/requests/` | The rules for requests from other apps: `protocol.js` (request checks and answers) and `appTrust.js` (which apps you've allowed). |
| `app/tests/` | Automatic checks for the security core and the transaction reader (49 checks). Run with `npm test`. |
| `app/eas.json` | Build settings (same as the Hub's). |
| `app/eslint.config.js` | Settings for the code checker (`npx expo lint`). |

## Key facts at a glance

| Setting | Value | Why it matters |
|---|---|---|
| App name | KLV Signer | What you see under the icon. |
| Android package | `com.raphaelrohner.klvsigner` | The app's permanent ID on Android. Never change it after installing, or Android treats it as a different app (and its stored wallet is gone). |
| Network | testnet | Set in `app/src/config.js`. |
| How apps ask | Android "ask another app for a result", screen `com.raphaelrohner.klvsigner.requests.SignRequestActivity` | Android tells the Signer which app is asking and returns the answer only to that app. See SIGNER-PROTOCOL.md. |
| Cloud backup | Off | The scrambled key never leaves the phone through Android backups. |
| Expo version | SDK 57 | Same as the Hub. |

## Building libraries used (and why)

| Library | Job |
|---|---|
| `@klever/connect-crypto` | Klever's official code for recovery phrases, keys and addresses. Pinned to exactly 0.2.0 so it can't change under us. |
| `@klever/connect-encoding` | Only used for small helpers. Its transfer definition is wrong (amount and token swapped), so the Signer reads transactions with its own reader instead. |
| `@klever/connect-provider`, `@klever/connect-transactions` | Only used by the Mac helper tools, to talk to the testnet node. Not part of the phone app. |
| `@noble/hashes`, `@noble/ciphers` | Well-known, audited crypto code: the password recipe (scrypt) and the scrambling (AES-GCM). Klever's own library is built on the same family. |
| `react-native-quick-crypto` | Runs the slow password recipe in the phone's fast built-in crypto code. |
| `expo-secure-store` | Saves the scrambled wallet in Android's Keystore-protected storage. |
| `expo-crypto` | The phone's secure random number generator. |
| `expo-screen-capture` | Blocks screenshots while a recovery phrase is on screen. |
| `react-native-safe-area-context` | Keeps screens clear of the notch and status bar. |
