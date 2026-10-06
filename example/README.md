# KLV Signer Example

The smallest Android app that uses the [KLV Signer](../README.md): connect,
see your testnet balance, send KLV, with every signature approved in the
Signer. **Testnet only.** It never sees or stores a key.

It's both a way to try the Signer and a working example for developers who
want to add "Sign with KLV Signer" to their own app. The rules it follows
are in [SIGNER-PROTOCOL.md](../SIGNER-PROTOCOL.md).

## What to copy into your own app

| File | What it does | Protocol |
|---|---|---|
| `src/klvSigner.js` | Asks the Signer for the address and signatures (`expo-intent-launcher`); checks the Signer's seal before every request and the signed answer before sending | 2b, 2c, 3, 4, 8 |
| `modules/klv-signer-check/` | Tiny native module: "is the installed Signer the official one?" | 2c |
| `plugins/withKlvSigner.js` | Makes the Signer visible to the app on Android 11+ (`<queries>`) | 2a |
| `src/kleverTx.js` | Prepares unsigned transfers with a Klever testnet node, checks the node prepared exactly what was typed, and sends signed ones | 7 |
| `App.js` | The one screen | |

## Building it

```
cd example
npm install
npx eas-cli@latest build --platform android --profile preview --local
```

The first build asks to create an Expo project and a signing key for this
app ("Generate a new Android Keystore?" → yes). Expo keeps that key: it's a
different key from the Signer's, and it protects nothing valuable (the app
holds no wallet; every transaction still needs approval in the Signer).

Its package id is `com.raphaelrohner.klvsignerexample`, and the official
example app is signed with this key (SHA-256, created by Expo on 6 Oct 2026):

`D3:A5:AE:6C:38:39:F0:DF:44:42:23:BE:4D:27:0D:7F:04:10:2E:B4:AD:8B:BE:38:68:EA:39:FF:93:C1:A6:AF`

(Not the Signer's key: that one is `82:D0:9D:…:7E:86:11`, see ../README.md.) Licence: GPL-3.0-or-later,
like the Signer (see ../LICENSE).
