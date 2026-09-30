# SECURITY.md — KLV Signer

The KLV Signer holds a Klever wallet's private key on an Android phone and
signs transactions for other apps, only after the user approves each one
with their password. This file lists the common attacks on Android wallet and
signer apps, and where the Signer stands against each.

> **Status: in development, testnet only.** The Signer has not had an
> independent security review yet. Don't use it with real funds.

Of 29 common attacks, the Signer blocks **16** today, partly covers **7**, and
**6** depend on the user or on how releases are published.

**Status:** **Protected** = the Signer blocks it today · **Partly** = reduced,
with a planned fix · **Your side** = depends on the user or the release
process, not on the app's code.

## Reporting a vulnerability

Please **don't** open a public issue. Use GitHub's private reporting instead:
this repository's **Security** tab → **Report a vulnerability**.

---

## 1. Malware and other apps on the same phone

| Attack | What happens | KLV Signer today | Status |
| --- | --- | --- | --- |
| Overlay / tapjacking | A harmful app draws an invisible layer over the screen, so a tap on "OK" lands on **Approve**. | While any Signer screen is showing, other apps' overlays are hidden (Android 12+), and taps are ignored if another app's window covers the spot. | Protected |
| Accessibility abuse | Banking trojans misuse Android's accessibility access to read the screen and tap buttons. | Every signature needs the password. All Signer screens are marked sensitive, so only apps that declare themselves real accessibility tools can read or press them (Android 14+, stricter on 16). The Signer names any installed app with accessibility access. A harmful app that falsely claims to be a tool isn't stopped. | Partly |
| Screen capture | Screenshots, screen recording or the app switcher preview capture recovery words or passwords. | Blocked on the recovery phrase, restore, password, unlock and approval screens. | Protected |
| Clipboard theft and address swap | Malware reads copied secrets, or swaps a copied address for the attacker's. | The Signer never copies the phrase or key. The approval screen shows the receiver's full address from its own reading. | Protected |
| Keyboard logging | A keyboard app learns or records what is typed. | Suggestions and learning are off for recovery words and passwords. With the optional fingerprint/face shortcut, there's nothing to type at all. The Signer warns, naming the keyboard, when you type with one that didn't come with the phone (Gboard, Samsung and SwiftKey from the Play Store count as fine). A malicious keyboard you keep using can't be stopped. | Partly |
| Fake client app | A harmful app asks the Signer to sign something bad. | Android tells the Signer which app is asking (id + certificate). Each app must be allowed once, and every request shows the transaction as the Signer reads it. | Protected |
| Fake Signer catching requests | A harmful app pretends to be the Signer to catch requests or answers. | Apps must name the Signer exactly (package + screen); answers go only to the asking app. | Protected |
| Task hijacking (StrandHogg) | A harmful app puts a fake Signer screen in front, to catch the password. | Fixed in Android 11; the Signer requires Android 12 or newer. | Protected |
| Fake copy of the Signer | A look-alike app from an unofficial source steals the recovery phrase. | Only install the Signer from its official source. Planned: publish the signing certificate fingerprint and file checksums. | Your side |

## 2. Someone with the phone in hand

