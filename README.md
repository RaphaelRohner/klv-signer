# KLV Signer

A small Android app that keeps a Klever wallet's private key safe and signs
transactions for the **Devikins Legacy Hub**, without the Hub ever seeing the
key.

**New here? Read [HOW-IT-WORKS.md](HOW-IT-WORKS.md) first.** It explains the
whole idea in plain English, with a build plan and a glossary.

## Current status

**Stage 0 — Skeleton.** The project exists and is configured, but it doesn't do
anything yet. Nothing in it touches a real wallet.

## What's in this folder

| Path | What it is |
|---|---|
| `README.md` | This file: the front page. |
| `HOW-IT-WORKS.md` | The plain-English guide: what the Signer does, why, and the build plan. |
| `AGENTS.md` | Notes for AI helpers (like Claude) who work on this project later. |
| `app/` | The actual Expo app. |
| `app/app.json` | The app's settings: its name, its Android ID, and its link address (`klvsigner://`). |
| `app/App.js` | The app's starting screen. Just a placeholder for now. |
| `app/assets/` | Icons and splash images (Expo defaults for now). |

## Key facts at a glance

| Setting | Value | Why it matters |
|---|---|---|
| App name | KLV Signer | What you see under the icon. |
| Android package | `com.raphaelrohner.klvsigner` | The app's permanent ID on Android. Never change it after installing, or Android treats it as a different app (and its stored wallet is gone). |
| Link address | `klvsigner://` | How the Hub opens the Signer. |
| Hub's reply address | `dlh://` (to be added to the Hub) | How the Signer opens the Hub again. |
| Cloud backup | Off | The scrambled key never leaves the phone through Android backups. |
| Expo version | SDK 57 | Same as the Hub. |

## Running it

The first time on your Mac, open Terminal in the `app` folder and run:

```
npm install
```

After that, it's built and run the same way as the Hub (see the Hub's
`SETUP.md`, section "Building an APK completely locally").
