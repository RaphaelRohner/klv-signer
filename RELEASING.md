# RELEASING.md — how a Signer release is made

Plain-English steps for publishing a new version of the KLV Signer. Do them
in order. Testnet only until the owner decides otherwise.

## The signing key (the Signer's "seal")

Every APK is signed with the Signer's key. A phone only accepts an update
signed with the **same** key, and client apps check it (SIGNER-PROTOCOL.md,
2c). Whoever has the key can publish APKs that phones accept as genuine
updates, so it's the most valuable thing in this project.

| | |
|---|---|
| Official fingerprint (SHA-256) | `82:D0:9D:D7:D3:27:A4:8D:DB:97:EE:05:FE:EC:0A:8C:F4:14:C4:81:7F:0F:B7:26:8B:8A:88:F0:25:7E:86:11` |
| Created | 29 Sep 2026 (by Expo, at the first build), valid until 2054 |
| Lives in | `app/credentials.json` (passwords) + `app/credentials/android/keystore.jks` (the key) on the owner's Mac only. **Never in git** (.gitignore blocks both). |
| Backups | Two offline copies of BOTH files: a USB stick kept somewhere safe, and the password manager. |
| Used by | `eas.json`: `"credentialsSource": "local"`, so builds take the key from these files, not from Expo. |

If every copy is lost, no further updates are possible: users would have to
uninstall the Signer and restore their wallet from the recovery words. If the
key is ever stolen, tell users immediately (README, Klever forum) and stop
installing updates until a new, re-keyed Signer is announced.

### One-time move from Expo to the Mac (done 1 Oct 2026)

1. In Terminal, in the `app` folder: `npx eas-cli@latest credentials -p android`
   → build profile **preview** → (menu wording may differ slightly) **credentials.json: Upload/Download
   credentials between EAS servers and your local json** → **Download
   credentials from EAS to credentials.json**.
2. Check: `git status` must NOT list `credentials.json` or `credentials/`.
3. Build as usual, run the release check (below): it must say **OK** (same
   seal as before, so the phone installs it as an update and keeps the wallet).
4. Make the two backups. Test the USB copy: the files open / are there.
5. Only then delete the key at Expo: `npx eas-cli@latest credentials -p android`
   → **preview** → **Keystore: Manage everything needed to build your project**
   → **Delete your keystore**. (Expo warns that this can't be undone; that's
   expected, your local copy and backups are the key now.)

## Making a release

Do these in order, from the `app` folder unless noted. Version `0.2.0` is the
example; use the real one.

1. **Clean start:** `git status` shows nothing to commit (builds refuse
   uncommitted changes anyway: `requireCommit` in eas.json). Then `npm ci`
   (installs exactly what package-lock.json says).
2. **Checks:** `npm test` → `# fail 0`, and the checklist "Before every
   release" in DEPENDENCIES.md (audit, versions). **Never `npm audit fix
   --force`**: it would install a years-old Expo and break the app.
3. **Version:** in `app/app.json` raise `"version"` (e.g. 0.1.0 → 0.2.0) **and**
   `"android" → "versionCode"` by one (e.g. 1 → 2). Android uses the
   versionCode to refuse installing an older version over a newer one. Note
   what changed. Commit.
4. **Notices:** `node tools/third-party-notices.mjs` → updates
   `THIRD-PARTY-NOTICES.md` (licences of the packages inside the app). Commit
   if it changed.
5. **Build:** `npx eas-cli@latest build --platform android --profile preview --local`
6. **Name it and check it:** `cp build-<number>.apk klv-signer-0.2.0.apk`, then
   `node tools/release-check.mjs klv-signer-0.2.0.apk`
   → must end with **OK**. It uses Android's own tools from the Android SDK
   (apksigner, aapt2) and checks: valid signature with the official key, no
   internet or other removed permissions, not a debug build, backup off, no
   link filters, versionCode higher than every earlier release. Only then
   does it write `klv-signer-0.2.0.apk.sha256`. If it says STOP: don't publish.
7. **Phone test:** install it over the previous version (`adb install -r …`):
   wallet still there, unlock, one Hub test transfer.
8. **Tag the commit:** in the project folder, `git tag v0.2.0` and
   `git push origin v0.2.0` (so everyone can see exactly which code it is).
9. **GitHub release** (repository → Releases → Draft a new release):
   - Tag: `v0.2.0`, title "KLV Signer 0.2.0 (testnet preview)".
   - Upload `klv-signer-0.2.0.apk`, `klv-signer-0.2.0.apk.sha256` and
     `THIRD-PARTY-NOTICES.md`.
   - Also the example app, so testers can try the Signer: build it in
     `example/` (see example/README.md), name it
     `klv-signer-example-0.1.0.apk`, make its checksum with
     `shasum -a 256 klv-signer-example-0.1.0.apk > klv-signer-example-0.1.0.apk.sha256`
     and upload both. (The release check is for the Signer itself; the
     example app has its own key, kept by Expo, and no wallet. Its
     fingerprint, for the release notes: `D3:A5:AE:6C:38:39:F0:DF:44:42:23:BE:4D:27:0D:7F:04:10:2E:B4:AD:8B:BE:38:68:EA:39:FF:93:C1:A6:AF`.)
   - Notes: what changed, the commit hash (`git rev-parse v0.2.0`), the
     checksum, the official key fingerprint, "testnet only, no independent
     audit yet", and the "Before you start" text from the README (as is, own
     risk, only funds you could afford to lose).
   - Tick **Set as a pre-release** while it's testnet.
10. **Record it:** add `{ "version": "0.2.0", "versionCode": 2 }` to
   `app/tools/released-versions.json` (the release check prints the line)
   and commit. From then on, a build with the same or a lower versionCode
   is refused.
11. **Announce** (Klever forum) with a link to the release, never to a file
   hosted anywhere else.

## Right after the repository goes public

- Switch on the **weekly check** (WEEKLY-CHECK.md): ask Claude to "set up
  the weekly check from WEEKLY-CHECK.md". Every Monday it tests, checks the
  packages and reviews the week's changes, and emails a short report.
- GitHub → Settings → Code security: **Dependabot alerts** (switched on
  6 Oct 2026) and **Secret scanning**: only offered for public repositories
  on a free account, so check it right after going public (GitHub usually
  switches it on by itself then).

## Later

- **To do, with the first public release** (decided 5 Oct 2026), when the
  repository goes public. As far as we know, GitHub's provenance
  certificates are free for public repositories only.
  - **Build provenance:** pushing a version tag (e.g. `v0.2.0`) makes GitHub
    Actions build the APK **unsigned** and publish a certificate ("built by
    GitHub from commit X"). Raphael downloads it and **signs it on the Mac**
    as now. The signing key never goes to GitHub, so the 1 Oct decision
    stays. `tools/release-check.mjs` then also checks that the signed APK's
    contents match GitHub's build. Adds one step: wait ~15–20 min, download.
  - **Reproducible builds:** anyone building from the source code gets the
    same APK (apart from the seal). Fiddly with Expo/React Native (dates and
    file order in the build must be pinned); work on Claude's side plus a
    few test builds. No change to the workflow.
  - Day-to-day testing (local preview builds) doesn't change.
- Google Play / F-Droid (see the Developer FAQ).