| Attack | What happens | KLV Signer today | Status |
| --- | --- | --- | --- |
| Guessing the password in the app | A thief tries password after password on the lock screen. | 4 free tries, then waits of 30 s, 1 min, 2 min … up to 1 hour, kept even if the app is closed. | Protected |
| Offline guessing of a copied vault | Forensic tools copy the scrambled key off the phone and guess on a computer. | Scrambled with the password (scrypt N=2^17, OWASP's recommended minimum, + AES-256-GCM) inside Android Keystore-protected storage. New passwords need 12+ characters, with a strength hint. Older wallets are upgraded automatically. A weak password is still the one way in, so pick a strong one. | Protected |
| Rooted or hacked phone | Tools with full control of the phone read memory or change how the app runs. | The key is only unscrambled for a moment and wiped straight after. The Signer warns when it finds signs of root, an unlocked bootloader or no screen lock. Signing is switched off on signs of root, an unlocked bootloader or a failed startup check (address and wallet removal still work; the recovery words restore the funds elsewhere). The warning is on the Unlock screen every time you open the Signer. Rooting tools can hide, so no warning isn't proof. No app can fully protect itself on a compromised phone. | Partly |
| Backup extraction | The wallet is copied out through Android or cloud backups. | Android backup is switched off; storage is tied to the phone's Keystore. | Protected |
| Shoulder surfing | Someone watches the password being typed or reads the recovery words. | Passwords are hidden by default (Show/Hide); the optional fingerprint/face shortcut avoids typing in public. Keep the recovery words private. | Your side |

## 3. Tricks aimed at the user

| Attack | What happens | KLV Signer today | Status |
| --- | --- | --- | --- |
| Recovery phrase phishing | Fake support, fake websites or fake "wallet sync" forms ask for the recovery words. | The Signer only asks for the words when restoring a wallet. Nobody legitimate ever needs them. | Your side |
| Blind signing | The user approves a request they can't understand, and it does something else. | The Signer reads every transaction itself, shows it in plain words, and refuses anything it can't explain. | Protected |
| Look-alike addresses | Scammers send tiny amounts from an address that starts and ends like a familiar one. | The approval screen always shows the full receiver address. Compare all of it. | Partly |
| Scam tokens and fake airdrops | Worthless tokens or NFTs arrive with links to fake "claim" sites. | The Signer shows no token pictures or links and never goes online. | Protected |

## 4. The transaction and the cryptography

| Attack | What happens | KLV Signer today | Status |
| --- | --- | --- | --- |
| Show one thing, sign another | Hidden extra instructions, or the screen shows different values than the bytes signed. | Strict reader built from the Klever node's own definitions: unknown parts are refused, and the transaction must re-encode byte for byte. Fingerprints match the node. | Protected |
| Replay on another network | A testnet transaction is resent on mainnet, or the other way round. | The network ID is part of what's signed and is checked (108 = mainnet, 109 = testnet); each transaction has a one-time number. | Protected |
| Weak randomness | Predictable "random" numbers make new wallets guessable. | New wallets use the phone's secure random generator; tested. | Protected |
| Bugs in the crypto code | A mistake in encoding or signing leaks keys or signs the wrong thing. | Audited libraries (noble) and Klever's own code, with an independent check of the wallet recipe. A bug in Klever's JS library (transfer fields swapped) was found and worked around. Needs an expert review. | Partly |
| Secrets in logs | Keys or phrases end up in logs or crash reports. | No secrets are logged; no analytics or crash reporting. | Protected |

## 5. Network and servers

| Attack | What happens | KLV Signer today | Status |
| --- | --- | --- | --- |
| Malicious node or man-in-the-middle | A fake or hacked server prepares a different transaction, or shows false balances. | Whatever the server prepared, the Signer shows what the transaction really does before signing. Client apps should use HTTPS. | Protected |
| The Signer going online | A bug or a harmful library sends data out. | The Signer never needs the internet. Planned: remove the internet permission in release builds. | Partly |

## 6. Supply chain and releases

| Attack | What happens | KLV Signer today | Status |
| --- | --- | --- | --- |
| Harmful library | A dependency is taken over and ships malicious code in an update. | Few dependencies; crypto libraries pinned to exact versions and locked in package-lock.json. Planned: dependency review before release. | Partly |
| Stolen signing key or build machine | Someone with the app-signing key or the build machine publishes a harmful "update". | Keep the signing keystore and its password offline and backed up; encrypt the build machine's disk. | Your side |
| Tampered download | The APK people download differs from the source code here. | Planned: published checksums, build provenance from GitHub Actions, and ideally reproducible builds. | Your side |
| Account takeover | Someone gets into the GitHub, Expo or Google Play account and replaces the app or code. | Two-factor authentication on every account involved. | Your side |

---

## Progress

How the open scenarios are shrinking. This file is updated with every change
that affects a row above.

| Date | Change | Protected / Partly / Your side |
| --- | --- | --- |
| 29 Sep 2026 | First list (end of Stage 3) | 13 / 10 / 6 |
| 30 Sep 2026 | Android 12 minimum: task hijacking closed | 14 / 9 / 6 |
| 30 Sep 2026 | Phone-safety warnings (root, bootloader, screen lock), shown on the Unlock screen | 14 / 9 / 6 (rooted phones: still Partly, no app can fully fix that) |
| 30 Sep 2026 | Overlays hidden and covered taps ignored: tapjacking closed. Also: signing off on rooted/unlocked phones, screens hidden from non-tool accessibility apps, keyboard and accessibility-app warnings | 15 / 8 / 6 (rooted phones, accessibility and keyboard stay Partly) |
| 30 Sep 2026 | Optional fingerprint/face (strong biometrics only; copy destroyed if a fingerprint is added; password after restart and every 7 days): less typing for keyloggers and onlookers | 15 / 8 / 6 |
| 30 Sep 2026 | Change password from Home (re-scrambles the key with a fresh salt; switches fingerprint/face off) | 15 / 8 / 6 |
| 30 Sep 2026 | Stronger passwords: 4× heavier password check (scrypt 2^17), 12-character minimum, strength hint, older wallets upgraded automatically. Offline guessing closed | 16 / 7 / 6 |

## Planned fixes (Stage 4)

- [x] Hide overlays and ignore obscured taps (on every Signer screen)
- [x] Mark sensitive screens so accessibility apps can't read or press them (Android 14+)
- [x] Warn which installed apps have accessibility access turned on
- [x] Warn when the keyboard in use isn't the phone's built-in one
- [x] Require Android 12 as the minimum version (closes task hijacking; overlays blocked by default)
- [x] Make the password check about 4× heavier; 12-character minimum with a strength warning
- [x] Warn when the phone looks insecure (signs of root, unlocked bootloader, no screen lock)
- [x] Switch signing off on rooted or unlocked phones
- [ ] Remove the internet permission in release builds
- [x] Change password from the Home screen
- [x] Optional fingerprint or face confirmation (the password always stays available as the choice)
- [ ] Review all dependencies before the first release
- [ ] Independent review of the whole app (a separate reviewer, then a professional one before real money)
- [ ] Release process: signing certificate fingerprint, checksums, build provenance, reproducible build
- [ ] Two-factor authentication on GitHub, Expo and Google Play

## Sources

- [OWASP Mobile Top 10 2024 (summary by Cobalt)](https://www.cobalt.io/blog/owasp-mobile-top-10-2024-update)
- [Android Developers: Tapjacking](https://developer.android.com/privacy-and-security/risks/tapjacking)
- [Android Developers: StrandHogg / task hijacking](https://developer.android.com/privacy-and-security/risks/strandhogg)
- [App Defense Alliance: MASA FAQ](https://appdefensealliance.dev/masa/faq)
- [WalletScrutiny: Methodology](https://walletscrutiny.com/methodology/)
- [Google Play: Cryptocurrency Exchanges and Software Wallets policy](https://support.google.com/googleplay/android-developer/answer/16329703?hl=en)

_Last updated 30 Sep 2026._
