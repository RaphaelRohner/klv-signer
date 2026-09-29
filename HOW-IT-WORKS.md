# HOW-IT-WORKS.md — a plain-English tour of the KLV Signer

This guide explains what the Signer app does and how it's put together, before
any real code exists. No programming knowledge is needed to read it. Words in
**bold** are explained in the glossary at the end.

---

## 1. The problem we're solving

Your Devikins Legacy Hub ("the Hub") can already *look* at the Klever chain. It
reads which Devikins a wallet holds and shows their stats. Looking only needs a
wallet's **address**, which is public, like an email address.

*Doing* something on the chain is different. Sending a Devikin, or later selling
or renting one, needs the wallet's **private key**. Whoever holds the private
key controls everything in that wallet. So the big question is: where does
that key live, and who can touch it?

Our answer: **not in the Hub.** The Hub is a big app that talks to the internet
all day, runs a database, and will keep growing. The more an app does, the more
places a mistake can hide. So the key gets its own small, boring app that does
just one job: **the Signer.**

---

## 2. The two apps and the wall between them

Android keeps every app in its own locked room, called a **sandbox**. One app
can't look inside another app's room. That's a rule built into the phone, not
something we have to program.

```
   ┌───────────── HUB APP ─────────────┐   ┊   ┌──────────── SIGNER APP ────────────┐
   │ • shows your Devikins              │   ┊   │ • holds the private key (scrambled)│
   │ • builds "please send X to Y"      │   ┊   │ • shows you what you're approving  │
   │ • sends finished jobs to Klever    │   ┊   │ • asks for your app password       │
   │ • never sees the key               │   ┊   │ • signs, then hands back a         │
   │                                    │   ┊   │   signature (never the key)        │
   └────────────────────────────────────┘   ┊   └────────────────────────────────────┘
                                  the wall between the two sandboxes
```

Only **two things** ever cross that wall:

1. **Going right →** an unsigned request ("send Devikin #4821 to klv1abc…").
2. **Coming back ←** either a **signature** (you said yes) or "rejected" (you said no).

The private key never crosses. That's the whole idea of the design.

---

## 3. The journey of one signature, step by step

This follows the flow chart from our earlier chat.

