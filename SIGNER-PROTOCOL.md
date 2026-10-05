# SIGNER-PROTOCOL.md — how your Android app asks the KLV Signer to sign

The **KLV Signer** is an Android app that holds a user's Klever wallet key
and signs Klever transactions **for other apps**, after the user approves each
one with their password. Your app never sees the key. It sends an unsigned
transaction and gets back a signature (or a "no").

This fills a gap: the Klever Wallet app for Android doesn't let other apps
request signatures. The Klever browser extension does this for websites; the
Signer does it for Android apps.

> **Status:** protocol version **1**, **testnet only** for now (the Signer
> refuses mainnet transactions until it's been reviewed further). Only
> **transfers** (KLV, KDA tokens, NFTs) can be signed so far.

---

## 1. How it works in one picture

```
 Your app                         Android                        KLV Signer
 ────────                         ───────                        ──────────
 startActivityForResult ───────►  tells the Signer WHO is calling ─► "Allow this app?" (first time)
   action + transaction                                               shows the transaction in plain
                                                                      words, asks for the password,
                                                                      signs
 onActivityResult ◄──────────────  delivers the answer ONLY to you ◄─ status + signature / reason
```

It uses Android's standard **"start an activity for result"** mechanism.
Android tells the Signer which app is calling (the caller can't fake it) and
returns the answer only to that app.

---

## 2. One-time setup in your app

### 2a. Let your app see the Signer (Android 11+ "package visibility")

Add this to your `AndroidManifest.xml`:

```xml
<queries>
  <package android:name="com.raphaelrohner.klvsigner" />
</queries>
```

In an **Expo** app, add a small config plugin, e.g. `plugins/withKlvSigner.js`:

```js
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withKlvSigner(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.queries = manifest.queries || [];
    manifest.queries.push({ package: [{ $: { 'android:name': 'com.raphaelrohner.klvsigner' } }] });
    return cfg;
  });
};
```

and list it in `app.json` under `"plugins": ["./plugins/withKlvSigner"]`.

### 2b. Always address the Signer exactly

Always give **both** the package and the class name, so no other app can
catch your request:

| | Value |
|---|---|
| Package | `com.raphaelrohner.klvsigner` |
| Class | `com.raphaelrohner.klvsigner.requests.SignRequestActivity` |

The Signer has no public "intent filter" (since 1 Oct 2026): it can **only**
be called this way, by exact name. Requests without the class name don't
reach it.

### 2c. Check that it's the real Signer (strongly recommended)

Addressing the Signer by name (2b) stops other apps from catching your
requests, but not a fake app *installed under the Signer's name* (from an
unofficial source). Every Android app carries a seal: the certificate it was
signed with, which nobody else can copy. So **before every request**, ask
Android whether the installed Signer carries the official seal, and send
nothing if it doesn't. The Devikins Legacy Hub does this since version 4.1.1.

The official fingerprint (SHA-256 of the Signer's signing certificate):

`82:D0:9D:D7:D3:27:A4:8D:DB:97:EE:05:FE:EC:0A:8C:F4:14:C4:81:7F:0F:B7:26:8B:8A:88:F0:25:7E:86:11`

Without colons: `82D09DD7D327A48DDB97EE05FEEC0A8CF414C4817F0FB7268B8A88F0257E8611`.
It's also in the README and in every release's notes. If it ever changes,
that will be announced loudly; until then, treat any other fingerprint as a
fake Signer.

**Rules**

- Check before **every** request, not only once at start-up (the Signer
  could be replaced in between).
- **Fail closed:** if the check says "different", or can't run at all, don't
  send the request. Tell the user in plain words: the Signer on the phone
  isn't the official one; uninstall it, install it from the official source
  and restore the wallet from the recovery words.
- Use `hasSigningCertificate` (below), not your own comparison of
  `signatures`: it also accepts a legitimate future key change, which Android
  records in the app's key history.
- No permission is needed; the `<queries>` entry from 2a is enough.

**Kotlin (native Android apps)**

```kotlin
val official = "82D09DD7D327A48DDB97EE05FEEC0A8CF414C4817F0FB7268B8A88F0257E8611"
    .chunked(2).map { it.toInt(16).toByte() }.toByteArray()
val pm = context.packageManager
val genuine = try {
    pm.getPackageInfo("com.raphaelrohner.klvsigner", 0) // throws if not installed
    pm.hasSigningCertificate("com.raphaelrohner.klvsigner", official, PackageManager.CERT_INPUT_SHA256)
} catch (e: PackageManager.NameNotFoundException) {
    false // not installed: show "please install the KLV Signer"
}
if (!genuine) { /* don't send the request */ }
```

**Expo / React Native**

JavaScript can't ask Android this directly, so add a tiny local Expo module
(Expo links anything in your app's `modules/` folder automatically; no npm
package, no `npm install`). Copy it from the Hub, which is the reference:

```
modules/klv-signer-check/
  expo-module.config.json   lists the Kotlin class
  android/build.gradle      plain Expo module build file
  android/src/main/java/…/KlvSignerCheckModule.kt
                            signerStatus(package, certSha256Hex) →
                            "official" | "different" | "not_installed" | "unknown"
  index.js                  signerStatus(…), "unavailable" when the native
                            part is missing (e.g. Expo Go)
```

The Kotlin part is about 20 lines: `getPackageInfo` (not installed?) and
then `hasSigningCertificate`, exactly as in the Kotlin example above, inside
`Function("signerStatus") { packageName: String, certSha256Hex: String -> … }`.
Change the Kotlin package name to your own app's. Then, in JavaScript, call it
first in every request (section 5 shows where):

```js
import { signerStatus } from '../modules/klv-signer-check';

const OFFICIAL_SIGNER_CERT_SHA256 = '82D09DD7D327A48DDB97EE05FEEC0A8CF414C4817F0FB7268B8A88F0257E8611';

function verifySigner() {
  const status = signerStatus('com.raphaelrohner.klvsigner', OFFICIAL_SIGNER_CERT_SHA256);
  if (status === 'official') return;
  if (status === 'not_installed') throw Object.assign(new Error('The KLV Signer app is not installed.'), { code: 'NOT_INSTALLED' });
  if (status === 'different') throw Object.assign(new Error("The KLV Signer on this phone isn't the official one."), { code: 'SIGNER_NOT_OFFICIAL' });
  throw Object.assign(new Error("Couldn't check the KLV Signer, so nothing was sent."), { code: 'SIGNER_CHECK_FAILED' });
}
```

Because it's native code, it works in a real build (APK), not in Expo Go;
there `verifySigner` refuses, on purpose.

**Building the Signer yourself?** A copy you build from the source code
carries *your* seal, not the official one. For your own testing, add your
fingerprint to the list your app accepts, and never ship that to users.

---

## 3. Requests

Every request needs the extra **`protocolVersion` = `"1"`** (text). You may
add **`requestId`** (any text up to 200 characters). It's sent back unchanged,
so you can match answers to requests. All extras are **text (strings)**.

### 3a. `GET_ADDRESS`: which wallet is in the Signer?

Action: `com.raphaelrohner.klvsigner.action.GET_ADDRESS`

No other extras. Answer (on success): `address` (`klv1…`), `network`
(`testnet`), `chainId` (`109`). You need the address as the **sender** when
you prepare transactions.

### 3b. `SIGN_TRANSACTION`: sign a transaction

Action: `com.raphaelrohner.klvsigner.action.SIGN_TRANSACTION`

Extra `transaction`: the **unsigned transaction as hex**, i.e. a Klever
`Transaction` protobuf that contains **only its `RawData`** (no signatures,
no results). The easiest way: let a Klever node prepare it, e.g. with
`@klever/connect-transactions`:

```js
import { KleverProvider } from '@klever/connect-provider';
import { TransactionBuilder } from '@klever/connect-transactions';

const tx = await new TransactionBuilder(new KleverProvider('testnet'))
  .sender(addressFromSigner)            // from GET_ADDRESS
  .transfer({ receiver, amount: '1500000' }) // 1.5 KLV (6 decimals), or add kda: 'COLLECTION/NONCE' for an NFT
  .build();
const unsignedHex = tx.toHex();
```

**The Signer refuses** (answer `status: error`, `error: INVALID_TRANSACTION`,
with a plain-words `message`) anything it can't fully explain to the user:

- a transaction for another network than the Signer is set to, or from
  another wallet than the one in the Signer,
- any instruction other than a transfer (for now), transfers with royalty
  settings, zero amounts or unusual token names,
- special permissions (`PermissionID` ≠ 0), fees paid in another token (`KDAFee`),
- a format version other than 1, more than 20 transfers,
- unknown fields, or data not written in standard protobuf form (the Signer
  re-encodes what it read and requires identical bytes).

Answer on success:

| Extra | Meaning |
|---|---|
| `signedTransaction` | The complete signed transaction (hex): your bytes + the signature. Ready to broadcast. |
| `signature` | The Ed25519 signature alone (hex, 64 bytes). |
| `transactionHash` | The transaction's fingerprint (blake2b-256 of `RawData`, hex). Same as the node will report. |
| `address`, `network` | The signing wallet and network. |

---

## 4. Answers

The result code is `RESULT_OK` (−1) only when `status` is `ok`. Otherwise
it's `RESULT_CANCELED` (0).

| Extra | Values |
|---|---|
| `status` | `ok`, `rejected` (the user said no) or `error` (the request couldn't be done) |
| `error` | code, see below (only when not `ok`) |
| `message` | plain-words explanation, safe to show to the user |
| `requestId` | your `requestId`, if you sent one |
| `protocolVersion` | `1` |
| `signerRequestId` | the Signer's own id for the request (for debugging) |

**If the result is `RESULT_CANCELED` with no extras at all** (e.g. the Signer
was closed by the system), treat it as "rejected".

| `error` | Meaning |
|---|---|
| `USER_REJECTED` | The user tapped Reject (or went back to your app without deciding). |
| `USER_LEFT` | The user left the Signer without deciding. |
| `NOT_ALLOWED` | The user didn't allow your app to use the Signer. |
| `NO_WALLET` | No wallet is set up in the Signer yet. Only sent to apps the user has allowed; others get `NOT_ALLOWED` first. |
| `INVALID_TRANSACTION` | The Signer refused the transaction; `message` says why. Among the reasons: a fee over 100 KLV, more than 5 notes, token names that aren't plain capital letters and digits. |
| `INVALID_REQUEST` | Required values missing or too long. |
| `UNSUPPORTED_PROTOCOL` | `protocolVersion` missing or unknown. |
| `UNKNOWN_ACTION` | Unknown action. |
| `UNSAFE_DEVICE` | Signing is switched off because the phone looks rooted, its bootloader is unlocked, its startup check failed, or the Signer couldn't run its phone check. `GET_ADDRESS` still works. Tell the user to check the Signer. |
| `NOT_FOR_RESULT` | You opened the Signer without "for result". Use `startActivityForResult`. |
| `BUSY` | The Signer is already handling another request. Try again. |
| `INTERRUPTED`, `INTERNAL` | Something went wrong in the Signer. Try again. |

---

## 5. Example: Expo / React Native

```js
import * as IntentLauncher from 'expo-intent-launcher';

const SIGNER = {
  packageName: 'com.raphaelrohner.klvsigner',
  className: 'com.raphaelrohner.klvsigner.requests.SignRequestActivity',
};
const ACTION = {
  GET_ADDRESS: 'com.raphaelrohner.klvsigner.action.GET_ADDRESS',
  SIGN_TRANSACTION: 'com.raphaelrohner.klvsigner.action.SIGN_TRANSACTION',
};

async function askSigner(action, extra = {}) {
  verifySigner(); // section 2c: the real Signer, or nothing at all
  let result;
  try {
    result = await IntentLauncher.startActivityAsync(action, {
      ...SIGNER,
      extra: { protocolVersion: '1', ...extra },
    });
  } catch (e) {
    throw Object.assign(new Error('The KLV Signer app is not installed.'), { code: 'NOT_INSTALLED' });
  }
  const answer = result.extra || {};
  if (result.resultCode === IntentLauncher.ResultCode.Success && answer.status === 'ok') return answer;
  throw Object.assign(new Error(answer.message || 'Cancelled in the Signer.'), { code: answer.error || 'USER_REJECTED' });
}

// Usage
const { address } = await askSigner(ACTION.GET_ADDRESS);
const { signedTransaction } = await askSigner(ACTION.SIGN_TRANSACTION, { transaction: unsignedHex });
```

## 6. Example: Kotlin

```kotlin
// First: the seal check from section 2c. Not genuine → stop here.
val intent = Intent("com.raphaelrohner.klvsigner.action.SIGN_TRANSACTION").apply {
  setClassName("com.raphaelrohner.klvsigner", "com.raphaelrohner.klvsigner.requests.SignRequestActivity")
  putExtra("protocolVersion", "1")
  putExtra("transaction", unsignedHex)
}
val launcher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
  val data = result.data
  if (result.resultCode == Activity.RESULT_OK && data?.getStringExtra("status") == "ok") {
    val signed = data.getStringExtra("signedTransaction")
    // broadcast it
  } else {
    val reason = data?.getStringExtra("message") ?: "Cancelled"
  }
}
launcher.launch(intent) // ActivityNotFoundException = Signer not installed
```

---

## 7. Sending the signed transaction

Broadcasting is **your app's job**: the Signer never goes online. Send
`signedTransaction` to a Klever node. With `@klever/connect-provider` 0.2.2,
pass it as JSON (its hex input path is broken in that version):

```js
import { KleverProvider } from '@klever/connect-provider';
import { Transaction } from '@klever/connect-transactions';

const hash = await new KleverProvider('testnet')
  .sendRawTransaction(JSON.stringify(Transaction.fromHex(signedTransaction).toJSON()));
// explorer: https://testnet.kleverscan.org/transaction/<hash>
```

---

## 8. Good manners

- Ask for `GET_ADDRESS` once and remember the address; don't call it every time.
- Show your users what they're about to sign before opening the Signer. The
  Signer shows it again, from its own reading.
- Never ask users for their recovery phrase or private key. That's what the
  Signer is for.
- Check the Signer's seal before every request (2c), and send nothing if it
  doesn't match.
- Handle "no" gracefully: `rejected` is a normal answer, not a crash.
