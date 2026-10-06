# SECURITY.md — KLV Signer

The KLV Signer holds a Klever wallet's private key on an Android phone and
signs transactions for other apps, only after the user approves each one
with their password. This file lists the common attacks on Android wallet and
signer apps, and where the Signer stands against each.

> **Status: in development, testnet only.** The Signer has had three AI
> reviews (the latest: REVIEW-2026-10-05.md), but no independent human
> security review yet. Don't use it with real funds.

Of 29 common attacks, the Signer blocks **17** today, partly covers **6**, and
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
| Accessibility abuse | Banking trojans misuse Android's accessibility access to read the screen and tap buttons. | Every signature needs the password or fingerprint/face. All Signer screens are marked sensitive, so only apps that declare themselves real accessibility tools can read or press them (Android 14+, stricter on 16). Since 5 Oct 2026: while an accessibility app is on that could press buttons in the Signer (any you installed yourself on Android 12/13; on 14+ any that calls itself a tool; TalkBack, Voice Access and the phone's own are trusted), the Signer signs only with fingerprint/face, which no app can fake, and allowing a new app needs them too ("Allow this app?" always asks for the password or fingerprint now). Still possible: such an app drawing misleading text over the screen while you approve with your finger. | Partly |
| Screen capture | Screenshots, screen recording or the app switcher preview capture recovery words or passwords. | Blocked on every Signer screen from the moment the app starts, and re-applied natively every time the Signer comes to the front (also after Android rebuilt the screen, e.g. a font-size change) (only a blank loading screen shows until the block is on), so even a recording already running catches nothing. Only the QR code screen allows screenshots, to share the address; "Share info for support" gives a text summary instead of screenshots. | Protected |
| Clipboard theft and address swap | Malware reads copied secrets, or swaps a copied address for the attacker's. | The Signer never copies the phrase or key. The approval screen shows the receiver's full address from its own reading. | Protected |
| Keyboard logging | A keyboard app learns or records what is typed. | Suggestions and learning are off for recovery words and passwords ("Show" displays the password under the box, the box itself stays a password box), and password managers' autofill is switched off for the whole Signer, so nothing typed there is suggested or saved. With the optional fingerprint/face shortcut, there's nothing to type at all. The Signer warns, naming the keyboard, when you type with one that didn't come with the phone (Gboard, Samsung and SwiftKey from the Play Store count as fine). A malicious keyboard you keep using can't be stopped. | Partly |
| Fake client app | A harmful app asks the Signer to sign something bad. | Android tells the Signer which app is asking (id + certificate). Each app must be allowed once (with password or fingerprint), and every request shows the transaction as the Signer reads it. Requests that another app passed on ("forward result", which would make Android name the allowed app as the sender) are refused since 6 Oct 2026. | Protected |
| Fake Signer catching requests | A harmful app pretends to be the Signer to catch requests or answers. | Apps must call the Signer exactly by name (package + screen); since the second review the Signer has no public "intent filter" other apps could also claim. Answers go only to the asking app. A fake app installed under the Signer's name is caught by the client app's seal check (SIGNER-PROTOCOL.md 2c): before every request it asks Android whether the installed Signer carries the official signing certificate, and sends nothing if not. The Devikins Legacy Hub does this since 4.1.1. Other client apps are protected only if they follow 2c too; the Signer can't enforce that for them. | Protected (for apps following 2c) |
| Task hijacking (StrandHogg) | A harmful app puts a fake Signer screen in front, to catch the password. | The known StrandHogg tricks were fixed by Android (StrandHogg 2.0 in Android 11, plus later hardening); the Signer requires Android 12 or newer. Since 5 Oct 2026 its main screen also shares no "task" with any other app (`taskAffinity=""`, checked by the release check), which closes the older variants on phones that missed Android's fixes. | Protected |
| Fake copy of the Signer | A look-alike app from an unofficial source steals the recovery phrase. | Only install the Signer from its official source. The official signing key fingerprint is published (README, RELEASING.md, SIGNER-PROTOCOL.md), and every release lists its file checksum. Since 5 Oct 2026 the Signer reads the seal of the installed copy from Android, shows it in Settings → About with "Matches the official KLV Signer key" (or a red "Does NOT match"), includes it in "Share info for support", and warns (without blocking: self-built copies are allowed) when it differs. This catches a changed copy that kept the check; a fake written from scratch can simply leave it out, so it doesn't replace installing from the official source. | Your side |

## 2. Someone with the phone in hand

