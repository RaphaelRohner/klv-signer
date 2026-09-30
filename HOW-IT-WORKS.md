# HOW-IT-WORKS.md — a plain-English tour of the KLV Signer

This guide explains what the Signer app does and how it's put together. No
programming knowledge is needed to read it. Words in **bold** are explained
in the glossary at the end.

---

## 1. The problem we're solving

Many Android apps want to do things on the Klever chain: send tokens or NFTs,
trade on a marketplace, play a game. *Looking* at the chain only needs a
wallet's **address**, which is public, like an email address. *Doing*
something needs the wallet's **private key**, and whoever holds the private
key controls everything in that wallet.

On a computer, Klever solves this with its browser extension: websites ask
the extension to sign, and the key stays inside it. **On Android there's no
such option.** The Klever Wallet app doesn't let other apps ask it to sign
Klever transactions. So every Android app that wants to act on the Klever
chain would have to hold your key itself, and every one of them would be a
place it could leak from.

The Signer fills that gap. It's a small, boring app that does just one job:
it holds the key, and **any developer can call it from their own Android
app** (we call those **client apps**) to get a transaction signed. The
Signer shows you what's being asked, and only signs if you say yes.

The **Devikins Legacy Hub** is the first client app and our test partner,
but nothing in the Signer is specific to it.

---

## 2. The apps and the wall between them

Android keeps every app in its own locked room, called a **sandbox**. One app
can't look inside another app's room. That's a rule built into the phone, not
something we have to program.

```
   ┌────────── ANY CLIENT APP ──────────┐   ┊   ┌──────────── SIGNER APP ────────────┐
   │ e.g. Devikins Legacy Hub, a game,  │   ┊   │ • holds the private key (scrambled)│
   │ a marketplace…                     │   ┊   │ • knows which app is asking        │
   │ • builds "please send X to Y"      │   ┊   │ • shows you what you're approving  │
   │ • sends finished jobs to Klever    │   ┊   │ • asks for your app password       │
   │ • never sees the key               │   ┊   │ • hands back a signature, never    │
   │                                    │   ┊   │   the key                          │
   └────────────────────────────────────┘   ┊   └────────────────────────────────────┘
                                  the wall between the sandboxes
```

Only **two things** ever cross that wall:

1. **Going right →** an unsigned request ("send Devikin #4821 to klv1abc…").
2. **Coming back ←** either a **signature** (you said yes) or "rejected" (you said no).

The private key never crosses. That's the whole idea of the design.

---

## 3. How an app talks to the Signer

Android has a built-in way for one app to **ask another app for a result**:
the first app opens the second, the second does its job, and Android hands
the answer straight back to the first app. (Developers call it
"start activity for result". Expo apps can use it through the standard
`expo-intent-launcher` module, with no special code.)

We use this instead of web-style links in both directions, because Android
itself provides two guarantees:

- **The Signer knows for certain which app is asking.** Android tells it the
  asking app's official ID (like `com.raphaelrohner.devikinslegacyhub`), and
  the asking app can't fake that.
- **The answer goes back only to the app that asked.** No other app can
  catch it on the way.

Other developers will get a short, public description of how to ask the
Signer (the **Signer protocol**), so they can add "Sign with KLV Signer" to
their own apps.

---

## 4. The journey of one signature, step by step

**Step 1 — The client app builds the request.** For example you tap "Send"
on a Devikin in the Hub and enter the receiver's address. The app asks the
Klever network to prepare the transaction. Klever sends it back, unsigned.
It's like a filled-in form waiting for a signature.

**The handoff →** The app asks Android to open the Signer and passes along
the unsigned form. Android also tells the Signer which app is asking.

**Step 2 — First time only: "Allow this app?"** If this app has never asked
before, the Signer shows its name and official ID and asks whether you want
to allow it to send you signing requests. Your answer is remembered, and you
can change it later in the Signer's settings. Unknown apps can't even get as
far as the approval screen without your OK.

