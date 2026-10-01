# TESTING.md — how to build the Signer and test it on your phone

This guide covers **Stage 1: wallet + password** (Parts A–C),
**Stage 2: reading and signing** (Part D) **Stage 3: other apps asking** (Part E) and **Stage 4: safety polish** (Part F, growing). Follow the parts in order.
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

At the end you should see `# fail 0` (the `# pass` number grows over time:
103 on 1 Oct 2026). These check the
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
- [x] Type fewer than 8 characters → a message asks for at least 8.
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

- [x] In Chrome: profile icon (top right) → **Add** → continue without an
      account. A new, empty Chrome window opens.
- [x] In that window, install the **Klever Extension** from the Chrome Web Store.
- [x] Open it and choose **Restore wallet** (not "Create"). Enter the 24 test
      words, set any password.
- [x] Switch it to **KleverChain (KLV)** if needed and look at the address.
      It should be **exactly** the same `klv1…` address as in the Signer. If
      it isn't, tell Claude before going further.
      ✅ 2026-09-29: Klever Extension showed exactly the same address.
- [x] Afterwards you can delete that Chrome profile (profile icon → manage
      profiles → ⋮ → Delete).

**C8. "I forgot my password" and restoring**
- [x] Lock the Signer. On the Unlock screen, tap **I forgot my password**.
- [x] The **Remove wallet** button stays greyed out until you type `REMOVE`.
- [x] Type `REMOVE` and tap the button → you're back on the first screen.
- [x] Tap **Restore a wallet from its recovery phrase**. You see 24 numbered
      boxes (and a 12 / 24 words choice).
- [x] Type a word, then a space → the cursor jumps to the next box.
- [x] Type a made-up word (e.g. `bitcoin`) and move to another box → that box
      turns red.
- [x] Fill in your 24 words and tap **Check the words**. It shows an address,
      which must be the **same** address as before.
