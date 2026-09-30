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
| `NO_WALLET` | No wallet is set up in the Signer yet. |
| `INVALID_TRANSACTION` | The Signer refused the transaction; `message` says why. |
| `INVALID_REQUEST` | Required values missing or too long. |
| `UNSUPPORTED_PROTOCOL` | `protocolVersion` missing or unknown. |
| `UNKNOWN_ACTION` | Unknown action. |
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
- Handle "no" gracefully: `rejected` is a normal answer, not a crash.
