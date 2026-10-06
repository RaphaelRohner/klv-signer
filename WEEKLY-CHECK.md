# WEEKLY-CHECK.md — the automatic weekly check

Every Monday morning a fresh Claude session checks the KLV Signer and emails
the owner a short summary. It only **reads and reports**: it never changes
code, never pushes, never opens pull requests. Fixes are made together, as
usual.

**Status:** prepared 5 Oct 2026. To be switched on right after the repository
goes public (owner's decision): the check then reads the public code and
nothing has to be connected. Together with it, switch on GitHub's free
security alerts (below).

## What it does

1. Gets the latest code from `https://github.com/RaphaelRohner/klv-signer`
   (branch `main`).
2. `npm ci` and `npm test` in `app/` (all tests must pass).
3. `npm audit --omit=dev`, and for every finding where it sits
   (`npm ls <package> --omit=dev`): only Expo's build tools (known, see
   DEPENDENCIES.md, finding 1) or something new that ends up in the app?
4. New versions of the packages that matter most (`npm outdated`): Klever's
   libraries, `@noble/*`, `@scure/*`, `react-native-quick-crypto`,
   `expo-secure-store`, `expo` itself. A new version is **not** installed,
   only reported, with what its release notes say about security.
5. What changed in the code since the last report (git log), and an
   independent AI review of those changes (crypto, transactions, Android,
   docs claims). With no changes: a light spot check of one area, rotating.
6. Writes the report (below) and ends with a short summary, which is what
   arrives by email.

## The report

- **Verdict in one line:** "All fine", or "Something needs a look", or
  "Act now" (e.g. a security advisory in a package inside the app).
- Tests: passed / failed (which).
- Dependencies: new advisories (in the app or only build tools), new
  versions of the important packages.
- Code changes since last week and what the review found, with severity
  (High / Medium / Low) and a plain-words explanation.
- Nothing is changed in the repository.

## When a report says "Something needs a look" or "Act now"

The check doesn't fix anything itself (on purpose: no change to a wallet app
without the owner seeing and testing it). Open a chat in the claude.ai
project "KLV Signer App", paste the report (or its summary), and Claude
checks it against the code, fixes what's needed, runs the tests and commits;
the owner builds, tests on the phone and pushes, as usual. "All fine" needs
nothing.

## The instruction the scheduled task runs

(Used as the scheduled task's prompt. Every run starts with no memory of
earlier ones, so it's complete on its own.)

```
Weekly check of the KLV Signer (Android wallet signer app, testnet only).
Report only: do NOT change, commit, push or open pull requests anywhere.

1. git clone https://github.com/RaphaelRohner/klv-signer.git and read
   AGENTS.md, SECURITY.md, DEPENDENCIES.md and WEEKLY-CHECK.md first.
2. In app/: npm ci, then npm test. Note the pass/fail count and any failures.
3. npm audit --omit=dev --json. For each finding, npm ls <package> --omit=dev
   to see where it sits. Known and accepted: braces/micromatch, node-forge,
   uuid under @expo/cli, source-map-js under postcss/@expo/metro-config
   (build tools only, DEPENDENCIES.md finding 1). Flag
   anything else, especially in packages that end up in the app.
4. npm outdated for: @klever/connect-crypto, @klever/connect-encoding,
   @noble/hashes, @noble/ciphers, @noble/curves, @noble/ed25519,
   @scure/bip39, @scure/bip32, @scure/base, react-native-quick-crypto,
   expo-secure-store, expo-crypto, expo-screen-capture, expo. For each newer
   version, read its release notes/changelog and say whether it mentions
   security fixes. Do not install anything.
5. git log --since="8 days ago" --stat. If code changed, review the changed
   files independently (use separate reviewer agents if available, one each
   for crypto/key handling, transaction reading/signing, Android/app-to-app,
   docs claims vs code). Verify each finding against the code before
   reporting it. If nothing changed, do a light spot check of one area,
   chosen by the week number (crypto, transactions, Android, docs).
6. Final answer = the report, short and in plain English for a non-programmer:
   first line "Verdict: All fine" / "Verdict: Something needs a look" /
   "Verdict: Act now"; then tests, dependencies (advisories and new versions),
   code changes and review findings with severity and a one-line
   explanation each. Mention nothing secret (there is nothing secret in the
   repo; the signing key is not in it).
```

## Switching it on (with Claude, after going public)

1. Ask Claude: "set up the weekly check from WEEKLY-CHECK.md". It creates a
   scheduled task (Mondays, morning Dublin time) with the instruction above
   and email notification on.
2. GitHub → the repository → **Settings → Code security** → switch on
   **Dependabot alerts** (free). GitHub then emails as soon as a package the
   Signer uses gets a known security problem, without waiting for Monday.
3. Optional, same page: **Secret scanning** (warns if a key or password is
   ever committed by mistake).
