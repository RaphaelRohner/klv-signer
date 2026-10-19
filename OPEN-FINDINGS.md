# OPEN-FINDINGS.md — what reviews found and isn't fixed yet

The weekly check (WEEKLY-CHECK.md) reads this file every Monday and lists
every point that is still open in its report, so nothing drops out of view
just because the code didn't change that week. The reports themselves are
kept in weekly-reports/. When a point is fixed, move
it to "Fixed" with the date; when it's accepted as it is, move it to
"Accepted" with the reason.

## Open

(none)

## Fixed

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
