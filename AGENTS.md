# Notes for AI helpers working on the KLV Signer

Read this before changing anything. Also read `HOW-IT-WORKS.md`, which is the
design this project follows, and `app/AGENTS.md` for Expo-specific rules.

## Who you're working with

- The owner is **not a programmer**. Explain everything in plain language,
  avoid jargon (or explain it the first time), and don't assume they can
  debug code themselves.
- **Comment the code extensively.** Every file starts with a plain-English
  header saying what it's for. Every function says what it does and why.
  Tricky or security-relevant lines get their own comment.
- Keep `README.md` (status + folder map), `HOW-IT-WORKS.md` and `TESTING.md`
  up to date whenever something changes.

## Project facts

- **Scope: a general-purpose signer for ANY Android app using the Klever
  chain** ("client apps"). The **Devikins Legacy Hub** (package
  `com.raphaelrohner.devikinslegacyhub`, app name "DLH") is the first client
  and test partner, but nothing in the Signer may be specific to it.
- Expo SDK 57, plain JavaScript (no TypeScript), same as the Hub.
- Builds: `npx eas-cli@latest build --platform android --profile preview --local`
  on the owner's Mac (Java 17 via Homebrew temurin@17, Android SDK 36 + NDK).
  Same as the Hub. Only the owner can build; the AI sandbox can't.
- The template's `app/AGENTS.md` recommends Expo Router and EAS cloud builds.
  We use neither: navigation is a simple state machine in `App.js`, and
  builds are local.
- Client ↔ Signer transport (Stage 3): Android startActivityForResult. Clients
  call it via `expo-intent-launcher` (`startActivityAsync(<custom action>, { extra })`);
  the Signer reads the intent, identifies the caller with
  `Activity.getCallingPackage()` (set by the OS, only present for
  for-result calls; additionally verify the caller's signing certificate via
  PackageManager), and replies with `setResult()`. This needs a small local
  Expo native module in the Signer. The `klvsigner://` scheme in app.json is
  left over from the earlier two-deep-link plan and must NOT be used for
  signing requests (deep links don't identify the caller).
- Android package `com.raphaelrohner.klvsigner`. Never change it.

## Before declaring any change done

From `app/`:
- `npm test`: node's built-in test runner on `tests/*.test.js` (security core).
- `npx expo lint`: must be clean.
- `npx expo-doctor`: must pass.
- `npx expo export --platform android --no-bytecode`: must bundle. (Plain
  `expo export` fails inside the Linux ARM sandbox at the hermesc step. That's
  a sandbox limitation, not a project bug.)
- Files under `src/crypto/`, `src/security/` must stay free of React Native
  imports so they stay testable in Node (the one exception is the guarded
  `require('react-native-quick-crypto')` in `passwordKey.js`). Use explicit `.js`
  extensions in relative imports (Node ESM needs them; Metro accepts them).

## Security rules (non-negotiable)

1. The private key never leaves the Signer: no export, no clipboard, no logs,
   no network, no deep-link reply containing it. The recovery phrase is shown
   once at creation and never stored.
2. The approval screen shows what it decoded from the transaction bytes
   itself, plus the OS-verified identity of the calling app. Never display
   text supplied by the caller as if it were the transaction's content or
   the caller's identity. Unknown callers must first be allowed by the user
   ("connected apps"), which the user can revoke.
3. Only transaction types the Signer can fully decode and explain get signed
   (start: transfers of KLV/KDA/NFTs). Refuse anything else, and refuse wrong
   network or wrong sender.
4. Vault = scrypt(password NFKC, 16-byte salt; N=2^15,r=8,p=1) → AES-256-GCM
   (12-byte nonce, AAD = "klv-signer-vault-v1:<address>"), stored as JSON in
   expo-secure-store (`klvsigner.vault.v1`). Password never stored. After
   decrypt, the address derived from the key must equal the vault's address.
   scrypt engine: react-native-quick-crypto, self-checked against
   @noble/hashes on first use, with @noble fallback.
5. Wallet derivation: `@klever/connect-crypto` 0.2.0 (pinned). BIP-39 →
   SLIP-10 Ed25519 at m/44'/690'/0'/0'/0'. Verified against an independent
   implementation (test vector in `tests/crypto.test.js`).
6. Klever signing (Stage 2): Ed25519 signature over blake2b-256 of the
   transaction's RawData protobuf bytes (see `@klever/connect-transactions`,
   `Transaction.getHash()`).
7. Testnet until the owner explicitly decides to go to mainnet.
