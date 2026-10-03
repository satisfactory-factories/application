---
name: text-sanity-rules
description: Names, notes and task titles pass one shared rulebook (common/src/text-rules.ts) in the planner and on the server; old text is repaired on load, never refused
metadata:
  type: project
  volatility: durable
  lastVerified: 2026-10-02
---

User-written text (factory, group and plan names, notes, task titles) goes through
`common/src/text-rules.ts`. The zod `textSchema(kind)` cleans it (invisible characters out,
names trimmed) and refuses links, `{ } \``, base64/hex runs of 32+, over-long words, scrambled
notes and anything over the cap. Over-length text used to be silently truncated; since this
change it is refused, and `truncate.ts` only drops tasks past the count cap.

**Why:** share links are anonymous public pages on our domain, so a link or encoded blob in a
note turns the site into a front for whatever it points at. An audit of production in October
2026 found only 9 unique notes with links (all game or video sites) and nothing else that broke
any rule, so the rules cost real users almost nothing.

**How to apply:**
- A refused WS op comes back as `op_reject` with reason `invalid_text` and a `textIssue`
  (`path`, `rule`, `message`); REST returns code `invalid_text` with the same `textIssue`.
- The planner never sends an op it can see breaks a rule: `flushRoom` holds it (like the
  factory cap) and the field shows the message.
- Old text is repaired, never refused: `sanitiseFactoryText`/`sanitiseTabText` run in
  `initFactories`, on `GET /share/:id` and in the legacy blob import, replacing links with
  "[link removed]". Without that, one old note would block every later edit to its factory,
  because a diff carries the whole factory.
- Angle brackets, `->` and the word "import" are legitimate in real names; do not ban them.
- A bare domain only counts as a link in lowercase from a word start, so "NF.IO" stays a name.
