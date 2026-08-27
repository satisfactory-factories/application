---
name: project-sync-v7-rooms
description: v7 realtime rooms sync — approved plan in .claude/plans/sync-v7-realtime-rooms.md, build in flight on branch claude/sync-mechanism-refactor-7b021b
metadata:
  type: project
  volatility: hot
  lastVerified: 2026-08-27
---

The v7 headline feature (version 0.7.0): realtime WebSocket sync with rooms, replacing the
10-second last-write-wins blob sync, plus a NestJS backend rewrite. The binding contract is
`.claude/plans/sync-v7-realtime-rooms.md` (revision 7, approved 2026-08-27 after three
adversarial Codex plan reviews). Build runs on branch `claude/sync-mechanism-refactor-7b021b`.

Decisions that must not be re-litigated (full list in the plan):

- Three tab types, user's choice: **local** (browser only), **synced** (private room, own
  account), **collaborative** (shared room). Icons: desktop = local, single user = synced,
  multi-user = collaborative.
- The room document is the only copy of a synced tab's content; memberships are access +
  tab-bar order, never data. Owner does everything; members and visitors write content only.
- Two link types, never mixed: snapshot (`/share/:id`, frozen copy) vs collaboration invite
  (`/room/<slug>`, live, optional password; rotation kicks visitors, unshare kicks everyone
  and leaves each collaborator a local copy).
- Consistency: one op in flight, exact-`baseRevision` acceptance, whole-changed-factory
  diffs, client-side rebase (server never rebases), opId dedup ring.
- No Mongo transactions (prod stays standalone mongod): resume-aware ensure-steps,
  tombstone-first delete, hourly sweeper.
- Version gate via `X-App-Version` (only `/health` and `GET /share/:id` exempt); `/hello`
  dropped; pre-v7 clients are cut off at backend deploy.
- Adoption replaces migration: per-login, per-browser, create-only; legacy blob and shares
  collections are never written again.
- Offline mode is first-class (manual airplane switch + detection prompt).
- Caps: 10 owned rooms, 25 memberships per user. Activity is recorded (who/when per op) but
  has no UI in v7.

Why: the old sync uploaded only the active tab as a bare Factory[] (dropping tab-level
fields) and any client could clobber the account's data. See [[project-tab-sync-v2]] for the
per-tab prototype this supersedes and [[calc-engine-gotchas]] before touching the diff/op
builder; [[fontawesome-dynamic-icons]] applies to the tab-state icons.

How to apply: read the plan before changing anything sync-related in this branch; the plan
wins over this summary. Email password reset, the changelog modal, and the history UI are
explicitly out of scope for v7.
