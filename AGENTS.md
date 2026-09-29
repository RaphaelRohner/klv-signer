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
- Keep `README.md` (status + folder map) and `HOW-IT-WORKS.md` up to date
  whenever something changes.

## Project facts

- Expo SDK 57, plain JavaScript (no TypeScript), same as the sister app
  **Devikins Legacy Hub** (package `com.raphaelrohner.devikinslegacyhub`,
  app name "DLH"). The Hub is built locally into APKs, not with EAS cloud builds.
- The template's `app/AGENTS.md` recommends Expo Router and EAS. We don't use
  either here: this is a single-purpose app with a few screens, and builds are
  local like the Hub's.
- Signer link scheme: `klvsigner://`. Hub reply scheme: `dlh://`.
- Android package `com.raphaelrohner.klvsigner`. Never change it.

## Security rules (non-negotiable)

1. The private key never leaves the Signer: no export, no clipboard, no logs,
   no network, no deep-link reply containing it.
2. The approval screen shows what it decoded from the transaction bytes
   itself. Never display text supplied by the caller as if it were the
   transaction's content.
3. Only allow-listed transaction types get signed (start: transfers). Refuse
   anything else, and refuse wrong network or wrong sender.
4. The key is encrypted with a key derived from the user's app password
   (scrypt → AES-GCM), stored in expo-secure-store. The password is never
   stored.
5. Klever signing: Ed25519 signature over blake2b-256 of the transaction's
   RawData protobuf bytes (see `@klever/connect-transactions`,
   `Transaction.getHash()`).
6. Testnet until the owner explicitly decides to go to mainnet.