**Step 1 — Hub builds the request.** You pick a Devikin in the Hub and tap
"Send", then enter or scan the receiver's address. The Hub asks the Klever
network to prepare a transaction ("Klever, please prepare: move Devikin #4821
from my address to klv1abc…"). Klever sends back the transaction, unsigned.
It's like a filled-in form waiting for a signature.

**The handoff →** The Hub opens the Signer with a special kind of link, called
a **deep link**. It looks roughly like this:
`klvsigner://sign?tx=0a20418f…&requestId=42`
It works like tapping a link in an email that opens an app instead of a website.
The long jumble after `tx=` is the unsigned form.

**Step 2 — The Signer shows you what you're approving.** This is the most
important safety rule in the app: **the Signer reads the form itself.** It does
not trust any description the Hub attaches. It unpacks the transaction and
shows you in plain words:
- what is being sent (e.g. Devikin #4821 from the DVKNFT-1SW5 collection),
- to which address,
- the network fee,
- which network (testnet or mainnet).

If anything looks wrong, you tap **Reject** and nothing happens.

**Step 3 — You unlock with your app password.** You type the password you
created for the Signer. (See section 5 for why this is a real lock and not
just a door guard.)

**Step 4 — The Signer signs.** For a split second, the Signer unscrambles the
key in its memory, uses it to make a signature, and then forgets it again.
The signature is proof that the owner said yes to *this exact* transaction.
It can't be reused for anything else and it doesn't reveal the key.

**The handoff ←** The Signer opens the Hub again with a reply link, for example:
`dlh://signed?requestId=42&signature=9f3c…`
(or `…&status=rejected` if you said no).

**Step 5 — The Hub picks up where it left off.** It matches the reply to its
waiting request (that's what `requestId` is for) and attaches the signature to
the form.

**Step 6 — The Hub sends it to Klever.** The Hub hands the signed transaction to
the Klever network, the same way it already talks to Klever to read NFTs. Klever
checks the signature and moves the Devikin.

---

## 4. The parts of the Signer app

The Signer is built from a handful of parts. Each will get its own file in the
code, with lots of comments.

| Part | What it does, in plain words |
|---|---|
| **Wallet setup** | The first time you open the Signer, you bring in a wallet: either an existing Klever wallet (by typing its private key or recovery phrase) or a brand-new one. You also choose your app password here. |
| **The vault** | Scrambles the key with your password and stores the scrambled result on the phone. Unscrambles it only for the moment of signing. |
| **The lock screen** | Asks for your password. Counts wrong attempts and makes you wait longer after each run of mistakes, so nobody can sit and guess. |
| **The request reader** | Receives the deep link from the Hub, unpacks the transaction, and checks it: is it well-formed? Is it from *our* wallet? Is it a kind of transaction we allow? |
| **The approval screen** | Shows the request in plain words with big **Approve** and **Reject** buttons. |
| **The signer** | Does the actual maths (the **signature**) with the key. |
| **The reply** | Opens the Hub again with the signature or "rejected". |
| **Settings** | Shows your wallet address, lets you change the password, and lets you wipe the wallet from the app. |

### What the Signer deliberately does NOT do

- **It never shows or exports the private key** after setup. There is no
  "copy key" button. If you need the key elsewhere, use your recovery phrase.
- **It doesn't talk to the internet** for its job. Everything it needs arrives
  in the deep link. (Later we'll check whether we can remove its internet
  permission completely in the final version. That would mean it *can't*
  leak anything online, even by mistake.)
- **It only signs transaction types we've allowed.** At first that's plain
  transfers (sending an NFT or KLV). Anything else is refused until we add
  and test it on purpose. Marketplace and renting come later.
- **It doesn't get backed up to the cloud** (Android's app backup is switched
  off for the Signer).

---

## 5. How your password protects the key (Option B)

You chose **Option B: a separate app password.** Here's what happens behind
the scenes.

**When you set up the wallet:**
1. You type your password.
2. The Signer runs it through a deliberately *slow* scrambling recipe
   (called **key stretching**; the recipe we'll use is named *scrypt*). We'll
   tune it so it takes roughly a second on your phone. For an attacker trying
   millions of guesses, a second per guess adds up to years.
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
  that's the point). You'd wipe the Signer and set the wallet up again from
  your **recovery phrase**. So keep the recovery phrase written on paper,
  somewhere safe and offline.

---

## 6. What changes in the Hub

The Hub doesn't do any of this yet, so it needs some new pieces too:

| New piece | What it does |
|---|---|
| A link address for replies | The Hub registers `dlh://` so the Signer can open it with the answer. (One line in the Hub's `app.json`.) |
| A "Send" button | On an NFT's detail screen. Asks for the receiver's address (typed, or scanned with the QR scanner the Hub already has). |
| A transaction helper | A new file (probably `src/api/kleverTx.js`) that asks Klever to prepare the unsigned transaction, and later sends the signed one. |
| A "waiting for Signer" state | Remembers which request is out, and handles the reply, including "rejected", or no reply at all if you just close the Signer. |

---

## 7. Testnet first

Klever runs a practice copy of its network called the **testnet**. It works
the same way, but its coins and NFTs have no real value. We build and test the
whole round trip there first, with a test wallet that has never held anything
real. Only when everything has worked many times do we switch to **mainnet**
(the real network), and even then we start with one small, cheap test.

The Signer will always show clearly which network a request is for, and will
refuse requests for a network other than the one it's set to.

---

## 8. Build plan

We build in small stages. Each stage ends with something you can install and try.

| Stage | What you'll be able to do at the end |
|---|---|
| **0. Skeleton** ✅ | An empty Signer app exists and builds. (This is where we are now.) |
| **1. Wallet + password** | Import a *testnet* wallet, set a password, lock and unlock the app, see your address. |
| **2. Reading and signing** | Paste a test transaction into the Signer by hand, see it explained in plain words, approve it with your password, and see the signature. |
| **3. The handoff** | The Hub gets its "Send" button. Tap it → Signer opens → approve → back in the Hub → sent on testnet. |
| **4. Safety polish** | Wrong-password waiting times, screenshot blocking on sensitive screens, the internet-permission check, and a careful review of everything. |
| **5. Mainnet** | Switch both apps to the real network and do one small real transfer. |

---

## Glossary

- **Address** — a wallet's public name, starting with `klv1…`. Safe to share.
- **Private key** — the secret that controls a wallet. Never share it.
- **Recovery phrase** — a list of words (usually 24) that can rebuild the
  private key. Just as secret as the key, and your backup if the phone is lost
  or you forget the Signer password.
- **Transaction** — an instruction to the blockchain, like "move this NFT from
  A to B". Unsigned, it's just a request. Signed, it's an order.
- **Signature** — proof, made with the private key, that the owner approved
  one specific transaction. It isn't secret and doesn't reveal the key.
- **Deep link** — a link that opens an app on the phone instead of a website.
- **Sandbox** — the private room Android gives each app. Other apps can't look
  inside.
- **Encrypt / scramble** — turning data into gibberish that can only be turned
  back with the right key or password.
- **Key stretching** — making password checks deliberately slow, so guessing
  millions of passwords becomes impractical.
- **Keystore** — Android's built-in safe for app secrets.
- **Testnet / mainnet** — Klever's practice network and its real network.