**Step 3 — The Signer shows you what you're approving.** This is the most
important safety rule in the app: **the Signer reads the form itself.** It
doesn't trust any description the app attaches. It shows you in plain words:
- **which app** is asking,
- what is being sent (e.g. Devikin #4821 from the DVKNFT-1SW5 collection),
- to which address,
- the network fee,
- which network (testnet or mainnet).

If anything looks wrong, you tap **Reject** and nothing happens.

**Step 4 — You unlock with your app password.** (See section 6 for why this
is a real lock and not just a door guard.)

**Step 5 — The Signer signs.** For a split second, the Signer unscrambles the
key in its memory, uses it to make a signature, and then forgets it again.
The signature is proof that the owner said yes to *this exact* transaction.
It can't be reused for anything else and it doesn't reveal the key.

**The handoff ←** Android hands the signature (or "rejected") straight back
to the app that asked.

**Step 6 — The app sends it to Klever.** The client app attaches the
signature to the form and sends it to the Klever network, which checks the
signature and carries out the transaction.

---

## 5. The parts of the Signer app

| Part | What it does, in plain words | Status |
|---|---|---|
| **Wallet setup** | Create a brand-new wallet (the Signer shows you its 24-word recovery phrase **once**, checks you wrote it down, and never stores it) or restore one from its recovery phrase, one box per word. Klever's own official code does the wallet maths, so the same words give the same address as in Klever's own apps. You also choose your app password here. | ✅ Stage 1 |
| **The vault** | Scrambles the key with your password and stores the scrambled result on the phone. Unscrambles it only for the moment of signing. | ✅ Stage 1 |
| **The lock screen** | Asks for your password (with Show/Hide). The first 4 wrong tries in a row are free, then you wait 30 s, 1 min, 2 min… up to 1 hour, even if you close the app. "I forgot my password" removes the wallet from the phone so you can restore it with a new password. The Signer also locks itself whenever you leave it. | ✅ Stage 1 |
| **The request reader** | Unpacks the transaction and checks it: is it well-formed and written the standard way? Does it contain anything the Signer doesn't understand (then it refuses)? Is it from *our* wallet? For the right network? A kind of transaction we allow? It uses its own strict reader built from the Klever node's official definitions, because Klever's JavaScript library reads transfers wrongly (amount and token swapped). | ✅ Stage 2 |
| **The approval screen** | Shows who's asking and the request in plain words (amount, full receiver address, fee, any note, fingerprint), asks for your password, with **Approve and sign** and **Reject**. | ✅ Stage 2 |
| **The signer** | Does the actual maths (the **signature**) with the key, then double-checks the signature before handing it out. | ✅ Stage 2 |
| **Connected apps** | "Allow this app?" the first time an app asks, showing its name, id and certificate fingerprint. Remembers allowed apps by id AND certificate (a fake copy with the same id gets a warning), lists them on the Home screen with Remove. | ✅ Stage 3 |
| **The reply** | Hands the signature (or "rejected", with the reason) back to the asking app through Android, then steps aside so you land back in that app. Leaving the Signer without deciding counts as "rejected". | ✅ Stage 3 |
| **Settings** | Your wallet address, connected apps, change password, remove wallet. | Stages 3–4 |

### What the Signer deliberately does NOT do

- **It never shows or exports the private key.** There is no "copy key"
  button. If you need the wallet elsewhere, use your recovery phrase.
- **It doesn't talk to the internet** for its job. Everything it needs arrives
  with the request. (We'll check whether we can remove its internet
  permission completely in the final version. That would mean it *can't*
  leak anything online, even by mistake.)
- **It only signs transaction types it understands.** If the Signer can't
  explain a transaction to you in plain words, it refuses to sign it. We start
  with plain transfers (KLV, tokens, NFTs) and add other types one at a time,
  each with its own plain-words display and tests.
- **It doesn't get backed up to the cloud** (Android's app backup is switched
  off for the Signer).

---

## 6. How your password protects the key

You chose **a separate app password.** Here's what happens behind the scenes.

**When you set up the wallet:**
1. You type your password.
2. The Signer runs it through a deliberately *slow* scrambling recipe
   (called **key stretching**; the recipe is named *scrypt*). For an attacker
   trying millions of guesses, the cost of each guess adds up to years.
   The Signer has two engines for this recipe, which give identical results:
   a **fast** one that uses the phone's built-in crypto code, and a slower
   **backup** one written in plain JavaScript, used automatically if the fast
   one ever fails to load. On your phone the fast one takes 0.1–0.2 s, so
   there's room to make it heavier (planned for Stage 4).
3. The result is used to **encrypt** (scramble) the private key. We use a
   standard, well-tested method called AES-GCM, which also detects if the
   stored data was tampered with.
4. Only the scrambled key is saved. It's kept in Android's own secure storage
   (the **Keystore**), which adds a second lock on top of ours.
   **Your password itself is never saved anywhere.**

