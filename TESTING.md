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
- [x] The app is called **KLV Signer** and opens on a dark screen with a yellow
      **TESTNET · practice network** label and two buttons.

**C2. Creating a wallet: the recovery phrase**
- [x] Tap **Create a new wallet**. You see 24 numbered words.
- [x] Try to take a screenshot. It should be blocked (black image, or a
      "can't take screenshot" message).
- [x] Open the phone's **app switcher** ("Recents", the view of open apps as
      cards). With gesture navigation: swipe up from the very bottom edge and
      hold a moment. With three buttons: tap the square button (on some
      Samsungs: three vertical lines). The Signer's card should be blank or
      black, not showing the words.
- [x] **Continue** is greyed out until you tick "I have written all 24 words down".
- [x] Write the words on paper (this is a test wallet, but practise doing it properly).

**C3. Checking the paper**
- [x] You're asked for 3 words by number. Type one wrong on purpose → a red
      "doesn't match" message.
- [x] Type all three correctly → you move on to the password screen.

**C4. Choosing the password**
- [ ] Type fewer than 8 characters → a message asks for at least 8.
- [x] Type two different passwords → "don't match yet".
- [x] Type a proper password twice and tap **Save and lock my wallet** →
      a spinner for a moment, then the **Your wallet** screen with your
      `klv1…` address.
- [x] 📝 **Please note down the "Test info" line** (how many seconds, which
      engine). Claude needs it to tune the speed. (Test info:the last password check took 0.2 s using the fast (native) engine.

**C5. Locking and unlocking**
- [x] Tap **Lock now** → the Unlock screen.
- [x] Enter the right password → back to your wallet. 📝 Note the Test info
      line again. Same, but 0.1 s
- [x] Lock again, then enter a wrong password **5 times**. After the 5th you
      should see "try again in 30 s" counting down, and the Unlock button
      greyed out.
- [x] While it's counting down, close the Signer completely (swipe its card away
      in the app switcher) and reopen it. The waiting time should still be there.
- [x] After the wait, the right password unlocks it again.

**C6. Automatic locking**
- [x] While unlocked, switch to another app (or press the home button), then
      come back → the Signer should be locked again.

**C7. Does the wallet match Klever's own recipe?** (very valuable)

In the Klever Wallet *phone app*, a recovery phrase can only be entered when
setting the app up from scratch ("Restore Wallet"), because the phrase *is*
the whole wallet there. **Don't reset your Klever Wallet app for this test.**
(Importing a private key instead wouldn't help. It skips exactly the step
we want to check: phrase → key.) Use the **Klever Extension** in a separate
Chrome profile instead, so nothing of yours is touched:

- [ ] In Chrome: profile icon (top right) → **Add** → continue without an
      account. A new, empty Chrome window opens.
- [ ] In that window, install the **Klever Extension** from the Chrome Web Store.
- [ ] Open it and choose **Restore wallet** (not "Create"). Enter the 24 test
      words, set any password.
- [ ] Switch it to **KleverChain (KLV)** if needed and look at the address.
      It should be **exactly** the same `klv1…` address as in the Signer. If
      it isn't, tell Claude before going further.
- [ ] Afterwards you can delete that Chrome profile (profile icon → manage
      profiles → ⋮ → Delete).

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
