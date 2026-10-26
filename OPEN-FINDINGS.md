# OPEN-FINDINGS.md — what reviews found and isn't fixed yet

The weekly check (WEEKLY-CHECK.md) reads this file every Monday and lists
every point that is still open in its report, so nothing drops out of view
just because the code didn't change that week. The reports themselves are
kept in weekly-reports/. When a point is fixed, move
it to "Fixed" with the date; when it's accepted as it is, move it to
"Accepted" with the reason.

## Open

- Low (weekly check 26 Oct 2026) — The password checker's table of shifted
  symbols uses German/Swiss key positions for every keyboard. Effect: a
  slightly wrong "neighbouring keys" score for some passwords; not a
  security gap.

## Accepted

- 26 Oct 2026 — The example app's "pass a request on" test screen ships in
  every example build (Low, weekly check 26 Oct): it can't be opened from
  outside and only asks for the address; it's how a tester sees on a phone
  that the Signer refuses passed-on requests (TESTING.md F30). Its comments
  say so, so developers copying the example can leave it out.
- 26 Oct 2026 — A signed text isn't tied to the app that asked for it (Low,
  weekly check 26 Oct): that's Klever's message format. SECURITY.md
  ("Misleading text to sign", Partly) and SIGNER-PROTOCOL.md 3c tell
  services to put their name and a one-time number in the text.

## Fixed

- 26 Oct 2026 — Second opinion (ChatGPT, on the 0.1.3 text-signing code):
  no transaction-signature bypass, no approval bypass found. Acted on:
  words mixing Latin with Cyrillic/Greek look-alike letters are refused
  (could fake a name); Klever's message format is now also rebuilt by hand
  in a test, which showed the prefix starts with an invisible byte (0x17)
  that SIGNER-PROTOCOL.md didn't mention (corrected; the Signer itself was
  right, it uses Klever's library). Not a problem: its "confirmed defect"
  (normal spaces refused) was a misreading of the rule; a test shows normal
  spaces pass. Already covered or accepted: the approval screen scrolls and
  Approve sits below the whole text; right-to-left text only alone (as for
  app names); signed texts not tied to the asking app (see Accepted); the
  biometric button, request routing and key wiping are the reviewed code
  shared with transactions.

- 26 Oct 2026 — Back button on the text-signing screen answered "you left"
  instead of "rejected" (Low, weekly check 26 Oct): fixed; a test checks
  every request screen has a Back answer.
- 26 Oct 2026 — Hard-to-read texts passed the text check (Low): strike-through
  or piled-up marks, unusual spaces and more than two empty lines in a row
  are refused now.
- 26 Oct 2026 — Docs (Low): SECURITY.md date and history order;
  SIGNER-PROTOCOL.md intro and sample code mention SIGN_MESSAGE, 3c says how
  to get the public key from the address; `zod` added to the accepted
  build-tool warnings (DEPENDENCIES.md, WEEKLY-CHECK.md).

- 19 Oct 2026 — README.md said `@klever/connect-encoding` is used for small
  helpers; it isn't used by the Signer at all (Low, weekly check 19 Oct).
- 19 Oct 2026 — DEPENDENCIES.md "two issues" / "three advisories" (Low,
  weekly check 19 Oct): already corrected to four the same day.
- 19 Oct 2026 — Refusal of passed-on requests not proven on a phone (Low,
  weekly check 12 Oct): TESTING.md F30 passed (the example app's test link
  is refused with INVALID_REQUEST; the Signer doesn't even come to the front).
- 19 Oct 2026 — Release check could miss an open part written in an unusual
  way (Low, weekly check 12 Oct): only a plain "false" counts as closed now.

- 19 Oct 2026 — Accessibility check didn't fail safe (Medium, weekly check
  12 Oct): an unreadable list now means fingerprint/face only.
- 19 Oct 2026 — Android 12/13 could trip over the "is it a tool?" detail
  (Low): only read on Android 14+.
- 19 Oct 2026 — Damaged signing history replaced after one request (Low):
  the extra confirmation now stays for one hour.
- 19 Oct 2026 — Keyboard-pattern passwords accepted (Low): refused now
  (e.g. `123456789abc`, `1234qwerasdf`, `!QAZ2wsx#EDC`).
- 19 Oct 2026 — "Wrong password" shown when a new lock failed its test-open
  (Low): now says the password was right and nothing changed.
- 19 Oct 2026 — No tests for the test-open's failure cases (Low): added.
- 19 Oct 2026 — Example app weaker than its comments (Low): comments say
  what it checks and what it leaves to the Signer; version name 0.1.2.
- 19 Oct 2026 — Outdated docs (Low): RELEASING.md examples, DEPENDENCIES.md
  summary, SECURITY.md date, signingRules.js comment.

## Accepted

(none yet)