**When you sign:**
1. You type your password.
2. The Signer repeats the same slow recipe and tries to unscramble the key.
3. Right password → the key comes out, is used once, and is wiped from memory.
   Wrong password → unscrambling fails, and the wrong-attempt counter goes up.

**What this means for you:**
- Choose a password you'll remember, but that isn't used anywhere else.
  A short phrase of 3–4 random words works well.
- **If you forget the password, the Signer can't recover it** (nobody can,
  that's the point). You'd remove the wallet from the Signer and set it up
  again from your **recovery phrase**. So keep the recovery phrase written on
  paper, somewhere safe and offline.

---

## 7. What a client app has to do

Using the Devikins Legacy Hub as the example (it doesn't do any of this yet):

| Piece | What it does |
|---|---|
| A "Send" (or "Buy", "Sign in"…) button | Starts the action, e.g. on an NFT's detail screen. |
| A transaction helper | Asks Klever to prepare the unsigned transaction, and later sends the signed one. |
| The request to the Signer | Asks Android to open the Signer with the unsigned transaction (with `expo-intent-launcher` in an Expo app), then waits for the answer. |
| Handling the answer | Signature → send to Klever. "Rejected" → tell the user nothing happened. Signer not installed → explain where to get it. |

The exact request and answer formats will be written down in
**SIGNER-PROTOCOL.md** (Stage 3), so any developer can follow them.

---

## 8. Testnet first

Klever runs a practice copy of its network called the **testnet**. It works
the same way, but its coins and NFTs have no real value. We build and test the
whole round trip there first, with a test wallet that has never held anything
real. Only when everything has worked many times do we allow **mainnet** (the
real network), and even then we start with one small, cheap test.

The Signer will always show clearly which network a request is for, and will
refuse requests for a network it isn't set to accept.

---

## 9. Build plan

We build in small stages. Each stage ends with something you can install and try.

| Stage | What you'll be able to do at the end |
|---|---|
| **0. Skeleton** ✅ | An empty Signer app exists and builds. |
| **1. Wallet + password** ✅ | Create a new wallet or restore one, set a password, lock and unlock the app, see your address. *(Tested on the phone. The address matches the Klever Extension, and a password check takes 0.1–0.2 s.)* |
| **2. Reading and signing** ✅ | Paste a test transaction into the Signer by hand, see it explained in plain words, approve it with your password, and see the signature. *(Tested: a real 0.5 KLV testnet transfer signed by the Signer arrived.)* |
| **3. Talking to other apps** 🔨 | The Signer accepts requests from other apps through Android, with "Allow this app?" and a connected-apps list. SIGNER-PROTOCOL.md describes how to ask. The Hub is the first client (menu → "KLV Signer (test)"): Connect → Send → Signer opens → approve → back in the Hub → sent on testnet. *(Built, now being tested. See TESTING.md, Part E.)* |
| **4. Safety polish** | Make the password check heavier, the internet-permission check, and a careful review of everything. |
| **5. More kinds of requests** | More transaction types (each with its own plain-words display), and "sign a message" for logging in to apps with your wallet. |
| **6. Mainnet** | Allow the real network, then one small real transfer. |
| **Later** | If other people will use the Signer with real money: an independent security review, then publishing it (e.g. on Google Play). |

---

## Glossary

- **Address** — a wallet's public name, starting with `klv1…`. Safe to share.
- **Private key** — the secret that controls a wallet. Never share it.
- **Recovery phrase** — a list of words (usually 24) that can rebuild the
  private key. Just as secret as the key, and your backup if the phone is lost
  or you forget the Signer password.
- **Client app** — any app that asks the Signer to sign something, such as the
  Devikins Legacy Hub.
- **Transaction** — an instruction to the blockchain, like "move this NFT from
  A to B". Unsigned, it's just a request. Signed, it's an order.
- **Signature** — proof, made with the private key, that the owner approved
  one specific transaction. It isn't secret and doesn't reveal the key.
- **Signer protocol** — the written rules for how a client app asks the
  Signer, and what answer it gets back.
- **Sandbox** — the private room Android gives each app. Other apps can't look
  inside.
- **Encrypt / scramble** — turning data into gibberish that can only be turned
  back with the right key or password.
- **Key stretching** — making password checks deliberately slow, so guessing
  millions of passwords becomes impractical.
- **Keystore** — Android's built-in safe for app secrets.
- **Testnet / mainnet** — Klever's practice network and its real network.
