---
metadata:
  type: project
  volatility: durable
  lastVerified: 2026-09-06
---

# Offline durability: one durable generation, per browser instance

Two data-loss bugs in the v0.7 sync engine had the same root cause, and the fix is one story
rather than two. Read this before touching anything that writes plan content, sync metadata or
the sync revision.

## The rule

**Content, intent, revision and any unanswered question must reach the disk as one generation,
and a browser instance may only ever be told about its own.** Whenever a new piece of unsent
state appears, ask which of those four it belongs beside, and write it there.

## What was wrong

**An unanswered offline-conflict prompt lived only in memory.** `rebase` advances the persisted
baseline to the server's revision the moment the clashing snapshot arrives, so a reload with the
question still on screen found the stored revision already equal to the server's. The join was
answered `up_to_date`, `seedFromMirror` marked the touched factory unknown, and with no send
barrier restored the flush pushed this device's version straight over the collaborator's. Nobody
chose that. A factory the room had deleted came back the same way.

**`localStorage.factoryTabs` and `tabMirrorMeta` are single shared keys written whole.** Two
browser tabs on one browser therefore overwrite each other: the second tab's plan is stale for
whatever the first edited offline, and its metadata never carried the first tab's intent at all.
`persistPlan` then compared against its own private `lastPersistedPlan` cache and reported
success without noticing the stored value was no longer the one it wrote, so closing the first
tab saved nothing.

## What it looks like now

- `web/src/sync/plan-journal.ts` is the durable record of unsent work, keyed by a per browser
  tab instance id (`sessionStorage`). Each room entry holds the revision, the intent, the
  serialized content of the touched records and any unanswered question, in one write.
- **Boot unions every slot**, never newest-wins. Newest-wins is precisely the bug: the sibling's
  generation is the newer one and it is the one missing the edit. A `sessionStorage` id does not
  survive a closed browser (Playwright's `storageState` does not carry it either), so a returning
  instance recovers through the union rather than by finding "its own" slot.
- `pendingConflicts` in `room-sync-store.ts` is the restored send barrier. It is raised in
  `trackRoom` before anything can join, makes `join` ask for a **whole snapshot** rather than a
  revision check (an `up_to_date` carries no records to ask about), and `reraisePendingConflict`
  puts the question back against the live copies. `findClashes` cannot re-derive it: the baseline
  has moved, so it would find nothing.
- `persistPlan` reads the stored string back and trusts its cache only where the disk agrees.
  The `storage` event makes that prompt; the read-back is what makes it correct with no event at
  all.
- `tabMirrorMeta` is still written exactly as before, plus the `conflict` field. It is the
  compatibility path: old browser state stays readable, and a browser whose journal write the
  quota refused degrades to the pre-fix behaviour rather than to nothing.

## Traps

- **The journal write is debounced (250ms).** `markPlanReplaced` marks intent one factory at a
  time, so writing per call would serialize the whole plan once per factory. Anything that moves
  a baseline (`persistBaseline`, a conflict answer) writes straight through; `pagehide` and
  `visibilitychange` flush it. A spec that needs it now calls `store.persistJournal()`.
- **A refused journal write stays dirty and re-arms.** Deleting it from the dirty set on failure
  is how a quota blip turns into permanently unsaved edits.
- **`declaredRemovals` is the tombstone.** A touched id with no journal record is one this
  instance deleted; that is what stops a sibling's write resurrecting it. Recording a record for
  a deleted factory would resurrect it instead.
- **The e2e proof has to close the browser context.** The older offline tests sever the socket
  with `installWsGate` and keep the page and store alive, so nothing they assert ever proves
  something reached the disk. `web/e2e/tests/offline-durability.e2e.ts` uses
  `context.setOffline(true)` for real isolation and reopens from `storageState`.
