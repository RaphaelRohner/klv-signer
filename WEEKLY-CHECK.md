# WEEKLY-CHECK.md — the automatic weekly check

Every Monday morning a fresh Claude session checks the KLV Signer and emails
the owner a short summary. It only **reads and reports**: it never changes
code, never pushes, never opens pull requests. Fixes are made together, as
usual.

**Status:** switched on 6 Oct 2026, right after the repository went public.
Runs every **Monday at 8:54** (Dublin time) as the scheduled task "KLV Signer
weekly check" in claude.ai; the summary arrives by email. It reads the
public code, so nothing has to be connected. GitHub's Dependabot alerts are
on too (below).

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
6. Lists everything still open in OPEN-FINDINGS.md (and whether it still
   looks open in the code).
7. Writes the report (below) and ends with a short summary, which is what
   arrives by email.

## The report

- **Verdict in one line:** "All fine", or "Something needs a look", or
  "Act now" (e.g. a security advisory in a package inside the app).
- Tests: passed / failed (which).
- Dependencies: new advisories (in the app or only build tools), new
  versions of the important packages.
- Code changes since last week and what the review found, with severity
  (High / Medium / Low) and a plain-words explanation.
- Still open from earlier: every point listed under "Open" in
  OPEN-FINDINGS.md (added 19 Oct 2026, after a week without code changes
  reported "nothing" while a Medium finding was still open).
- Nothing is changed in the repository.

## When a report says "Something needs a look" or "Act now"

The check doesn't fix anything itself (on purpose: no change to a wallet app
without the owner seeing and testing it). Open a chat in the claude.ai
project "KLV Signer App", paste the report (or its summary), and Claude
checks it against the code, fixes what's needed, runs the tests, records the
points in OPEN-FINDINGS.md (open, fixed or accepted) and commits;
the owner builds, tests on the phone and pushes, as usual. "All fine" needs
nothing.

## The instruction the scheduled task runs

(Used as the scheduled task's prompt, word for word since 19 Oct 2026.
Every run starts with no memory of earlier ones, so it's complete on its own.)

```
Weekly check of the KLV Signer (Android wallet signer app, testnet only).
Owner: Raphael Rohner, not a programmer: write the report in plain English.
Report only: do NOT change, commit, push or open pull requests or issues anywhere.

1. git clone https://github.com/RaphaelRohner/klv-signer.git and read
   AGENTS.md, SECURITY.md, DEPENDENCIES.md, WEEKLY-CHECK.md and
   OPEN-FINDINGS.md first. WEEKLY-CHECK.md describes this check; follow it
   if it differs from this text.
2. In app/: npm ci, then npm test. Note the pass/fail count and any failures.
   (If npm ci fails because of the network, say so and continue with what
   is possible.)
3. In app/: npm audit --omit=dev --json. For each finding,
   npm ls <package> --omit=dev to see where it sits. Known and accepted:
   braces/micromatch, node-forge, uuid under @expo/cli, and source-map-js
   under postcss/@expo/metro-config (build tools only, DEPENDENCIES.md
   finding 1). Flag anything else, especially in packages that end up in
   the app.
4. In app/: npm outdated for @klever/connect-crypto, @klever/connect-encoding,
   @noble/hashes, @noble/ciphers, @noble/curves, @noble/ed25519,
   @scure/bip39, @scure/bip32, @scure/base, react-native-quick-crypto,
   expo-secure-store, expo-crypto, expo-screen-capture, expo. For each newer
   version, read its release notes/changelog and say whether it mentions
   security fixes. Do not install anything.
5. git log --since="8 days ago" --stat (fetch enough history for that). If
   code changed, review the changed files independently (use separate
   reviewer agents if available: crypto/key handling, transaction
   reading/signing, Android/app-to-app, and docs claims vs code; the example
   app in example/ too). Verify each finding against the code before
   reporting it. If nothing changed, do a light spot check of one area,
   chosen by the ISO week number modulo 4 (0 crypto, 1 transactions,
   2 Android, 3 docs claims).
6. Open findings: list every point under "Open" in OPEN-FINDINGS.md with its
   severity, and check against the code whether it is still open (say so if
   one looks fixed but is still listed). Any open Medium or higher means at
   least "Something needs a look", even in a week without code changes.
   (If OPEN-FINDINGS.md doesn't exist, say so.)
7. Also check that the latest GitHub release's Signer APK checksum (its
   .sha256 file) matches app/tools/released-versions.json, if you can
   download it.
8. Final answer = the report, short and plain: first line exactly one of
   "Verdict: All fine" / "Verdict: Something needs a look" /
   "Verdict: Act now"; then: tests; dependencies (new advisories, where they
   sit; newer versions of the important packages and whether they're
   security fixes); code changes and review findings with severity
   (High/Medium/Low) and a one-line explanation each; "Still open from
   earlier" (from OPEN-FINDINGS.md); anything else notable. End with: "To act
   on this, paste this report into a chat in the claude.ai project 'KLV
   Signer App'." Mention nothing secret (there is nothing secret in the
   repository).
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
