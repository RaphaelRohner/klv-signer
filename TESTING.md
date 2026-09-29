# TESTING.md — how to build the Signer and test it on your phone

This guide is for **Stage 1: wallet + password**. Follow the parts in order.
Each test says what you should see. If something looks different, stop and
tell Claude what happened (a photo of the screen helps. Just never
photograph a recovery phrase you intend to keep).

> **Only use test wallets.** Everything here is for a brand-new wallet that
> has never held anything of real value.

---

## Part A — Before building (on your Mac, in Terminal)

Open Terminal in the Signer's `app` folder
(`Documents/KLV Signer App/app`).

**A1. Install the building blocks** (needed again whenever `package.json` changes):

```
npm install
```

You may see the same "moderate severity vulnerabilities" note as before.
That's expected and harmless (it's in Expo's build tools, not in the app).
**Don't** run `npm audit fix --force`.

**A2. Run the automatic checks:**

```
npm test
```

At the end you should see `# pass 17` and `# fail 0`. These check the
security code: that wallets match Klever's recipe, that wrong passwords are
refused, that a tampered vault is refused, and so on. If anything fails,
stop here.

**A3. One-time only: register the Signer with your Expo account.**
The Hub is already registered. The Signer is a separate app, so it needs
its own entry once:

```
npx eas-cli@latest init
```

Answer **yes** when it asks to create a project. This adds a `projectId`
line to `app.json`. Nothing is uploaded, and it doesn't cost anything.

## Part B — Build the APK

Same way you build the Hub (a local build on your Mac, using the Java 17 and
Android tools you already set up for it):

```
npx eas-cli@latest build --platform android --profile preview --local
```

The first build takes a while. One of the new building blocks
(react-native-quick-crypto, the fast password engine) is compiled from
scratch. At the end you get a `build-….apk` file in the `app` folder.
Install it on your phone the same way as the Hub's APKs.

If the build fails, copy the last ~50 lines of the Terminal output and send
them to Claude.

---

## Part C — Tests on the phone

Tick them off as you go.

**C1. First start**
- [ ] The app is called **KLV Signer** and opens on a dark screen with a yellow
      **TESTNET · practice network** label and two buttons.

**C2. Creating a wallet: the recovery phrase**
- [ ] Tap **Create a new wallet**. You see 24 numbered words.
- [ ] Try to take a screenshot. It should be blocked (black image, or a
      "can't take screenshot" message).
- [ ] Open the phone's "recent apps" view. The Signer's preview should be
      blank, not showing the words.
- [ ] **Continue** is greyed out until you tick "I have written all 24 words down".
- [ ] Write the words on paper (this is a test wallet, but practise doing it properly).

**C3. Checking the paper**
- [ ] You're asked for 3 words by number. Type one wrong on purpose → a red
      "doesn't match" message.
- [ ] Type all three correctly → you move on to the password screen.

**C4. Choosing the password**
- [ ] Type fewer than 8 characters → a message asks for at least 8.
- [ ] Type two different passwords → "don't match yet".
- [ ] Type a proper password twice and tap **Save and lock my wallet** →
      a spinner for a moment, then the **Your wallet** screen with your
      `klv1…` address.
- [ ] 📝 **Please note down the "Test info" line** (how many seconds, which
      engine). Claude needs it to tune the speed.

**C5. Locking and unlocking**
- [ ] Tap **Lock now** → the Unlock screen.
- [ ] Enter the right password → back to your wallet. 📝 Note the Test info
      line again.
- [ ] Lock again, then enter a wrong password **5 times**. After the 5th you
      should see "try again in 30 s" counting down, and the Unlock button
      greyed out.
- [ ] While it's counting down, close the Signer completely (swipe it away
      in recent apps) and reopen it. The waiting time should still be there.
- [ ] After the wait, the right password unlocks it again.

**C6. Automatic locking**
- [ ] While unlocked, switch to another app (or press the home button), then
      come back → the Signer should be locked again.

**C7. Does the wallet match Klever's own app?** (optional, but very valuable)
- [ ] In the **Klever Wallet** app, import/restore a wallet using the same
      24 test words.
- [ ] The Klever address shown there should be **exactly** the same `klv1…`
      address as in the Signer. If it isn't, tell Claude before going further.

**C8. "I forgot my password" and restoring**
- [ ] Lock the Signer. On the Unlock screen, tap **I forgot my password**.
- [ ] The **Remove wallet** button stays greyed out until you type `REMOVE`.
- [ ] Type `REMOVE` and tap the button → you're back on the first screen.
- [ ] Tap **Restore a wallet from its recovery phrase** and type your 24 words.
      Try one wrong word first → it should say the words aren't valid.
- [ ] With the right words, it shows an address. It must be the **same**
      address as before. Continue, choose a new password → your wallet again.

---

## Good to know

- **Uninstalling the Signer deletes the wallet from the phone** (Android
  deletes an app's saved data with it). Your recovery phrase brings it back.
  Updating by installing a newer APK over the old one keeps the wallet.
- If Test info says **backup (JavaScript)** instead of **fast (native)**, the
  app still works correctly, just slower. Tell Claude, because it means the
  fast engine didn't load.