| Attack | What happens | KLV Signer today | Status |
| --- | --- | --- | --- |
| Guessing the password in the app | A thief tries password after password on the lock screen. | 4 free tries, then waits of 30 s, 1 min, 2 min … up to 1 hour, kept even if the app is closed. Since the second review: waits are timed with a stopwatch that changing the phone's clock doesn't affect, each try is counted before it's checked (so killing the app mid-check doesn't help), and only one check runs at a time. | Protected |
| Offline guessing of a copied vault | Forensic tools copy the scrambled key off the phone and guess on a computer. | Scrambled with the password (scrypt N=2^17, OWASP's recommended minimum, + AES-256-GCM) inside Android Keystore-protected storage, whose key sits in the phone's security chip (secure area or StrongBox) and can't be copied out: a copy of the vault file taken off the phone can't even be attacked by guessing. (Code already running as the Signer on a rooted or exploited phone can use that chip key, though, and then guess passwords against the password lock alone; that's what the slow scrypt and a strong password are for.) Since 5 Oct 2026 Settings → This phone shows where that key is kept, with a warning on the rare phone that keeps it only in software. New passwords need 12+ characters and must not be rated "weak" (common words, repeats, sequences like `password1234` are refused since 5 Oct 2026). Older wallets are upgraded automatically. A weak password is still the one way in, so pick a strong one. | Protected |
| Rooted or hacked phone | Tools with full control of the phone read memory or change how the app runs. | The key is only unscrambled for a moment and wiped straight after. The Signer warns when it finds signs of root, an unlocked bootloader or no screen lock. Signing is switched off on signs of root, an unlocked bootloader or a failed startup check, and also when the phone check gets no answer or Android doesn't report its startup check (since 5 Oct 2026: unknown counts as unsafe, not as fine) (address and wallet removal still work; the recovery words restore the funds elsewhere). The warning is on the Unlock screen every time you open the Signer. Rooting tools can hide, so no warning isn't proof. No app can fully protect itself on a compromised phone. | Partly |
| Backup extraction | The wallet is copied out through Android or cloud backups. | Android backup is switched off, and since 5 Oct 2026 explicit rules exclude every kind of app data from cloud backup AND from phone-to-phone transfer (checked by the release check); storage is tied to the phone's Keystore anyway. | Protected |
| Shoulder surfing | Someone watches the password being typed or reads the recovery words. | Passwords are hidden by default (Show/Hide); the optional fingerprint/face shortcut avoids typing in public. Keep the recovery words private. | Your side |

## 3. Tricks aimed at the user

| Attack | What happens | KLV Signer today | Status |
| --- | --- | --- | --- |
| Recovery phrase phishing | Fake support, fake websites or fake "wallet sync" forms ask for the recovery words. | The Signer only asks for the words when restoring a wallet. Nobody legitimate ever needs them. | Your side |
| Blind signing | The user approves a request they can't understand, and it does something else. | The Signer reads every transaction itself, shows it in plain words, and refuses anything it can't explain. | Protected |
| Look-alike addresses | Scammers send tiny amounts from an address that starts and ends like a familiar one. | The approval screen always shows the full receiver address, in small boxes for easier comparing. With the (default) "new receiver" rule, a first transfer to any address needs the extra confirmation: password only and typing one box of the address. Since 5 Oct 2026 that box is a middle one chosen at random each time (outlined), not the ending: a look-alike can copy the start and end of an address in minutes, but can't match a box nobody knows in advance. It still only checks the box you type, so compare the whole address too. Token and NFT transfers also note that their creator may charge a royalty the offline Signer can't see. | Partly |
| Scam tokens and fake airdrops | Worthless tokens or NFTs arrive with links to fake "claim" sites. | The Signer shows no token pictures or links and never goes online. | Protected |

## 4. The transaction and the cryptography

| Attack | What happens | KLV Signer today | Status |
| --- | --- | --- | --- |
| Show one thing, sign another | Hidden extra instructions, or the screen shows different values than the bytes signed. | Strict reader built from the Klever node's own definitions: unknown parts are refused, and the transaction must re-encode byte for byte. Fingerprints match the node. Since the second review: token names and the network ID must be plain letters and digits (no invisible characters), fees over 100 KLV and more than 5 notes are refused, and notes are shown in a separate box marked "written by the app, not checked", and a note with invisible, blank-looking or direction-changing characters isn't shown as text but as "data the Signer can't show as text". | Protected |
| Replay on another network | A testnet transaction is resent on mainnet, or the other way round. | The network ID is part of what's signed and is checked (108 = mainnet, 109 = testnet); each transaction has a one-time number. | Protected |
| Weak randomness | Predictable "random" numbers make new wallets guessable. | New wallets use the phone's secure random generator; tested. | Protected |
| Bugs in the crypto code | A mistake in encoding or signing leaks keys or signs the wrong thing. | Audited libraries (noble) and Klever's own code, with an independent check of the wallet recipe. A bug in Klever's JS library (transfer fields swapped) was found and worked around. The second AI review (REVIEW-2026-10.md) found no way to make it sign something other than what's shown, including 500,000 random damaged transactions. Needs an expert review. | Partly |
| Secrets in logs | Keys or phrases end up in logs or crash reports. | No secrets are logged; no analytics or crash reporting. | Protected |

## 5. Network and servers

| Attack | What happens | KLV Signer today | Status |
| --- | --- | --- | --- |
| Malicious node or man-in-the-middle | A fake or hacked server prepares a different transaction, or shows false balances. | Whatever the server prepared, the Signer shows what the transaction really does before signing. Client apps should use HTTPS. | Protected |
| The Signer going online | A bug or a harmful library sends data out. | The Signer has no internet permission at all (every build), so Android itself blocks any attempt to go online. Unneeded permissions ("display over other apps", storage, vibration) are removed too. Automated tests fail if the permission or any network code comes back, the release check (`tools/release-check.mjs`) refuses an APK that has it, and a copy of the Signer that has the permission refuses to sign. | Protected |

## 6. Supply chain and releases

| Attack | What happens | KLV Signer today | Status |
| --- | --- | --- | --- |
| Harmful library | A dependency is taken over and ships malicious code in an update. | Reviewed 30 Sep and 5 Oct 2026 (DEPENDENCIES.md): all from the npm registry with integrity hashes, no audit findings in anything that goes into the app (the 18 "high" ones are in Expo's build tools on the Mac), no install scripts in app packages. Crypto and native libraries pinned exactly; new ones saved exactly. And with no internet permission, a harmful library couldn't send anything out. Needs repeating before each release. | Partly |
| Stolen signing key or build machine | Someone with the app-signing key or the build machine publishes a harmful "update". | Since 1 Oct 2026 the signing key exists only on the owner's Mac (disk encrypted) and in two offline backups (a USB stick and the password manager); it was deleted from Expo's servers, so an Expo account takeover can't sign updates. The official key fingerprint is published (README, RELEASING.md), and `tools/release-check.mjs` uses Android's own `apksigner` to refuse any APK whose signature isn't valid or isn't made with the official key. | Your side |
| Tampered download | The APK people download differs from the source code here. | Every release lists its SHA-256 checksum (written by the release check, only when all its checks pass) and the official key, so a changed download can be spotted. Builds use only committed code (`requireCommit`), and each release is tagged. Planned with the first public release: build provenance from GitHub Actions, later reproducible builds (RELEASING.md). | Your side |
| Account takeover | Someone gets into the GitHub, Expo or Google Play account and replaces the app or code. | GitHub and Expo use two-factor authentication with an authenticator app (1 Oct 2026); Google Play will too. The signing key isn't on any of these accounts. | Your side |

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
| 30 Sep 2026 | Optional fingerprint/face (strong biometrics only; copy made permanently unusable if a fingerprint is added; password after restart and every 7 days): less typing for keyloggers and onlookers | 15 / 8 / 6 |
| 30 Sep 2026 | Change password from Home (re-scrambles the key with a fresh salt; switches fingerprint/face off) | 15 / 8 / 6 |
| 30 Sep 2026 | Stronger passwords: 4× heavier password check (scrypt 2^17), 12-character minimum, strength hint, older wallets upgraded automatically. Offline guessing closed | 16 / 7 / 6 |
| 30 Sep 2026 | No internet permission (plus "display over other apps", storage, vibration removed); signing refused by any copy that has it; tests guard against it coming back. The Signer going online closed | 17 / 6 / 6 |
| 30 Sep 2026 | Dependency review (DEPENDENCIES.md): nothing high or critical; crypto/native packages pinned exactly. Harmful library stays Partly: a review is a snapshot and must be repeated | 17 / 6 / 6 |
| 30 Sep 2026 | Extra confirmation settings (amount, new receivers, tokens/NFTs, an app's first request, several transfers, bursts; trusted receivers): password only, type the address ending, optional wait. Relaxing needs the password | 17 / 6 / 6 (look-alike addresses reduced, still Partly) |
| 1 Oct 2026 | Signing key moved from Expo to the owner's Mac with encrypted backups; official fingerprint published; release check script. Rows stay "Your side" (they depend on keeping the key and accounts safe) | 16 / 7 / 6 |
| 1 Oct 2026 | Second AI review (REVIEW-2026-10.md): no signing bypass found; 30+ smaller problems fixed (see the report). "Fake Signer" moved to Partly: honest rating until client apps can check the Signer's certificate | 16 / 7 / 6 |
| 5 Oct 2026 | The Signer shows its own seal (signing key) as Android reports it, compared with the official one, in Settings → About and the support text; warning if it differs. Helps spot a re-signed copy; "Fake copy" stays Your side | 16 / 7 / 6 |
| 5 Oct 2026 | Client apps check the Signer's seal before every request (SIGNER-PROTOCOL.md 2c, with a ready-made Expo module); the Hub does it since 4.1.1. "Fake Signer catching requests" → Protected for apps that follow it | 17 / 6 / 6 |
| 5 Oct 2026 | Settings → This phone shows where the key locking the stored wallet is kept (StrongBox, secure area, or software only, with a warning); checked that expo-secure-store already keeps it in the phone's security hardware | 17 / 6 / 6 |
| 5 Oct 2026 | Third AI review (REVIEW-2026-10-05.md), release housekeeping: GPL-3.0-or-later licence, leftover `klvsigner://` link scheme removed (no public entry point at all now), versionCode for updates, release check with Android's own tools (valid signature, permissions, not debuggable, backup off, no link filters; checksum only when OK), builds from committed code only, `requestId` echoed on every answer, third-party notices | 17 / 6 / 6 |
| 5 Oct 2026 | Quick fixes from the third review: signing off when the phone check gets no answer or no startup-check state (fails closed); weak passwords refused; a test that the shipped build is testnet; no more "paste your phrase" tip, warning about the clipboard after a paste | 17 / 6 / 6 |
| 5 Oct 2026 | Accessibility protection (third review, A1): fingerprint/face only while a risky accessibility app is on; "Allow this app?" needs the password or fingerprint. Accessibility abuse stays Partly (misleading overlays from such an app remain possible) | 17 / 6 / 6 |
| 5 Oct 2026 | Approval screen (third review, T1/T2/T3/T9): the box to type is a random middle box (not the ending), token amounts say their number of digits, token/NFT transfers carry a royalty note, KLV-looking tickers say "NOT KLV" | 17 / 6 / 6 |
| 5 Oct 2026 | Large-amount rule on by default for new wallets: over 10,000 KLV (about 10 US dollars) needs the extra confirmation | 17 / 6 / 6 |
| 5 Oct 2026 | New rule "The same transfer again" (on by default): repeating a transfer signed within the last hour (same receiver, token, amount) needs the extra confirmation, against "it failed, approve again" double payments | 17 / 6 / 6 |
| 5 Oct 2026 | Smaller review items: screenshot block re-applied natively (A3), taskAffinity (A4), explicit no-backup/no-transfer rules (A10), "first request" forgotten when an app is removed or allowed again (T5), more note characters refused (T8), wallet-file settings range-checked (C6); the Hub checks the signed answer is exactly its transaction (A9) | 17 / 6 / 6 |
| 6 Oct 2026 | First public release (0.1.0). Weekly check's first report: requests passed on by another app ("forward result") are refused, so they can't borrow an allowed app's name; doc corrections | 17 / 6 / 6 |

## Planned fixes (Stage 4)

- [x] Hide overlays and ignore obscured taps (on every Signer screen)
- [x] Mark sensitive screens so accessibility apps can't read or press them (Android 14+)
- [x] Warn which installed apps have accessibility access turned on
- [x] Warn when the keyboard in use isn't the phone's built-in one
- [x] Require Android 12 as the minimum version (closes task hijacking; overlays blocked by default)
- [x] Make the password check about 4× heavier; 12-character minimum with a strength warning
- [x] Warn when the phone looks insecure (signs of root, unlocked bootloader, no screen lock)
- [x] Switch signing off on rooted or unlocked phones
- [x] Remove the internet permission (every build, not only release), plus other unneeded permissions
- [x] Change password from the Home screen
- [x] Optional fingerprint or face confirmation (the password always stays available as the choice)
- [x] Review all dependencies (DEPENDENCIES.md; repeat before each release)
- [x] Second AI review of the whole app (REVIEW-2026-10.md)
- [ ] Independent human review (community feedback after publishing; a professional one before real money)
- [x] Release process, part 1: signing key moved off Expo, encrypted backups, official fingerprint published, release check script with checksums (RELEASING.md)
- [ ] Release process, part 2: build provenance (GitHub Actions builds unsigned, signing stays on the Mac), reproducible build. Planned for the first public release (RELEASING.md, "Later")
- [x] Two-factor authentication on GitHub and Expo (authenticator app, 1 Oct 2026); Google Play when that account exists

## Sources

- [OWASP Mobile Top 10 2024 (summary by Cobalt)](https://www.cobalt.io/blog/owasp-mobile-top-10-2024-update)
- [Android Developers: Tapjacking](https://developer.android.com/privacy-and-security/risks/tapjacking)
- [Android Developers: StrandHogg / task hijacking](https://developer.android.com/privacy-and-security/risks/strandhogg)
- [App Defense Alliance: MASA FAQ](https://appdefensealliance.dev/masa/faq)
- [WalletScrutiny: Methodology](https://walletscrutiny.com/methodology/)
- [Google Play: Cryptocurrency Exchanges and Software Wallets policy](https://support.google.com/googleplay/android-developer/answer/16329703?hl=en)

_Last updated 5 Oct 2026._
