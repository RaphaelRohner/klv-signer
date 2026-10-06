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

## Try it (testnet preview)

> **Testnet only, no independent security audit yet.** Use a fresh test
> wallet, never your real one.

1. Download from the [Releases page](https://github.com/RaphaelRohner/klv-signer/releases):
   `klv-signer-<version>.apk` (the Signer) and `klv-signer-example-<version>.apk`
   (a small app to try it with), plus their `.sha256` files.
2. Optional but recommended, check them on a computer:
   `shasum -a 256 -c klv-signer-<version>.apk.sha256` must say **OK**, and
   after installing, the Signer's Settings → About must say "Matches the
   official KLV Signer key" (fingerprint below).
3. Install both on an Android 12+ phone (allow "install unknown apps" for
   your browser or file manager when Android asks).
4. In the Signer: create a new test wallet (write down the words), set a
   password. In the example app: **Connect KLV Signer**, allow it, and send
   a little testnet KLV to another test address.

You'll need some testnet KLV on the test wallet (Klever's testnet has no
real value). Questions and feedback: the Klever forum thread for the KLV
Signer, or a GitHub issue.

## Before you start

KLV Signer is free, open-source software, provided **as is**, without any
warranty. You use it at your own risk.

- **Only use wallets holding funds you could afford to lose.** No app can guarantee your funds are safe.
- **The Signer makes it harder to steal from you.** It can't stop everything: a phone with harmful apps, or someone who tricks you into approving a transaction, can still cost you money.
- **Most losses come from scams, not hacks.** Nobody legitimate will ever ask for your recovery words. Read every approval screen before you sign.
- **You are responsible** for your recovery words, your password and your phone. If the words are lost, nobody can recover the wallet.

The app shows the same text before a wallet is created or restored, and in
Settings → About.

## Current status

**Stage 1 — Wallet + password: done and tested on the phone (29 Sep 2026).**
**Stage 2 — Reading and signing: done and tested (30 Sep 2026)**, including a real testnet transfer.
**Stage 3 — Other apps asking: done and tested (30 Sep 2026).** The Hub (4.1.0) is the first app using it.
**Stage 4 — Safety polish: in progress.** Most protections are done and tested; AI
reviews on 1 Oct ([REVIEW-2026-10.md](REVIEW-2026-10.md)) and 5 Oct 2026
([REVIEW-2026-10-05.md](REVIEW-2026-10-05.md)), and a weekly automatic check since
6 Oct (WEEKLY-CHECK.md). **First public testnet preview: 0.1.0, 6 Oct 2026.**
The Signer is set to **testnet** and hasn't had an independent human review yet.

## What's in this folder

