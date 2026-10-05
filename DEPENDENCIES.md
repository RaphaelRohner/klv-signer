# DEPENDENCIES.md — what the KLV Signer is built from

A review of every add-on package ("dependency") the Signer uses: what each
one does, whether it ends up inside the app on your phone, and what could go
wrong. Done 30 Sep 2026 (Stage 4). **Repeat the checks at the end before
every release.**

## In one paragraph

The app on your phone contains our own code, Expo and React Native (the
toolkit it's built with), and a short list of crypto libraries. All packages
come from the official npm registry and are locked to exact versions with
integrity hashes (`package-lock.json`), so a build can't silently pick up a
changed package. `npm audit` finds **no problems in anything that goes into
the app.** It does list 24 findings (17 "high", 7 "moderate", re-checked 5 Oct
2026), but they all come from two issues in Expo's command-line build tool
(`@expo/cli`), which runs on the Mac and never ends up in the app (see
finding 1). And since the Signer has no internet permission, even a harmful
package couldn't send anything out.

## What ends up in the app

| Where | Count | What |
| --- | --- | --- |
| JavaScript bundle | 81 packages | Our code, React Native, Expo, the crypto libraries below, and small helpers they need |
| Native (Android) code | 17 modules | Expo's standard modules, our own `klv-signer-requests`, `react-native-quick-crypto` (+ `nitro-modules`, `quick-base64`), `safe-area-context` |
| Only on your Mac, for building/testing | ~650 more | Build tools, linter, test tools, the two Klever libraries used by `tools/` |

## The packages that matter most (they touch keys, passwords or signatures)

| Package | Version | What it does in the Signer | Who makes it | Pinned |
| --- | --- | --- | --- | --- |
| `@klever/connect-crypto` | 0.2.0 | Recovery words → wallet key (Klever's own recipe); Ed25519 signing | Klever | exact |
| `@klever/connect-encoding` / `-core` | 0.1.3 / 0.1.4 | Pulled in by connect-crypto (address format). Not used directly: its transfer reader has a bug, so the Signer uses its own reader | Klever | exact |
| `@noble/hashes` | 1.8.0 | scrypt (backup engine), blake2b (transaction fingerprint), SHA | Paul Miller (noble, independently audited) | exact |
| `@noble/ciphers` | 1.3.0 | AES-256-GCM, the vault's scrambling | Paul Miller (noble, audited) | exact |
| `@noble/ed25519`, `@noble/curves`, `@scure/bip32` | 2.3.0 / 1.9.7 / 1.7.0 | Used inside connect-crypto (signatures, key derivation) | Paul Miller (audited) | locked |
| `@scure/base` | 2.4.0 (+ 1.2.6 inside bip32/bip39) | Address encoding (bech32): used directly by `src/klever/address.js`, and by connect-crypto | Paul Miller (audited) | exact (2.4.0) / locked |
| `@scure/bip39` | 1.6.0 | Recovery-word list and checks | Paul Miller (audited) | exact |
| `react-native-quick-crypto` | 1.1.7 | The fast scrypt engine (checked against noble on every start) | Margelo | exact |
| ↳ OpenSSL (`io.github.ronickg:openssl-static`) | 3.6.2-2 | The native crypto code inside quick-crypto (Android library from Maven) | community build of OpenSSL | fixed in quick-crypto's build file |
| `react-native-nitro-modules`, `react-native-quick-base64` | 0.37.1 / 3.0.1 | Required helpers of quick-crypto | Marc Rousavy / Takuya Matsuyama | exact |
| `expo-secure-store` | 57.0.4 | Saving the vault in Android's Keystore; fingerprint/face copy | Expo | locked |
| `expo-crypto` | 57.0.3 | The phone's secure random numbers (new wallets, salts) | Expo | locked |
| `expo-screen-capture` | 57.0.3 | Blocking screenshots on sensitive screens | Expo | locked |
| `qrcode-generator` | 2.0.4 | Draws your address as a QR code (Receive screen). Added 1 Oct 2026: MIT, no dependencies, no install scripts, no network code; only ever sees the public address | Kazuhiko Arase | exact |

"exact" = the version is written exactly in `package.json`; "locked" = fixed by
`package-lock.json` (Expo's own packages follow the Expo version, 57).

## Findings

1. **`npm audit` (re-checked 5 Oct 2026): 0 critical, 17 high, 7 moderate,
   none in the app itself.** All come from three advisories in build tools:
   - [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
     in `braces` 3.0.3 (a deeply nested file pattern can crash it), used by
     `micromatch` → `@expo/metro-file-map` → `@expo/cli`, the tool that
     bundles the app on the Mac;
   - [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv)
     in `node-forge` 1.4.0 (RSA signature checking), used by `@expo/cli` for
     Expo's update-signing feature, which the Signer doesn't use;
   - [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq)
     in `uuid` 7.0.3, inside an iPhone-project tool (the 7 moderate ones).

   `npm audit` lists `expo`, `react-native`, `metro` and even
   `react-native-quick-crypto` as "high" only because they *depend on*
   `@expo/cli`; `npm ls braces node-forge --omit=dev` shows both sit only
   under `@expo/cli`. **No action; never run `npm audit fix --force`**: it
   would "fix" this by installing Expo 44 from 2021 and break the app. They go
   away when Expo updates these tools.
2. **Everything comes from the official npm registry, each with an integrity
   hash.** No packages from Git links or other servers.
3. **Only one package runs a script when installed:** `unrs-resolver`, part
   of the code-style checker (linter), on your Mac only. None of the app's
   packages do.
4. **Licences:** all permissive (MIT, ISC, Apache-2.0, BSD and similar). The
   few others (MPL-2.0 `lightningcss`, CC-BY `caniuse-lite`) are build tools
   or data, not in the app. Nothing requires publishing your own code.
5. **Newer major versions exist for noble/scure (2.x).** Staying on 1.x on
   purpose: 1.8/1.3 are current, audited, and 2.x changes how they're loaded.
   Upgrade later as a separate, tested step.
6. **React Native includes a `fetch` add-on** (for web requests). It can't
   do anything: the Signer has no internet permission, and a test checks
   that our own code never uses network functions.
7. **Expo links a few standard native modules the Signer doesn't use**
   (e.g. `@expo/dom-webview`, `expo-file-system`, `expo-font`). They're never
   called. Removing them from the build is possible, but it risks breaking
   Expo, and there's little to gain without internet. Left as is.
8. **Android (Gradle) libraries have no lock file.** quick-crypto names an
   exact OpenSSL version, but Gradle downloads it at build time. Adding
   Gradle's "dependency verification" (checksums) belongs to the release
   process (SECURITY.md, planned).

## Changes made in this review

- Pinned the crypto and native packages to exact versions in `package.json`
  (`@noble/hashes`, `@noble/ciphers`, `react-native-quick-crypto`,
  `react-native-nitro-modules`, `react-native-quick-base64`). They had been
  `~`/`^` ranges before; the installed versions don't change.
- Added `app/.npmrc` with `save-exact=true`, so packages added later are
  also recorded with an exact version.

## Before every release (and after any `npm install` of something new)

From the `app` folder:

0. Install exactly what package-lock.json says: `npm ci` (not `npm install`;
   some of Klever's packages allow version ranges, only the lock file fixes them).
1. `npm audit --omit=dev` → nothing critical, and nothing high or moderate
   in a package that goes into the app. For each finding, `npm ls <package>
   --omit=dev` shows where it sits; build tools only (like finding 1) is fine.
   **Never `npm audit fix --force`.**
2. `git diff package-lock.json` → every changed package is one you expected.
3. `npm ls @noble/hashes @noble/ciphers @noble/curves @noble/ed25519 @scure/bip39 @scure/base @klever/connect-crypto`
   → the versions in the table above (@scure/base: 2.4.0, plus 1.2.6 inside bip32/bip39).
4. `npm test` → all tests pass (includes the "no internet" and crypto checks).
5. Update the table above if a version changed, with the date.
6. If `expo-secure-store` changed: check its Keystore name is still
   `AES/GCM/NoPadding:key_v1:keystoreUnauthenticated` (its `AESEncryptor.kt`).
   DeviceSecurity.kt looks for exactly that name to report where the wallet's
   lock is kept; if it changed, Settings → This phone shows "Couldn't check".
