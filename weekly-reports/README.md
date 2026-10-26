# weekly-reports — the history of the Signer's safety checks

Every Monday an automatic check reviews the KLV Signer and emails a report
(see ../WEEKLY-CHECK.md). The check itself never changes anything. When a
report is worked through in the claude.ai project "KLV Signer App", it is
saved here **as it arrived**, one file per Monday (`YYYY-MM-DD.md`), with a
short note at the end on what became of each point.

What is open right now is in ../OPEN-FINDINGS.md; these files are the
history behind it. Nothing in them is secret (no keys, no passwords).

| Date | Verdict | Outcome |
|---|---|---|
| [6 Oct 2026](2026-10-06.md) | Something needs a look (1 Medium, 7 Low) | All fixed 6 Oct (0.1.1) |
| [12 Oct 2026](2026-10-12.md) | Something needs a look (1 Medium, 9 Low) | All fixed 19 Oct |
| [19 Oct 2026](2026-10-19.md) | All fine (2 Low, docs) | Both fixed 19 Oct; missed the open 12 Oct Medium (see file) |
| [26 Oct 2026](2026-10-26.md) | Something needs a look (6 Low; tests couldn't run in its sandbox) | 3 fixed 26 Oct, 2 accepted, 1 open (not security) |