| Path | What it is |
|---|---|
| `README.md` | This file: the front page. |
| `HOW-IT-WORKS.md` | The plain-English guide: what the Signer does, why, and the build plan. |
| `TESTING.md` | Step-by-step: build the APK, then test each feature on your phone. |
| `REVIEW-2026-10.md` | The second (AI) review: what was checked, what was found, what was fixed and what's still open. |
| `REVIEW-2026-10-05.md` | The third (AI) review, before the first public release, and what was done about it. |
| `RELEASING.md` | How a release is made: the signing key, backups, the release check, publishing on GitHub. |
| `example/` | **KLV Signer Example**: the smallest app that uses the Signer (connect, balance, send KLV on testnet). For trying the Signer and as a working example for developers. See example/README.md. |
| `WEEKLY-CHECK.md` | The automatic weekly check (tests, packages, review of changes, email report), switched on after going public. |
| `SECURITY.md` | The common attacks on Android wallet apps, where the Signer stands against each, the planned fixes, and how to report a vulnerability privately. |
| `SIGNER-PROTOCOL.md` | **For developers:** exactly how any Android app asks the Signer for an address or a signature, with examples. |
| `DEPENDENCIES.md` | What the app is built from: every important add-on package, the review findings, and the checks to repeat before each release. |
| `AGENTS.md` | Notes for AI helpers (like Claude) who work on this project later. |
| `app/` | The actual Expo app. Everything below is inside it. |
| `app/app.json` | The app's settings: name, Android ID, version number for updates (`versionCode`), cloud backup off, no internet and no other unneeded permissions. |
| `app/package.json` | The list of building blocks (libraries) the app uses, and the `npm test` command. |
| `app/index.js` | The first file that runs. Sets up secure randomness, then starts the app. |
| `app/App.js` | The "traffic controller": decides which screen you see. Has a map of all screens at the top. |
| `app/src/config.js` | All important settings in one place (network, password rules, waiting times…). |
| `app/src/crypto/` | The security core: `wallet.js` (making/restoring wallets), `passwordKey.js` (turning your password into a key), `vault.js` (scrambling the private key), `setupRandom.js` (secure randomness), `phraseInput.js` (the numbered word boxes on the Restore screen, checked against the official BIP-39 list of 2,048 words built into the app). |
| `app/src/security/` | `deviceChecks.js`: the phone-safety warnings (root, unlocked bootloader, no screen lock). `wrongPasswordPolicy.js`: the waiting-time rules after wrong passwords. `usePasswordCheck.js`: the one shared "check the password (or fingerprint), use the key, wipe it" step. `biometricPolicy.js`: when fingerprint/face may be used and when the password is needed instead. `extraConfirmation.js`: the "extra confirmation" rules for unusual transactions. |
| `app/src/klever/` | Reading and signing Klever transactions: `readTransaction.js` (the strict reader and all safety checks), `signTransaction.js`, `protobuf.js` + `schema.js` (Klever's data format, from the node's official definitions), `format.js` (plain-words amounts, grouped addresses), `networks.js`, `qr.js` (your address as a QR code). |
| `app/tools/` | Helper tools for your Mac (testnet only): `make-test-tx.mjs` prepares a test transaction, `send-signed-tx.mjs` checks and sends a signed one. |
| `app/src/storage/` | `secureStore.js` (the wallet), `biometricStore.js` (the optional fingerprint/face copy of the vault key) and `connectedApps.js` (the apps you've allowed): the only files that save anything on the phone. |
| `app/src/screens/` | One file per screen (Welcome, recovery phrase, check, restore, password, unlock, home, extra confirmation settings, change password, paste transaction, approve, signed, allow this app, request refused, storage problem, settings, receive / QR code). |
| `app/src/components/` | Shared looks (`ui.js`), the "remove wallet" box (`RemoveWallet.js`), the phone-safety box (`DeviceWarning.js`), connected apps, and the fingerprint/face switch and button (`BiometricSetting.js`, `BiometricButton.js`). |
| `app/modules/klv-signer-requests/` | The Signer's own small piece of native Android code (Kotlin): the "front door" that receives requests from other apps, learns from Android which app is asking, and sends the answer back only to that app. Also the phone-safety checks (`DeviceSecurity.kt`) and the window protections against overlays and accessibility misuse (`WindowProtection.kt`). |
| `app/src/requests/` | The rules for requests from other apps: `protocol.js` (request checks and answers) and `appTrust.js` (which apps you've allowed). |
| `app/tests/` | Automatic checks for the security core, the transaction reader, the rules and the permissions (127 checks). Run with `npm test`. |
| `app/eas.json` | Build settings: the signing key comes from this Mac only (`credentialsSource: local`), and builds only from committed code. |
| `app/eslint.config.js` | Settings for the code checker (`npx expo lint`). |

## Key facts at a glance

| Setting | Value | Why it matters |
|---|---|---|
| App name | KLV Signer | What you see under the icon. |
| Android package | `com.raphaelrohner.klvsigner` | The app's permanent ID on Android. Never change it after installing, or Android treats it as a different app (and its stored wallet is gone). |
| Network | testnet | Set in `app/src/config.js`. |
| How apps ask | Android "ask another app for a result", screen `com.raphaelrohner.klvsigner.requests.SignRequestActivity` | Android tells the Signer which app is asking and returns the answer only to that app. See SIGNER-PROTOCOL.md. |
| Signing key (SHA-256) | `82:D0:9D:D7:D3:27:A4:8D:DB:97:EE:05:FE:EC:0A:8C:F4:14:C4:81:7F:0F:B7:26:8B:8A:88:F0:25:7E:86:11` | The Signer's official "seal". A genuine Signer APK is always signed with this key. Check it before installing; client apps can check it too (SIGNER-PROTOCOL.md 2c). See RELEASING.md. |
| Cloud backup | Off | The scrambled key never leaves the phone through Android backups. |
| Expo version | SDK 57 | Same as the Hub. |
| Minimum Android | 12 (API 31) | Older versions lack protections the Signer relies on (task hijacking fix, overlay blocking). |

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
| `expo-screen-capture` | Blocks screenshots and screen recordings on every screen except the QR code of your address. |
| `react-native-safe-area-context` | Keeps screens clear of the notch and status bar. |

## Licence

Copyright (C) 2026 Raphael Rohner.

KLV Signer is free software: you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation, either version 3 of the License, or (at your option) any later
version. It is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
A PARTICULAR PURPOSE. See [LICENSE](LICENSE) for the full text.

It includes open-source packages under their own licences (MIT, ISC, BSD,
Apache-2.0 and others): see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
A copy you build yourself carries your own signing key, not the official one,
so Android and client apps can tell it apart from the official Signer.