- [x] Continue to the password screen. **This is where C4 happens**: try fewer
      than 8 characters first, then **Show**/**Hide**, then set the new password
      → your wallet again.

**Result 2026-09-29: all Stage 1 tests passed.** Password checks always ran on the
fast (native) engine, 0.1–0.2 s each.

---

## Part D — Stage 2 tests: reading and signing a transaction

Stage 2 adds "Sign a test transaction" to the Home screen. You paste an
unsigned transaction, the Signer explains it, you approve with your password,
and it signs. Two helper tools on your Mac make the test transactions and send
the signed ones to the Klever **testnet**.

**D0. Before you start (once)**
- [x] Build and install the new version (Part A1, A2, then Part B; install
      with `adb install -r` so your test wallet stays). `npm test` should now
      show `# pass 43`.
- [x] Get free test KLV: in the Chrome profile where you restored your test
      wallet in the Klever Extension, open **testnet.kleverscan.org**, open
      your wallet's page (your `klv1…` address), and use the **faucet**
      button there. After a minute, the page should show a KLV balance.
- [x] Have a second address to send to. Any `klv1…` address works on testnet,
      e.g. create a second account in the Klever Extension.

**D1. Make a test transaction (on your Mac, in the `app` folder)**
```
npm run make-test-tx -- --from klv1txy66kqkznnycv3gv8w9uu9tpue7kjj089kcgm5yz4mhmwkyv6rsqhclaa --to klv1zekp46888zwrde9s8sxfx756kwk4680qhspr9fkpjra50mhe0gvskqruag --amount 0.5
```
- [x] It prints what the Signer should show (amount, receiver, fee, number,
      fingerprint) and a long transaction code.
- [x] With the phone connected by USB: open the Signer → unlock → **Sign a
      test transaction** → tap the text box. Then press Enter in Terminal. The
      code is typed into the phone for you. (Without the cable: email the
      code to yourself and paste it.)

**D2. Reading it**
- [x] Tap **Read transaction**. The approval screen shows **"Requested by:
      You (pasted by hand)"**, the network **Testnet (practice network)**,
      **Send 0.5 KLV**, the receiver's full address, the fee, and a
      fingerprint.
- [x] Compare them with what Terminal printed. Everything must match
      (especially the fingerprint).

**D3. Wrong password and Reject**
- [x] Type a wrong password and tap **Approve and sign** → "Wrong password.",
      nothing signed. (It counts towards the same waiting times as the lock
      screen.)
- [x] Tap **Reject** → back to the Home screen, nothing signed.

_29 Sep 2026: D0–D3 passed._

**D4. Signing and sending**
- [x] Make a new code (D1), read it (D2), type your right password and tap
      **Approve and sign** → **Signed ✓** with a long signed code.
- [x] Tap **Share…** and send the code to your Mac (e.g. email to yourself).
- [x] On the Mac: `npm run send-signed-tx -- <the signed code>`
      It should say **Signature ✔ valid** and **✔ Sent!**, with a link.
- [x] Open the link: after a few seconds the explorer shows the transfer as
      successful, and the receiver has the KLV. 🎉 This proves the whole chain
      works: the Signer's reading, fingerprint and signature are exactly what
      the Klever network expects. (checked the account itself on testnet, it received 0.5 klv)

**D5. The Signer refuses what it shouldn't sign**
- [x] Paste some nonsense (e.g. `hello`) → a plain-words explanation, no approval screen.
- [x] Make a transaction **from a different address** than your test wallet:
      `npm run make-test-tx -- --from <receiver address> --to <your test address> --amount 0.1`
      → the Signer says it's "not from the wallet in this Signer".
- [x] Leave the Signer while the approval screen is open (switch to another
      app and back) → it's locked, and the transaction is forgotten.

_30 Sep 2026: D4–D5 passed. The first real testnet transfer (0.5 KLV) arrived._

**D6. Optional: an NFT transfer** (only if your test wallet owns a testnet NFT)
```
npm run make-test-tx -- --from <your test address> --to <receiver> --nft <COLLECTION/NUMBER>
```
- [ ] The approval screen shows **NFT <collection> #<number>**.

---

## Part E — Stage 3 tests: another app asks the Signer

Now the Hub asks the Signer directly. No more pasting codes.

**E0. Build and install both apps**
- [x] **Signer**: in `KLV Signer App/app`: `npm install`, then `npm test`
      (should say `# pass 49`), then build as usual and install with
      `adb install -r`. This build compiles the Signer's new native
      Android part for the first time. If it fails, send Claude the last
      ~50 lines.
- [x] **Hub**: in `Devikins Legacy Hub/app`: `npm install`, then build the
      Hub as usual and install with `adb install -r` (your wallets and NFTs
      stay). The Hub is now version **4.1.0**.

**E1. Connecting the Hub**
- [x] In the Hub: ☰ menu → **KLV Signer (test)** → **Connect KLV Signer**.
- [x] The Signer opens with **"Allow this app?"**, showing the name **DLH**
      and the app id **com.raphaelrohner.devikinslegacyhub**.
- [x] Tap **Allow** → you're back in the Hub, which now shows your Signer
      wallet's address and its testnet balance.
- [x] In the Signer (open it normally, unlock): the Home screen lists **DLH**
      under **Connected apps**.

**E2. Sending from the Hub**
- [x] In the Hub's KLV Signer screen: enter your second test address as
      receiver (or **Scan** its QR code) and **0.3** as amount → **Send with
      KLV Signer**.
- [x] The Signer opens the approval screen: **Requested by DLH**
      (com.raphaelrohner.devikinslegacyhub), **Send 0.3 KLV**, the receiver's
      full address, Testnet.
- [x] Enter your Signer password → **Approve and sign** → you land back in
      the Hub, which shows **✔ Sent to the testnet** and a link.
- [x] **View on Kleverscan** shows the transfer as successful; after a few
      seconds **Refresh balance** shows the lower balance.

**E3. Saying no**
- [x] Send again, but tap **Reject** in the Signer → back in the Hub:
      "Cancelled in the KLV Signer - nothing was sent."
- [x] Send again, and while the Signer's approval screen is open, switch
      back to the Hub with the app switcher (without deciding) → the Hub
      says it was cancelled. Opening the Signer afterwards shows the lock
      screen, not the old request.

**E4. Removing the connection**
- [x] In the Signer's Home screen, tap **Remove** next to DLH.
- [x] In the Hub, tap **Reconnect** → the Signer asks "Allow this app?" again.
      Tap **Don't allow** → the Hub shows "You did not allow this app to use
      the Signer."
- [x] Reconnect once more and **Allow**, so the Hub is connected for later.

**Result 30 Sep 2026: all Stage 3 tests passed.** The Hub connected, sent 0.5 + 0.3 KLV
through the Signer, and the second wallet received 0.8 test KLV.

---

## Part F — Stage 4 tests: phone safety, overlays, keyboard, Android 12

**F0. Build and install**
- [x] In `KLV Signer App/app`: `npm install`, `npm test` (should say `# pass 92`),
      build, `adb install -r`. This build compiles the new native safety checks.

**F1. A normal phone shows no warning**
- [x] Open the Signer. Your usual (not rooted, locked bootloader, with screen
      lock) phone shows **no** "This phone may not be safe" box on Home.

**F2. The screen-lock warning** (keep your recovery words at hand, just in case)
- [x] In Android's Settings, temporarily remove your screen lock.
- [x] Go back to the Signer (no restart needed) → the **Unlock screen**, before
      you type the password, shows **"This phone may not be safe for a wallet ·
      No screen lock is set"** with an explanation. Home shows it again after unlocking.
- [x] Send a test from the Hub → the approval screen shows the short warning
      line at the top. (Reject it.)
- [x] Set your screen lock again and go back to the Signer → the warning is gone.

**F3. Android version**
- [ ] Nothing to see on your phone (it's newer than Android 12). Phones older
      than Android 12 can't install the Signer anymore.

**F4. Overlays are hidden** (only if you use something that floats over other
apps, e.g. Messenger chat heads, a screen-dimmer or a floating-button app)
- [ ] With the floating thing showing, open the Signer → it disappears while
      the Signer is on screen, and comes back when you switch away.
- [ ] Everything in the Signer still reacts normally to taps.
- [ ] No floating app at hand? Ask Android instead (phone plugged in):
      `~/Library/Android/sdk/platform-tools/adb shell dumpsys package com.raphaelrohner.klvsigner | grep HIDE_OVERLAY`
      → `HIDE_OVERLAY_WINDOWS: granted=true`. Then, with the Signer open:
      `~/Library/Android/sdk/platform-tools/adb shell dumpsys window windows | grep -o "HIDE_NON_SYSTEM_OVERLAY_WINDOWS" | head -1`
      → prints `HIDE_NON_SYSTEM_OVERLAY_WINDOWS`. (Passed 30 Sep 2026. Note:
      the Twilight app crashed on this phone for its own reasons, so it
      couldn't be used for the visual test.)

**F5. Keyboard warning** (optional: only if you want to try another keyboard)
- [x] With your normal keyboard (Gboard, Samsung or SwiftKey), there's no
      keyboard warning.
- [x] Optional: install another keyboard from the Play Store, make it the
      active one, go back to the Signer → **"You're typing with …"** warning
      naming it. Switch back to your normal keyboard → warning gone. (checked with Typewise)

**F6. Accessibility warning** (optional)
- [x] If an app you installed has accessibility access switched on (some
      password managers, "button mapper" or "auto clicker" apps do), the
      Signer names it in an **"… can read and control the screen"** warning.
      Apps that came with the phone (like TalkBack) are not listed.
      (Passed 30 Sep 2026 with Button Mapper: warning shown while its access
      was on, gone after switching it off.)

**F7. Signing switched off on a rooted phone**
- [ ] Can't be tried on your normal phone (it isn't rooted). The automated
      tests check the rules. What you'd see: a red **"Signing is switched off
      on this phone"** box; "Sign a test transaction" greyed out; the approval
      screen shows the transaction but only **Reject**; apps asking to sign
      get the error `UNSAFE_DEVICE`, while asking for the address still works.
- [ ] Nothing changed for you: sending 0.1 KLV from the Hub still asks for
      approval and signs as before. (Passed 30 Sep 2026: 0.6 KLV sent from
      the Hub, signed and confirmed.)

**F8. Fingerprint or face (optional shortcut)**
- [x] Home → **Fingerprint or face** says "Off" (or, if your phone has no
      fingerprint set up, that only the password can be used).
- [x] Tap **Switch on**, type your password, tap **Continue** → Android's
      fingerprint prompt appears → touch the sensor → it now says **On**.
- [x] Wrong password there → "Wrong password." and it stays off (and it
      counts as a wrong try, like on the lock screen).
- [x] **Lock now** → the Unlock screen shows **Unlock with fingerprint or
      face** above the password box → use it → you're in. Home says
      "Unlocked with fingerprint or face." The password box still works too.
- [x] Cancel Android's prompt → nothing happens, no error; the password still works.
- [x] Send a test from the Hub → the approval screen shows **Approve with
      fingerprint or face**; Android's prompt names the amount ("Sign: send
      0.1 KLV") → touch the sensor → signed, back in the Hub.
- [x] Restart the phone, open the Signer → no fingerprint button, instead a
      note that the phone was restarted → unlock with the password → the
      next time, the fingerprint button is back.
- [x] Optional: add a new fingerprint in Android's settings, go back to the
      Signer, try the fingerprint button → it says fingerprint/face was
      switched off because the phone's fingerprints changed; the password
      works; you can switch it on again on Home. (Delete the extra
      fingerprint afterwards if you like.)
- [x] **Switch off** on Home → the fingerprint buttons are gone.
- Passed 30 Sep 2026 with fingerprint (face unlock not tried; it only
  appears if the phone's face unlock counts as "strong").

**F9. Change password**
- [x] Home → **Change password**. Type a wrong current password → "Wrong
      password." (it counts like on the lock screen).
- [x] New password shorter than the minimum, or the same as the current
      one, or the two new boxes different → the button stays grey, with a hint.
- [x] Right current password + a new one twice → **Change password** →
      back on Home with "Password changed…". If fingerprint was on, the
      message says it was switched off.
- [x] **Lock now** → the OLD password is refused, the NEW one unlocks.
      The address on Home is the same as before.
- [x] Send a test from the Hub → approve with the new password → signed.
- [x] Switch fingerprint on again with the new password → it works.
- Passed 30 Sep 2026 (0.4 KLV sent from the Hub with the new password, arrived).

**F10. Stronger passwords**
- [x] Home → **Change password**: a new password under 12 characters → the
      box asks for at least 12, the button stays grey.
- [x] Type `password12345` as the new password → **Strength: Weak** (a very
      common word). Try `maple tunnel orbit ginger` → **Strength: Strong**.
      Something in between, like `violinrocket7` → **Fair** with a tip.
      (No need to actually change it; tap **Back**.)
- [x] The upgrade of your existing wallet (made with the old, lighter
      setting): switch **Fingerprint or face** OFF on Home (it's skipped while
      that's on) → **Lock now** → unlock with your password (this one unlock
      takes a little longer) → **Lock now** again → unlock with the password
      again → Home's test info now shows a longer check time than before
      (about 4×, e.g. 0.5 s instead of 0.15 s). That's the stronger setting.
      (Measured 30 Sep 2026: 0.2 s before the upgrade, 0.5 s after, fast engine.)
- [x] Switch fingerprint on again → it works.
- [x] Send a test from the Hub → approve → signed.

- Passed 30 Sep 2026 (after the upgrade: fingerprint switched on again,
  0.9 KLV sent from the Hub with fingerprint approval, arrived).

**F11. No internet**
- [x] After installing, with the phone plugged in:
      `~/Library/Android/sdk/platform-tools/adb shell dumpsys package com.raphaelrohner.klvsigner | grep -E "INTERNET|SYSTEM_ALERT|STORAGE|VIBRATE"`
      → prints **nothing** (the Signer has none of these permissions).
- [x] Android's Settings → Apps → KLV Signer → Permissions / "Mobile data &
      Wi-Fi": no internet or data usage listed.
- [x] Everything still works: unlock (password and fingerprint), and send a
      test from the Hub → approve → signed. (The Hub does the internet part.)
- [x] No red "This copy of the Signer can use the internet" box anywhere.
- Passed 30 Sep 2026 (password and fingerprint unlock, Hub test signed and arrived).

**F12. Extra confirmation**
- [x] Home → **Extra confirmation settings**: the recommended rules are on
      (new receivers, an app's first request, several transfers, many
      requests quickly). Switch on **Large amounts** and set **1** KLV. Tap
      **Save** → "Saved." (stricter: no password asked).
- [x] Send 0.1 KLV from the Hub to the usual address. The FIRST time after
      installing this version it needs the extra confirmation anyway: the
      Signer only starts remembering receivers and apps now, so the address
      and the Hub both count as new (the yellow box says so). Type the ending
      + password.
- [x] Send 0.1 KLV to the same address again → now normal approval
      (fingerprint offered): the address and the Hub are known, 0.1 is below 1.
- [x] Send 2 KLV → the approval screen says **Extra confirmation needed**
      ("more than your 1 KLV setting"), no fingerprint button, a box for the
      **last 6 characters** of the address. Type a wrong ending → a hint;
      the right one + password → signed.
- (30 Sep 2026: the steps above passed — first transfer extra, second
  normal with fingerprint, 2 KLV extra with ending + password. Continue here.)
- [x] Settings: choose **Wait 10 s**, save, send 2 KLV again → the button
      counts down "Approve possible in 10 s".
      (Passed 1 Oct 2026 with 30 s. The countdown is on the Approve button at
      the bottom: scroll down to see it.)
- [x] Settings: switch **Large amounts** off → a note says it needs your
      password; wrong password → refused; right password → saved.
      (Passed 1 Oct 2026.)
- [x] Settings: add your own receiving test address as a **trusted
      receiver** (needs the password) → sending 2 KLV to it is normal again.
      (Passed 1 Oct 2026: approved with fingerprint.)
- [x] Optional: send to an address you've never used → "never sent to … before".
- [x] Amount box: type `1,000` (or `1.000`) → "can be read two ways", with
      buttons **1 KLV** and **1000 KLV**; Save stays grey until you pick one.
      `12,5` → "= 12.5 KLV" (clear, no question).
- F12 passed completely on 1 Oct 2026.

**F13. After the second review (fixes from REVIEW-2026-10.md)**

No `npm install` needed. Build and install the new APK as usual.

- [x] Everyday use still works: unlock with fingerprint, send 0.1 KLV from
      the Hub to the usual address → approve with fingerprint → signed, and it
      arrives. (This also checks that the Hub still finds the Signer: the
      Signer now only accepts requests addressed to it by exact name.)
- [x] On the approval screen, the receiver address is shown in groups of
      4 characters (`klv1 abcd efgh …`).
- [x] Changing the phone's clock doesn't skip a wait: **Lock now** → type a
      wrong password 5 times → "try again in 30 s". Leave the Signer, Android
      Settings → Date & time → switch **automatic** off and set the time 1 hour
      later → back to the Signer → still waiting (about the same seconds as
      before, not zero). Then switch **automatic** time on again, and unlock
      with the right password once the wait is over.
- [x] **Show** on a password box: the letters appear, and the keyboard
      shows no word suggestions while they're visible (on some keyboards it
      looks slightly different, e.g. no suggestion bar).
- [x] Network fee in the amount rule: Settings → **Large amounts** on, **1**
      KLV, Save. Send **0.9999** KLV from the Hub to an address that is
      **not** a trusted receiver (trusted ones skip this rule). The fee is
      tiny (about 0.00025 KLV), but 0.9999 + fee is just over 1 → the
      yellow box says "… KLV (network fee included), more than your 1 KLV
      setting". Reject it. Then set Large amounts back as you like.
- [x] Leaving mid-request: start a send from the Hub, and when the approval
      screen shows, press the phone's Home button. Open the Hub again → it
      says you left without deciding (nothing signed). Open the Signer → it's
      locked or on the Unlock screen, not on the old approval.
- F13 passed on 1 Oct 2026. Found and fixed on the way: the "try again in …"
  countdown (and some other yellow boxes) showed no text.


**F14. The new look (1 Oct 2026)**

**Needs `npm install` once** (new package: `qrcode-generator`, for the QR code).
Then build and install as usual.

- [x] **App icon:** on the phone's home screen and app list, the Signer has the
      new teal seal icon ("KLV SIGNER" around a check mark), filling most of
      the icon, the lettering clear of both rings. Nothing cut off.
- [x] **Unlock:** the seal at the top, "Unlock KLV Signer", your short address,
      fingerprint button, password box, and a small "Forgot your password?"
      link at the bottom (tapping it shows the remove-wallet steps).
- [x] **Home:** address in little boxes (`klv1`, then 4, then boxes of 6), **Copy or share**
      opens Android's share sheet (tap "Copy" there, paste it somewhere to
      check), a green
      "Ready to sign" box, your connected apps with "Last signature …", and
      **Lock now** at the bottom. No test tools, no settings buttons any more.
- [x] **QR code:** Home → **Show QR code** → a black-and-white code. Scan it
      with another phone's camera or the Klever app → it reads your klv1…
      address exactly. **Done** goes back.
- [x] **Settings** (button top right on Home): sections Unlocking, Signing,
      Connected apps, This phone, About, Danger zone. Check:
      - Fingerprint switch off → on (asks password, then fingerprint) → off.
      - Change password opens; Back returns to Settings.
      - Extra confirmation shows a summary (e.g. "6 rules on · over 1 KLV")
        and opens the rules screen; Back returns to Settings.
      - About shows version 0.1.0 and the signing key 82:D0:9D…86:11.
      - "Sign a test transaction" still opens the paste screen.
- [x] **Extra confirmation screen:** the amount box is visible even when
      "Large amounts" is off (greyed); switching it on makes it usable. The wait
      is three buttons (No wait / 10 s / 30 s).
- [x] **Saving there:** change anything → a bar fixed at the bottom says
      "Unsaved changes" with **Save** (it stays put while you scroll).
      - Stricter change (e.g. NFTs on) → Save → "Saved." at the top.
      - Less strict (e.g. NFTs off) → Save → the bar opens: warning +
        password box + Cancel / Save. Wrong password → refused; right → saved.
      - Change something, then tap Back (top left) or the phone's back
        button → "Save your changes before leaving?" with Discard / Keep
        editing / Save. Each does what it says.
- [x] **Approve:** from the Hub, send to a new address → the requesting app
      at the top with a TESTNET badge, big amount, address in groups with the
      address in boxes (`klv1`, 4, then boxes of 6) and the **last box
      outlined in teal** (exactly the 6 characters to type), fee and transaction number side
      by side, Reject and Approve side by side. Approve works.
- [x] The phone's **back button**: from Settings → Home; from the rules or
      change-password screen → Settings.
- [x] **No autofill, no learning:** typing a password anywhere in the Signer
      shows no keyboard suggestions, no autofill and no "Save password?"
      prompt; **Show** displays the password under the box. (Passed 1 Oct 2026
      after three rounds: per-box settings, the whole window, and finally
      ending any autofill session on every keystroke and screen change.)
- [x] **Locking:** open Settings, press the phone's Home button, open the
      Signer again → it's locked (Unlock screen). Same from the QR screen.
- [x] **Copy or share** on Home → pick "Copy" → the Signer is locked when
      you come back (on purpose: leaving it always locks).
- F14 passed completely on 1 Oct 2026.

---

## Good to know

- **Uninstalling the Signer deletes the wallet from the phone** (Android
  deletes an app's saved data with it). Your recovery phrase brings it back.
  Updating by installing a newer APK over the old one keeps the wallet.
- If Test info says **backup (JavaScript)** instead of **fast (native)**, the
  app still works correctly, just slower. Tell Claude, because it means the
  fast engine didn't load.
