---
name: project-sync-v7-rooms
description: v0.7.0 realtime rooms sync — built and green on branch claude/sync-mechanism-refactor-7b021b; contract in .claude/plans/sync-v7-realtime-rooms.md, file map and follow-ups here
metadata:
  type: project
  volatility: hot
  lastVerified: 2026-08-31
---

The v0.7.0 headline feature (version 0.7.0): realtime WebSocket sync with rooms, replacing the
10-second last-write-wins blob sync, plus a NestJS backend rewrite. The binding contract is
`.claude/plans/sync-v7-realtime-rooms.md` (revision 8, reconciled with the built backend).

**Status: shipped for review as PR #620 (opened 2026-08-30) from branch
`claude/sync-mechanism-refactor-7b021b`; not yet merged.** The PR body carries the three
manual box steps and the deliberate 0.7.0-over-0.8.0 version choice. The e2e CI job's first
live run happens on that PR. Every task line in the plan is delivered bar the four
deliberate v0.7.0 follow-ups (history UI, presence beyond an occupancy count, email password
reset, the v0.7.0 changelog modal). Three adversarial Codex reviews of the finished diff raised
seven findings between them; all are fixed, and the sections below are what they were. A
verification pass over the round-two fixes found a further instance of the bulk-replacement
class and fixed it (the demo-plan button, below). Main has since been merged in (66 commits) and the two guarantees that merge could break were
restored: see "The merge from main" below. Green as of 2026-08-31, after the preview-testing rounds
below (load chain, quiet applies, the UI round) and the verification round that closed them:
backend 272 vitest tests (23 files), common 75 (4), web 2736 unit tests (150 files, 1 skipped),
`vue-tsc` clean, root `lint-check` clean (64 pre-existing warnings in `parsing/`, 0 errors), root
`build` clean, and all 34 Playwright e2e tests passing — twice at full speed and once under
`E2E_CPU_THROTTLE=6`, which is the run that earns its keep and is the one that found the last real
bug. The e2e job in CI has never actually run: it is validated locally only, so the first PR is
where it gets proved.

Two counting traps in that line, both of which have already misled a pass. The web figure
includes the 8 files and 129 tests in `web/testing/tdd/`: they are **not** excluded by
`vite.config.mts`, whose only exclusions are `e2e/**` and `playwright.config.ts`, so they run with
everything else and are currently all green — [[tdd-specs-fail-intentionally]] describes a state
that does not hold on this branch, so read the run rather than assuming a failure there is
someone's WIP. And `web/src/sync/room-state.ts` carries one literal NUL byte, in the
`UNKNOWN_CONTENT` sentinel, which makes git classify the whole file as binary: `git diff`,
`git show` and every PR review of the sync engine's state module print "Binary files differ" and
no diff at all. Pre-existing rather than merge fallout, and worth knowing before anyone reviews a
change to that file.

## Where things live

| Concern | Path |
| --- | --- |
| Wire protocol, zod data boundary, caps table | `common/src/` (`types/protocol.ts`, `schemas/`, `caps.ts`) |
| Sync engine, two-set op builder, rebase, offline state machine | `web/src/stores/room-sync-store.ts` |
| The one door the UI declares an edit through (payload + intent) | `web/src/utils/sync-intent.ts` |
| Tab list, adoption, share/unshare, join | `web/src/stores/rooms-store.ts` |
| Socket, close-code policy, backoff | `web/src/sync/ws-client.ts` |
| Sidecar sync metadata (`localStorage.factoryTabs` keeps its v6 shape) | `web/src/sync/tab-mirror-meta.ts`, `tab-sync-state.ts` |
| Version header and the 426 path | `web/src/api/client.ts`, `components/sync/VersionPrompt.vue` |
| WS gateway, presence, fan-out, revocation | `backend/src/realtime/` |
| Rooms domain, ensure-steps, sweeper, activity | `backend/src/rooms/` |
| Playwright harness (builds and boots the real stack) | `web/e2e/`, `web/playwright.config.ts` |
| CI job for that suite | `.github/workflows/e2e.yml` |

The e2e ports 3000/3001 are not configurable: the API's CORS allowlist and the WS upgrade's
Origin check name `localhost:3000`, and a `VITE_ENV=dev` bundle bakes in `localhost:3001`.

Vercel's install command (`web/vercel.json`) must be `pnpm install --filter web...` with the
three dots: web aliases `common` to its *source*, so the web typecheck compiles common's
files and needs common's dependencies (zod) installed. Plain `--filter web` skips them and
every zod-derived type collapses into a wall of unrelated-looking TS errors.

## Decisions that must not be re-litigated (full list in the plan)

- Three tab types, user's choice: **local** (browser only), **synced** (private room, own
  account), **collaborative** (shared room). Icons: desktop = local, single user = synced,
  multi-user = collaborative.
- The room document is the only copy of a synced tab's content; memberships are access +
  tab-bar order, never data. Owner does everything; members and visitors write content only.
- Two link types, never mixed: snapshot (`/share/:id`, frozen copy) vs collaboration invite
  (`/room/<slug>`, live, optional password; rotation kicks visitors, unshare kicks everyone
  and leaves each collaborator a local copy, keeping the slug reserved).
- Consistency: one op in flight, exact-`baseRevision` acceptance, whole-changed-factory
  diffs, client-side rebase (server never rebases), opId dedup ring of 50.
- No Mongo transactions (production stays a standalone mongod): resume-aware ensure-steps,
  tombstone-first delete, hourly sweeper.
- Version gate via `X-App-Version` (only `/health` and `GET /share/:id` exempt); `/hello`
  dropped; pre-v7 clients are cut off at backend deploy.
- Adoption replaces migration: per-login, per-browser, create-only; the legacy blob and the
  shares collection are never rewritten.
- Offline mode is first-class (manual airplane switch + detection prompt).
- Caps: 10 owned rooms, 25 memberships per user. Activity is recorded (who/when per op) but
  has no UI in v0.7.0.
- **Revocation is a single write, not a chain.** Unshare clears `shared` and bumps the room's
  `membershipEpoch` in one update; a `RoomMembership` whose `epoch` is below it grants nothing
  anywhere (REST list, WS join, every op), owner rows exempt. The deletions, revision bumps
  and socket kicks after it are cleanup that a retry or the sweeper finishes. Re-sharing never
  lowers the epoch, so a former member must join again — the row is re-stamped, not resurrected.
- **An authorization and the room it authorizes are one operation, never two reads.**
  `RoomAccessService.authorize(roomId, credentials)` reads the room, resolves the membership,
  re-reads and refuses unless `membershipEpoch`, `passwordVersion`, `shared` and `deletedAt` are
  unmoved. It returns the room copy the decision is true of, and a snapshot may be built from
  that copy and no other.
- **Nothing after a committed write may block the ack.** Activity rows and socket sends on the
  op path are best-effort and logged; a client that loses its ack never clears its one
  in-flight slot and stops editing altogether. Same rule for the REST meta mutations: a
  committed unshare or rename is never reported as a 500 because its audit row failed.

## The three round-one findings, and how each was closed

**Revocation is one write, because a chain cannot be trusted to finish.** Unshare used to be a
sequence — clear `shared`, bump revisions, delete the member rows, kick the sockets — with no
transaction behind it, so a failure part-way left a collaborator holding a live membership to a
room its owner had been told was private. The first write is now decisive: it sets
`shared: false` and `$inc`s `Room.membershipEpoch` together, and `membershipGrantsAccess` in
`backend/src/rooms/membership-epoch.ts` treats any non-owner `RoomMembership` whose `epoch` is
below the room's as granting nothing — on the WS join, on every op, and in the REST room list.
Owner rows are exempt. Everything after that write is cleanup a retry or the sweeper finishes.
Rows written before the field existed read as epoch 0 and stay valid until the first unshare.

**Nothing after a committed write may block the ack.** A client holds exactly one op in flight
and only an ack releases it, so an exception thrown *after* the room document was updated does
not lose a row — it wedges that client into never editing again. Everything the op path does
past the commit is now best-effort and logged: the activity row in `room-op.service.ts`, and
the `op_ack` plus the peer fan-out, which go through the gateway's `deliver()` so one
unwritable socket cannot cost the sender its ack or the other peers their broadcast. The same
argument applies to the REST meta mutations, where a committed unshare or rename must never be
reported as a 500 because its audit row failed. It deliberately does **not** apply to
`ensureRoom`, `join`, `leave` or `deleteRoom`: there real work still follows the log, and the
500 is the documented signal to retry the chain.

**Every user mutation of synced content declares intent.** A rebase carries over only the
factories the user is recorded as having touched, so any edit that announced payload alone was
silently discarded by every recovery path. The fix routes all of them through
`web/src/utils/sync-intent.ts`; the long version is in the `factoryEdited` section below,
including the watcher trap and the two deliberate exclusions. A later verification pass found
one more instance of the same class: `addFactory`/`removeFactory` in `app-store.ts` reindex
`displayOrder` across the whole plan, and only the added or removed record was announced, so a
rebase put every record they shifted back on the server's old index. Both now bracket the
reindex with `captureOrder`/`markReorderedFactories`.

## The three round-two findings, and how each was closed

**A live socket is revoked at the epoch write, not at the end of the cleanup.** `unshare()` now
emits `access_revoked` immediately after the write that clears `shared` and bumps
`membershipEpoch`, so a chain that dies at any later step has still closed the collaborator's
socket `4403`. The end-of-chain emit is kept as well: the sweep is idempotent, and a socket that
connected in between still has to be re-checked. `rejectUnparsable` in `room.gateway.ts` used to
answer a schema-invalid frame with a full snapshot on the strength of `connection.rooms` alone —
that map records what a socket *joined*, never what it may still read — and now re-runs the same
access check the parsed op path runs, answering `forbidden` and dropping the room when it fails.
(Re-running the check was not enough on its own; round three, below, is why.) `leave()` emits `access_revoked` scoped `departed-member` with the leaver's
`userId`, and the gateway drops that room from that account's sockets rather than closing them:
leaving withdraws nothing the room itself grants (a shared room would still admit them as a
visitor), so a re-check would not kick them, and one socket carries every other tab.

**Every bulk replacement of the plan declares itself.** `clearFactories` in `app-store.ts`
replaced both arrays and emitted nothing — no payload, no intent — so no flush was ever scheduled
and the next rebase brought the whole plan back off the server. It now routes through
`markPlanReplaced(before, after)` in `sync-intent.ts`, which declares every arriving record and
every departing one. `Templates.vue` uses the same call: a template load *is* announced (through
`calculateFactories`), but structural inference only sees ids that appeared or vanished, so a
template landing on an id it overwrites carried no intent at all. Paste-from-clipboard is covered
because it emits `clear-all` first.

The verification pass found the same hole in a third place, and this one is the easiest of the
three to hit: **"Start with a demo plan" in `Introduction.vue`**, the button every new visitor is
offered. It swaps the whole plan out and declared nothing for a single factory. The demo's ids are
hard-coded 1-9 (`newFactory(name, order, id)`), and the built-in template is generated from the
same fixture, so "load the template, then the demo" collides on all nine — the op still ships, but
any later rebase drops every colliding record back to the server's copy and leaves a hybrid plan.
It now calls `markPlanReplaced` exactly as the template loader does. The bar for this class is not
"does the id collide by chance" but "can this path put a record on an id the plan already holds".

**The duplicate-op ack replay goes through `deliver()`.** It was the one post-commit send still
calling `connection.send` directly, on exactly the path a client takes when its ack went missing:
a synchronous send failure escaped to the outer handler, the client got `internal_error` instead
of an ack, and its one in-flight slot never cleared. The audit that came with it moved
`onRoomDeleted`, `fanOutRoomsChanged`, `fanOutRoomMeta` and `revokeAccess` onto `deliver()` too —
each loops over sockets after a committed REST mutation, and one unwritable socket used to abort
the loop and leave the rest unnotified.

## The round-three finding: two reads are not an authorization

The round-two fix made `rejectUnparsable` re-run the access check, and that was still wrong,
for a reason that applied to nearly every check on the branch. The check was **two separate
reads** — read the room, then read the membership — and an unshare fits between them. The room
copy still says `shared` at epoch N, the row still says `member` at epoch N, the pair agrees,
and the snapshot that goes out is of a room that was made private in between. The kick does not
help: the frame is already executing and event delivery is asynchronous.

**`RoomAccessService.authorize` is now the one door**, and it hands back the room the decision
is valid for. It reads the room, resolves, re-reads, and retries (three attempts, then refuses)
unless the four fields any decision consumes are unmoved: `membershipEpoch`, `passwordVersion`,
`shared`, `deletedAt`. `resolve` is still there but is no longer an authorization on its own —
it judges one copy, and only `authorize` knows whether that copy still stands. Every caller went
through it: `handleJoin`, `rejectUnparsable`, the op path (`RoomOpService`'s `OpAuthorizer` is
now a thunk returning the whole outcome, so the service never reads the room itself), and
`revokeAccess`, where anything short of a clean grant kicks.

**The op path had the same window with a different sink.** `applyNow` authorized on a read room
and then guarded the write on `{roomId, revision, deletedAt}` — and **unshare bumps
`membershipEpoch`, not `revision`**, so a just-revoked member's in-flight op committed straight
through the guard. A password change bumps `passwordVersion` and likewise leaves `revision`
alone, so a rotated-out visitor's op did too; the guard did not cover it, and dropping that one
term from the guard is enough to make the visitor test commit again. The filter now carries
`membershipEpoch` for any non-owner and `passwordVersion` as well for a visitor. **Owners are
exempt on purpose**: they never lose their own room, and guarding them would refuse the op an
owner had in flight across their own share or rotation. A guard miss is now re-authorized rather
than assumed stale, because the `stale` outcome carries a snapshot too.

Two smaller notes from the same sweep. Mongo matches an absent field against `null` and never
against `0`, so the guard spells the epoch `room.membershipEpoch ?? null` — a room document
written before the field existed would otherwise fail every non-owner write. And **REST
`join` reads the membership before the room now**: every lever that withdraws access advances a
counter on the room and never on the row, so a room read afterwards is never the older of the
two and the same interleaving cannot arise. That one is an ordering argument rather than a
re-read, and it has no race test behind it.

**Closed, and independently re-audited on 2026-08-30.** The part worth carrying forward is the
write guard, because it is the half that is easy to leave out: a revocation never touches
`revision`, so guarding an op on the revision alone lets a member who was cut off a moment ago
commit anyway. Putting `membershipEpoch` into the same `findOneAndUpdate` filter — and
`passwordVersion` as well for a visitor — makes the write itself fail the instant access moved,
at no extra read and with no window left to lose. The re-audit walked every sender of room
content and every write of a room and found no other path serving or writing a copy older than
the check it rode on; the two residuals it did turn up are in the follow-ups below.

`backend/test/ws-authorization-race.spec.ts` stages the gap deterministically by wrapping
`RoomAccessService.resolve` on the live instance, so the revocation runs after the room read and
before the membership read. Both halves were negative-controlled: with the re-read removed the
join test receives `[snapshot, presence]` and the malformed-frame test receives `[op_reject]`
(which carries a snapshot); with the write guard removed both write cases return `applied`.

## What the verification pass actually checked, so it need not be re-derived

Five enumerations, run against the code rather than the tests. Redo them whenever a new sender,
a new revocation lever, a new room write or a new bulk path lands.

- **Every WS sender of room content is access-checked, or is only reachable from one that is —
  and serves the room copy that check returned.** The senders are: the join snapshot, the four
  snapshot-carrying `op_reject` outcomes (`stale`, `not_owner`, `too_large`, and the lost-guard
  re-read, which re-authorizes rather than re-reading raw), `rejectUnparsable`, and the two
  fan-outs, `broadcastOp` and `fanOutRoomMeta`. Every one of the first six goes through
  `RoomAccessService.authorize` and serializes `access.room`. The fan-outs are the only ones that
  go on registry membership alone, and that is sound because `connection.rooms` is written in one
  place — `handleJoin`, after `authorize` — and every one of the four levers that withdraws access
  (unshare, password set/rotate, delete, leave) emits an event that drops or closes those sockets.
  `ConnectionRegistry.leaveRoom` clears both indexes, so a dropped room leaves nothing behind.
- **No raw `connection.send` survives on a post-commit path.** The remaining direct calls are all
  single-client replies made *before* any write — the rate-limit and parse errors, `hello_ok`, the
  join replies, and the five reject outcomes — where an exception reaching the outer handler and
  becoming `internal_error` is the correct signal. Everything past a committed write goes through
  `deliver()`.
- **The bulk content-replacement paths.** Live and declaring: `clearFactories`, the template
  loader, `Introduction.vue`'s demo button, `RawResourcesWizard.apply()` (found by the re-run
  after the merge from main), and paste (via `clear-all`). Correctly silent:
  `setFactories`/`initFactories`/`beginLoading` (the load funnel, which is also how an inbound
  snapshot lands — declaring there would claim authorship of a peer's plan) and
  `pages/share/[id].vue` (it calls `addTab`, so nothing is replaced). Not applicable:
  `WorldImport.vue` never writes the plan at all.
- **Every write of a room, and what its authorization rides on.** The op write is the only one
  that mutates room *content*, and it carries the access fingerprint in its own filter (above).
  Create, adopt and the legacy import are create-only, so there is no prior room whose access
  could have moved under them. The owner-only meta writes — `rename`, `share`, `unshare`,
  `setPassword`, `removePassword` and the delete tombstone — ride on `requireOwner`, whose two
  reads cannot go stale in the access sense: ownership is the one grant nothing revokes, and
  owner rows are epoch-exempt by design.
- **No REST route serves room content at all**, which is why the whole problem lives on the
  socket. Every rooms response is a `RoomListEntry` (id, name, slug, shared, hasPassword,
  revision, role, order) or a bare status. `RoomSnapshot` is the only shape carrying
  `factories`, it is built at five sites, all of them in `room.gateway.ts`, and every one is
  built from an `authorize()` result. `GET /share/:id` serves the legacy snapshot collection,
  which is deliberately public and holds no room.

## The merge from main, and the two guarantees it could have broken silently

Main's 66 commits added persisted fields to `Factory` and `FactoryTab` (AWESOME Sink and depot
disposal, custom buildings, per-factory checklist mode, extraction/well group settings, the depot
research tiers). Two v0.7.0 invariants do not survive that on their own, and neither fails loudly.

**The zod schemas strip unknown keys, so a stored field missing from them is deleted.** Not
rejected — deleted, on every op, adoption and share, with the sender's own copy keeping it and
every peer's losing it. `partDisposal` was the one that changed numbers: sinks and depot uploaders
would not have survived a round trip. Fifteen fields were missing in all; every one is now in
`common/src/schemas/factory.ts`, optional where the interface says optional so an absent value
stays absent (a default would add bytes the sender's copy does not have, and the diff fingerprint
is byte-comparison). Three guards, because the fixture and the real thing rot apart:
`common/src/schemas/factory.spec.ts` deep-equals a fully populated fixture through the schema;
`web/src/sync/schema-parity.spec.ts` deep-equals what `newFactory()` plus a real calculation pass
actually builds, with every new feature exercised; and `backend/test/rooms-adopt.spec.ts` +
`ws-ops.spec.ts` prove it end to end through Mongo. **Adding a field to `common/src/types/factory.ts`
without adding it to the schema now fails the build.**

**The tab-level fields did not exist in the room protocol at all.** `depotUploadTier`,
`depotExpansionTier` and `plannerVersion` describe the save a plan is written against, so they have
to travel with the plan; `RoomContent`/`TAB_FIELDS`, `RoomSnapshot`, `RoomDiff`, the Mongo `Room`
schema, `toRoomSnapshot`, `contentUpdate` and the create/adopt body all carry them now.
`TAB_SCALARS` is the table the client's tab-field plumbing loops over, so a fourth scalar is one
array entry rather than eight hand-edited comparisons.

Two rules fell out of it and are load-bearing:

- **A diff cannot express "cleared".** Absent means unchanged, so an absent local value never
  counts as a difference (`fieldDiffers`) and never enters a diff (`buildDiff`). Nothing in the
  planner clears one of these back to absent, so nothing is lost by it — but a template that
  deliberately re-arms the raw notice by clearing `plannerVersion` stays local by construction,
  and `Templates.vue` only declares the stamping half.
- **A snapshot writes the tab fields as the room states them, absent included.** `addTab` stamps a
  brand-new empty tab as answered-for, and the tab created to join someone else's room is exactly
  that — so preserving a local stamp the room lacks would push "this plan has been answered for"
  onto a room whose owner was never asked and silence their raw-resources notice. Clearing errs
  the other way, showing a notice that may not be needed.

**Intent parity for the new mutation sites.** The audit predates these commits, so its five
enumerations were re-run. Seven sites declared payload and no intent, which means a rebase
discarded them: all seven checklist mutations in `utils/factory-management/checklist.ts` (a build
session can consist of nothing but ticks, so there is no other edit to ride back on) and
`updateDepotCount` in `PlannerFactorySatisfactionItems.vue` — its sink twin is declared for free by
`calculateFactory`, and skipping the recalculation for the depot skipped the declaration with it.
Four more declared nothing at all: the two depot research tiers in `useDepotResearch.ts` and
`plannerVersion` in `dismissRawBreakingNotice`, which reached `markPlanEdited` (local save) but no
room; and `RawResourcesWizard.apply()`, a bulk plan replacement that lands on ids it already holds,
which is the `markPlanReplaced` class the audit already caught three times. `Templates.vue` and the
paste handler declare the tab fields they write. Everything else upstream added was already covered,
because it routes through `updateFactory`: custom buildings, sinks, the extraction settings, Satisfy
and Trim, the per-group Add Factory (via `moveFactoryToGroup`), and tasks-on-blur (via `taskEdited`).
`usePlannerOptions` is correctly silent — those are per-browser view settings, not plan content.

**The independent re-check of all of it, 2026-08-30.** The field diff was re-derived from
scratch rather than re-read: a throwaway script parsed every `export interface` out of
`common/src/types/factory.ts` and compared it against the zod shapes pulled off the schema
objects at runtime, both directions, optionality included. Clean — no missing field, no extra,
no optionality mismatch, and the only interface with no schema pair is
`LegacyRawAssumptionFields`, which is meant to be stripped. The check is self-proving: an empty
or wrongly-resolved shape would have reported every field as missing rather than none. Worth
redoing exactly that way after any future merge, because it costs minutes and does not depend on
anyone having kept a fixture current.

**Three more payload-without-intent sites, found by re-running the sweep over the merged tree.**
All three add a product to a factory that already exists and recalculate through the plural
`calculateFactories`, which is payload only: "Add to factory" in `AddToPlannerDialog.vue` (the
Parts & Recipes tray), the product-plus-import pair in `AddShortageDialog.vue`, and the import
left on the short factory when `PlannerFactorySatisfactionItems.vue` builds a producer for a
shortage. The first two now have component specs. The pattern to keep testing for is the plural
call in a click handler: `calculateFactory` declares intent for the factory the user acted on and
`calculateFactories` declares nothing at all, so any handler reaching for the plural form has to
say whose edit it was.

**The version notifier overlap (#587).** Three components could tell someone to reload:
`VersionPrompt` (ours — the persistent banner on a 426 or a 4426 close), `UpdateAvailableToast`
(upstream's dismissible release ping) and `UpdateRequiredDialog` (upstream's blocking dialog, on an
`X-Planner-Client-Outdated` header the NestJS API never sends, reachable only from the share page's
raw fetch). The gate is the same news said harder — nothing this tab sends will be accepted until it
reloads — so both of upstream's stand down behind it: the toast and the dialog close on
`versionMismatch` and refuse to open after one, and `startVersionCheck` stops polling. Ours wins
placement deliberately; a modal over the banner would hide the notice the sync engine's own state is
driving. Nothing was deleted, so if `GET /version` ever lands the release ping works as upstream
intended.

## The load chain drives itself; the overlay is UI (2026-08-31)

**A load must never hang off a CSS transition.** `Loading.vue` emitted `readyForData` only from
its `v-overlay`'s `@after-enter`, which fires on mount and on false-to-true transitions and
nothing else — and that event was the only thing that called `beginLoading`. So any
`prepareLoader` raised while the overlay was already up, while another load was running, or on a
page that does not mount `Loading.vue` at all (`/room/<slug>`) started a chain nothing finished:
`plannerShow` latched false (skeletons forever), the overlay froze at "0 out of N", and
`isLoaded` never flipped back. That last one is the expensive part, because `recordIntent` and
`flushRoom` in `room-sync-store.ts` both refuse while `!appStore.isLoaded` — a dead chain made
the client silently receive-only. `prepareLoader` now emits `prepareForLoad` for the UI and then
calls `beginLoading` itself; `startQueuedLoad` is still wired to `readyForData` but only ever
serves the boot load.

**One chain at a time, latest wins.** Two chains share `loadedCount`, the tab's factory array and
the `preLoadFactories` key, so an overlap truncates the plan — and `prepareLoader` is re-entrant
by design (socket snapshots, tab switches, deletes, templates). A `loadInFlight` ref is set in
`prepareLoader`/`startQueuedLoad` and cleared in `loadingCompleted`, which then runs whatever
queued behind it. Superseding rather than serialising is safe because every request carries the
whole plan. `startQueuedLoad` is a no-op while the flag is set, so the overlay animating into
view can never start a second chain.

**A remote apply that changes nothing locally must not run the loader.** `rebase` returns whether
it recalculated (the overlay of user-touched records over the server's copy), and `onSnapshot`
only calls `reloadTabFromMirror` when it did. Every 10s revision probe answers with a snapshot
whenever it heals a missed op, and each one used to blank the planner and block flushing for the
length of a chain. Background tabs were already quiet, via `reloadTabFromMirror`'s own
active-tab guard.

**`getFactories()` no longer emits `prepareForLoad`.** It is a getter with no chain behind it: the
event hides the sidebar list and opens the overlay, and nothing it starts ever says the load
finished. The boot chain emits the same event with the same counts moments later.

## The quiet-apply round (2026-08-31): three bugs the preview showed, and what they share

All three were reported from the live preview as "sync doesn't work", and none of them was the
protocol. Keep them: two are load-chain ownership and one is a rendering derivation.

**A join could delete the whole room, and the load chain was holding the knife.** `runLoad` read
`newFactories ?? factories.value` *before* its 50ms `plannerShow` pause and committed that array
at the end. A join snapshot landing inside the pause replaced `tab.factories` with the room's
content; the chain then wrote its captured (empty) array back, and the engine diffed that against
the acked snapshot and sent `removedFactoryIds` for every factory in the room. The owner's plan
went empty on their screen. Only reachable since quiet applies landed (above): before them every
snapshot re-ran the loader, which happened to paper over it. Two changes close it: `runLoad`
reads the array *after* the pause, and `writeContentToTab` queues the new content as the next load
(`prepareLoader([...next])`) whenever `appStore.loadInFlight` and the write is for the active tab
— a copy, because a staggered chain is still pushing into the array it holds. **The general rule:
while a load chain owns the plan, nothing else may assign `tab.factories` and expect it to
survive.** `web/src/stores/room-sync-store.spec.ts` "survives a load chain that started before
the snapshot arrived" is the guard; negative-controlled by putting the early read back.

**Reproducing it needed load.** `E2E_CPU_THROTTLE=6 pnpm exec playwright test invite.e2e
--repeat-each=4` failed 4/4 before the fix and 12/12 after. At full speed the same bug was one
failure in two whole-suite runs, in a different test each time — which reads as flake and is not.

**A peer's reorder never moved anything on screen.** A diff is replace-by-id, so the only thing
saying two factories swapped is their `displayOrder`, and the array's order is what the planner
renders. The receiver applied the new indexes and left the array alone, so the data agreed and the
screens did not. `inDisplayOrder` in `writeContentToTab` re-derives the array from the indexes it
now holds — the invariant `factory-groups.ts` opens by declaring, applied on the way in. The
server's own stored array order is still "replace by id, then append" and therefore stale; that is
harmless only because every client sorts on receipt.

**Presence was a frame per peer per room per client per probe tick.** `handleJoin` broadcast
presence on every join, and the client re-joins every idle room each `REVISION_PROBE_MS` to heal a
missed `op_apply`. `ConnectionRegistry.joinRoom` now returns whether the socket was newly added and
the gateway broadcasts only then; leave, disconnect and the kicks are unchanged. The ws ping/pong
heartbeat is already the marco-polo — browsers answer protocol pings themselves — and a terminated
socket reaches `handleDisconnect`, which recounts every room it held. No client change was needed.

**Two e2e traps worth keeping.** A Vuetify picker's `<input>` holds the *search* text, blank on
every field nobody is typing into; the selection is rendered separately as
`.v-autocomplete__selection-text`, so reading `input.value` says a synced product never arrived
when it plainly did. And `E2E_PROBE_MS=2000 pnpm test:e2e` compresses the revision probe
(`VITE_PROBE_MS`, read once in `room-sync-store.ts`, wired through `e2e/config.ts` and the build in
`global-setup.ts`), which is what puts several healing cycles inside a test-length run; unset, it
is the app's own 10s and the soak tests simply wait longer.

New e2e files: `live-propagation.e2e.ts` (product both ways, rename, reorder, and the same
exchange across two idle probe cycles) and `sidebar-tabs.e2e.ts` (the docked sidebar visibly lists
the active tab's factories across repeated switches, for synced, local and joined tabs).
`settle()` now takes two clear overlay samples with a gap, because a snapshot landing just after
the first one raises a load of its own.

## The PR-review polish round (2026-08-31), and the one real bug in it

Ten review points on the v0.7.0 UI. Most were copy or placement; three are worth keeping.

**Two callers of `refresh()` overlap on every login, and the loser used to be dropped.** The
account panel now refetches the room list when the tray opens (content ops move a room's
`lastActivityAt` without bumping `roomsRevision`, so nothing else would ever refresh the
times). The tray is open at the moment `loggedInUser` flips, so the panel mounts and calls
`refresh()` in the render microtask **before** `begin()` reaches its own
`refresh({ offerAdoption: true })` one microtask later. The old guard (`if (refreshing) return
false`) then threw the second call away, and with it the adoption offer: both adoption e2e
tests failed with "adoption-dialog not found" and nothing else in the suite noticed.
`refresh` now coalesces on an in-flight promise (`fetchRooms`) and every caller gets the same
list back, so the offer runs whoever won. The lesson generalises: a "drop the second caller"
guard silently discards the *options* that caller was carrying.

**"The checkboxes are broken" was a rendering complaint, not a wiring one.** Reproduced in a
real browser before touching anything: the array `v-model` reacted correctly, `--dirty`
flipped, and the input toggled on both a click on the box and a click on the label. What did
not read as a change is the mark itself. `global.scss` draws selection marks in CSS (Font
Awesome ships no Regular family, see [[fontawesome-dynamic-icons]]) and with no `color` prop
the ticked state is a solid **white** square where the unticked one is a white outline at 55%
opacity. So the dialog now sets `color="primary"` and opts into `sf-checkbox-tick`, a new
global modifier that lays the app's white tick (an inline SVG background, because `::before`
is Vuetify's ripple and `::after` is already the box) over the filled mark. The result matches
the hand-drawn `.tick.on` in `FactoryGroupBulkDialog.vue` and `OptionsDialog.vue`, which exist
because someone hit exactly this and worked around it locally. The per-row model is explicit
now (`:model-value` + `@update:model-value`) rather than an array `v-model`, which is what the
component spec can actually assert.

**Four Font Awesome 6 names had reached the branch**, all drawing the dashed placeholder:
`fa-cloud-arrow-down` (the Recover button Matt flagged), `fa-triangle-exclamation`,
`fa-plug-circle-xmark` (twice) and `fa-rotate` (in `AccountPanel.vue` and `VersionPrompt.vue`).
The cheap sweep that finds them: pull every `"name":[`/`name:[` key out of
`web/public/assets/js/fa-solid.min.js` into a list, then grep every `fa-*` token in the changed
files against it. That bundle is FA **Pro** 5.15.4, so Pro-only v5 names like `wifi-slash` are
available and v6 renames are not.

Also in the round: the sign-in/register form is its own component
(`web/src/components/sync/AuthForm.vue`) so the new-tab chooser can show it inline and carry on
to create the synced tab afterwards (it awaits `roomsStore.whenSessionReady()` first, or the
in-flight room list comes back without the new tab and converts it straight to local);
`RoomListEntry.lastActivityAt` (ISO string) now travels to the client and a rename stamps it
as an op does; the tab bar's copy/share/delete buttons sit together with real `v-tooltip`s
instead of `title` attributes; and `NewTabDialog`/`AdoptionDialog` moved onto `AppDialog`,
where a `data-testid` on the component falls through to `.v-overlay__content` and stays
reachable from the e2e suite.

## The UI round (2026-08-31): toasts that carry a timer, and three traps in them

**A toast is now a component with modes, and `plain` is still the default.**
`web/src/components/common/ToastNotification.vue` takes `variant: 'plain' | 'timed' |
'permanent'`; `Toast.vue` is just the bus listener that drives it, and the payload type moved
to `web/src/utils/toast.ts` so `eventBus` and the component share one definition. `plain` is
byte-for-byte the toast the planner has always shown, so the ~30 existing call sites are
untouched (issue #623 tracks moving them). `timed` drains a line along the bottom edge and
dismisses itself; `permanent` has no timer and a Dismiss button. The timer is the component's
own rather than Vuetify's `:timeout`, so the bar and the dismissal run off one clock, and a
`sequence` prop restarts both when the same notice arrives while it is still up.

Three things about Vuetify's snackbar that cost real time, all of them invisible in jsdom:

- **A snackbar is `persistent`, so it swallows Escape.** VSnackbar hands VOverlay
  `persistent: true`, which means that while a toast is up it is the top of the global overlay
  stack and Escape reaches it — and being persistent it does not close either, so the key does
  nothing at all. Entering offline mode from the account tray and pressing Escape left the tray
  open. `_disable-global-stack` takes it out of the stack. The offline e2e tests are what found
  it, because they close the tray with Escape immediately after flipping the switch.
- **Leaving the stack gives up the z-index it allocated.** The toast dropped to the base 2000
  while the bottom-edge banners sit at 2400, so it rendered completely behind them. It names
  `:z-index="2600"` now.
- **A fixed white bar disappears into an amber toast.** Both the bar and the track behind it are
  `currentColor`, which Vuetify already picks for contrast against whatever fill the type chose.
  The track is a `::before` rather than an opacity on the parent, which would take the fill down
  with it.

Also: `<v-snackbar top>` has been an inert HTML attribute since Vuetify 2. The toast has always
appeared bottom-centre.

**Two notices moved onto the new modes.** Offline mode's own banner in `OfflinePrompt.vue` is
gone — that component is only the offer now, and `enterOffline()` emits a ten-second timed toast
instead. Being *in* offline mode is said by the tab bar's chip and the account panel, which is
also the way back out, so `offline-detected.e2e.ts` uses `setOfflineMode` rather than the button
that used to be in the banner. And `convertToLocal` in `rooms-store.ts` sends the deleted case as
`permanent`: losing a plan someone else deleted is not something to catch out of the corner of an
eye. The client that asked for the deletion is not told at all — the room's fan-out reaches its
own socket too, so `removeTab` adds the id to a `selfRemoved` set before the request goes out and
`convertToLocal` consumes it.

**The bottom-edge banners share one stack.** `default.vue` holds a `.bottom-notices` flex column
and the health banner and the offline prompt are children of it with no fixed positioning of
their own. Two fixed banners both on `bottom: 8px` overlap, and both can be up at once.

## "Last updated" and what counts as the plan changing

`LastUpdatedIndicator.vue` sits beside the search box; `stores/plan-activity-store.ts` is the
tracker and `sync/plan-activity.ts` the pure half. Stamps are per tab and persisted in
`localStorage.lastPlanUpdate`, so a reload does not reset the line to nothing.

**The rule is a fingerprint, not a call site.** `contentPrint(factory)` is `stableStringify` of
the record minus `name`, `displayOrder`, `group`, `hidden` and `checklistPanelHidden`, so a
rename, a reorder, a regroup and a collapse all fingerprint identically and none of them bumps.
That one definition covers both directions: local edits arrive as `factoryUpdated` and an inbound
op is measured by `diffChangesContent(diff, tab.factories)` in `onOpApply` before it is applied.
Doing it this way is what avoids touching the thirty-odd sites that announce an edit.

Two things it cannot see from a fingerprint, and how each is handled. **A deletion leaves the
deleted record's own bytes identical**, so the tracker also compares how many factories the plan
holds against how many prints it is carrying; a mismatch is a change and is the only case that
re-reads the whole plan. And **tab-owned content** comes in on `tabEdited`, where `name` and
`groups` are excluded and the power target and depot tiers are not.

Fingerprinting is one trailing pass per burst (`ACTIVITY_DEBOUNCE_MS`, 300ms) over only the
records that burst announced. `stableStringify` of a calculated factory is not cheap and
`factoryUpdated` fires for every ripple, so a per-event or per-plan fingerprint would have put a
full-plan serialization on every edit — which is the cost `perf-deep-watcher-bottleneck` exists
to warn about.

## The backend health banner (#108)

`stores/backend-health-store.ts` polls `GET /health` every 60s and immediately whenever
`roomSync.connection` becomes `reconnecting`. A 503 (which arrives as a thrown `ApiError`), a
`fail` body, or a request that never lands raises `BackendHealthBanner.vue`. `/health` is exempt
from the version gate by design, so a tab too old to call anything else can still ask.

Two silences are deliberate and both are load-bearing. **Offline mode does not poll at all** and
drops whatever the banner last believed, because backend silence is the whole point of it. And a
browser reporting `navigator.onLine === false` is not evidence about the server — this banner
asks the reader to go and report an outage on Discord, so a user on a train must not be told to.

## The verification round (2026-08-31): what re-reading the fixes found

The battery over the three preview-bug stages above (load chain, quiet applies, presence and
propagation, the UI round). Every gate was re-run and every fix re-read against the complaint it
answered. Five more defects fell out, none caught by any suite until a test was written for it,
and the biggest of them was the original complaint's actual cause.

**The one that matters: a blank product row could not be sent, and that stopped the whole plan
syncing.** "Add Product" hands the user a row with no item, and a row with no item has no building
to require, so the planner writes `buildingRequirements: {}`. `buildingRequirementSchema` demands
`name` and `amount`, so the op carrying that row comes back `invalid` — three of them in a row
pause the room, and from that moment the tab sends nothing at all: not the item the user then
picks, not anything after it. **This is the "sync doesn't work" report.** The two halves:

- **It is invisible at full speed.** The blank row and the chosen item land in one debounced op, so
  the invalid intermediate never reaches the wire. Under `E2E_CPU_THROTTLE=6` the debounce fires
  between the click and the choice every single time: `live-propagation` failed 6/6 before and
  passes 9/9 after, and the same two tests failed identically at `b0568fa2`, so this is the
  branch's own bug and not something the verification round introduced. **Any "it only fails on
  CI" sync report starts with the throttle, not with a re-read.**
- **Fixed the way `power` was, on both sides.** `productBuildingRequirementSchema` defaults the
  pair (plans holding `{}` are already in browsers and on the server, so no client fix reaches
  them), and the planner writes the zeroed shape. Not only at construction: `buildings.ts` resets
  `product.buildingRequirements` to `{}` on **every** recalculation for a row it cannot cost, and
  that reset is what actually put it on the wire. Fixing the constructor alone left the test red.

**And the amplifier that turned it into silence: a paused room never resumed.** `REJECT_PAUSE_AFTER`
is 3; `resumeRoom` existed and *nothing called it*, `flushRoom` and `probeRevision` both require
`synced`, and `rebase` deliberately leaves a pause alone. So the tab was receive-only for the life
of the page, with no indication, until a reload. The idle probe now resumes a paused room rather
than skipping it — the streak's real job is the retry *rate*, not permanence. Worth remembering as
a shape: **an exported recovery function with no caller is a silent failure waiting for its
trigger**, and this branch's follow-up list already names two more of them.

Then three of the same class as the fixes above, all in the load chain and the activity tracker:

**The rule the load chain now obeys, stated once: a chain owns the tab it started on, and
anything else that wants to change that plan queues a whole copy behind it.** Two ways it was
still broken:

- **Switching tabs mid-stagger appended the loading plan onto the new tab.** `loadNextFactory`
  pushed through `factories.value`, which resolves to whatever tab is current at that instant, so
  a click on another tab part-way through a staggered load moved the remaining pushes onto it.
  The chain now holds the tab it began on. Guard: `app-store.spec.ts` "should not push the loading
  plan into a tab the user switched to" (fails with the getter restored, `['Other One', 'B']`).
- **A snapshot the user's edits fought with was handed the live array.**
  `reloadTabFromMirror` passed `currentFactoryTab.value.factories` straight to `prepareLoader`,
  and while a chain was still staggering that array was being appended to, so the queued load
  committed the room's plan with duplicates on the end. It takes a copy now, exactly as
  `writeContentToTab` already did. Guard: `room-sync-store.spec.ts` "does not duplicate the plan
  when a recalculating snapshot lands mid-stagger" (fails without it, `['Mine', 'Beta', 'Beta']`).

**"Last updated" dropped any edit followed by a tab switch inside 300ms.** The burst was
fingerprinted against whatever tab was current when the debounce fired; by then that is the new
tab, whose prints were reseeded on the way in, so the edit read as no change and no tab was ever
stamped. The tab watcher flushes an outstanding burst against the tab being left, while its
prints still describe it. The `isLoaded` guard moved out of the shared settle and onto the timer
path only: a burst announced while loaded must still be honoured when the switch that flushes it
has already started the next tab's load. **This is only visible by hand** — every unit test and
every e2e test paused long enough for the debounce to fire first.

**Vuetify only honours a snackbar's `z-index` prop when the overlay stack is empty.**
`useStack` computes `lastZIndex + 10` from the top of the global stack and falls back to the prop
only when nothing is in it, and `_disable-global-stack` does not change that — it only stops the
toast pushing itself on. So a toast raised with the account tray open sits at 2010, not the 2600
it asks for, and `.bottom-notices` is 2400. Measured both ways: with nothing else open the toast
is 2600 and paints over the red health banner; with the tray open it is 2010. No reachable path
puts a bottom notice under an open tray *and* a toast at the same time (entering offline mode
empties `.bottom-notices` in the same tick), so this is a trap rather than a live bug — but it is
the reason to check the computed value rather than trust the prop.

**Driving it by hand is what found the "last updated" one, and it is worth repeating.** The pass was two
browser contexts against a stack of one's own: `MongoMemoryServer` for the database, the compiled
`backend/dist/main.js` under a supervisor that stops and starts it on a dropped file, and
`vite preview` on the built bundle. Owning the API process is what makes "stop the backend
mid-session" a real test rather than a mocked one. What it showed, all correct: a product added on
either side rendering on the other with no reload, the sidebar listing the active tab across three
switches, the deletion notice sticky with a Dismiss button on the other window and *nothing* on
the one that asked for it, the offline notice draining its bar and going away while the tab-bar
chip stays, and the red banner appearing when the API stops answering and clearing when it comes
back. Two of the three failures in the first run were faults in the harness, not the app — a
Vuetify picker's search input again, and taking "the tab that is not the room" from a browser that
also has its original default tab.

## Flagged follow-ups, none of them blocking

Re-checked line by line against the code on 2026-08-31, in the verification round. All still hold.
Re-confirmed by grep this pass: the NestJS API really has no `/version` route, `loadServerPlan` is
called by nothing but its own spec, `updateFactories` is declared as an emit in two components and
fired by neither, and `share/[id].vue` still has its three `alert()`s. The changelog entry that
used to sit here is gone: the merge closed it, and a struck-through line is not worth carrying.
`resumeRoom` was on this list's implicit shape too and has now been fixed rather than flagged (see
the verification round above) — dead recovery wiring is the one kind of follow-up that costs data
rather than tidiness, so treat the two remaining dead-wiring entries as smaller only because
nothing routes through them. The first two below are from the round-three race audit.

- **The op fan-out rides on registry membership, not on a fresh check.** `broadcastOp` sends the
  sender's diff to every socket the registry holds in that room, so between the epoch write in
  `unshare` and the asynchronous `revokeAccess` sweep, a concurrent peer's diff can still reach a
  socket that was revoked a moment earlier. Bounded and small: that peer already holds the whole
  room from its own join, so what escapes is the edits made in those milliseconds, not the plan.
  Re-authorizing per peer per op would cost a room read on the hottest path, which is why it was
  left; dropping the room from the registry synchronously at the emit, rather than in the async
  sweep, is the cheap version of the fix.
- **`share()` does not carry `deletedAt: null` into its write.** A share racing its own room's
  delete can set `shared: true` and a slug back onto a tombstoned room. Nothing is disclosed —
  every read path either filters the tombstone or refuses on it, so the room stays inert — but
  the slug is stranded until the sweeper drops the room. `rename` and both password writes have
  the same missing term, in the harmless direction. One clause in the filter closes it.

- **`revokeAccess` closes the whole socket, not just the room.** Still true for the two real
  revocation levers: `room.gateway.ts` drops a *deleted* room from each connection and leaves the
  socket alive, and now does the same for a member who left, which is right — one socket
  multiplexes every synced tab — but unshare and password rotation close the connection `4403`,
  which the transport reads as "stop reconnecting". Milder than it sounds, because the client
  works around it: `onSocketStopped` in `room-sync-store.ts` drops the named room and calls
  `start()` again, so the cost is a full teardown, reconnect and re-join of every other room
  rather than being offline until a reload. A `room_revoked` frame mirroring `room_deleted` is
  still the cheap fix.
- **Adoption and joined-tab upgrade are sequential by necessity.** `adoptTabs` and
  `upgradeJoinedTabs` in `rooms-store.ts` walk their tabs one at a time, because each server
  call is a chain of non-transactional ensure-steps and there is no transaction to make a
  batch atomic. A failure part-way leaves some tabs adopted and the rest local; they are
  simply re-offered at the next login. Parallelising or batching this is a replica-set
  conversation, not a client one.
- **A rebase does not re-establish the group-contiguity invariant.** `overlayIntent` rebuilds
  the plan as the server's order plus every locally-created factory appended, so a factory
  added here and then rebased lands at the end of the array rather than in its group's block —
  the invariant `factory-groups.ts` opens by declaring. Marking the reindex ripple (above)
  keeps the `displayOrder` values consistent, so a later `regenerateSortOrders` puts it back,
  but nothing in the rebase path calls `sortFactoriesByGroup`. Doing so after the overlay looks
  like the fix; it was out of scope for a review-fix pass.
- **Two writes still announce nothing at all**, both pre-existing and neither a sync bug in
  itself: `DroneCalculator.vue` (see below) and `updateProductSelection` in `Product.vue`,
  whose Uranium/Plutonium-waste branch clears the product and returns before `updateFactory`,
  so the clear is not even persisted until the next action.
- **`GET /version` does not exist on the NestJS API.** `web/src/utils/version-check.ts` polls it,
  so upstream's release notifier (#587) is inert — silently, by design. Adding the route also
  means deciding whether it joins `/health` and `GET /share/:id` on the version-gate exemption
  list, which is a reviewed contract, so it was left alone rather than decided in passing.
- **The `?setupDemo=true` demo path must stay silent, unlike the button.** `app-store.ts` loads the
  same demo when that query string is present, and it deliberately declares nothing. It runs during
  store construction, before `room-sync-store` exists to hear an emit, and on a synced tab the join
  snapshot then overwrites the demo — which fails in the safe direction. Adding `markPlanReplaced`
  there would invert that: the demo would claim authorship and overwrite the account's real plan on
  the next rebase. The changelog dialog's "Open Demo" button uses this path (`href="/?setupDemo=true"`),
  so it is user-reachable, not dev-only as an earlier note had it.
- **`loadServerPlan` in `app-store.ts` is dead wiring, and arrived from main.** It restores a
  plan from the account and is exported, but nothing outside its own spec calls it: its v6 UI
  (`Sync.vue`, the OOS dialog, the force-download button) is what this branch deleted. It is
  correctly silent as it stands — it flags the app as loading first, so it is a load rather than
  an edit — but anything that wires it back up to a button needs `markPlanReplaced` and the four
  `markTabEdited` calls for the tab fields it overwrites.
- **`updateFactories` is dead wiring.** `PlannerFactoryList.vue` and `PlannerSidebarContent.vue`
  both declare the emit and neither ever fires it, so `Planner.vue`'s `updateFactoriesList` — a bare
  `setFactories` with no declaration — is unreachable. Worth deleting; if anything ever wires it up
  instead, it needs `markPlanReplaced` first.
- **A voided membership row still counts toward the 25-membership cap** until the cleanup
  deletes it. Deliberate: re-stamping a row the user already holds costs no capacity, and the
  sweeper reclaims it.
- **`web/src/pages/share/[id].vue` still uses three blocking `alert()`s** for a bad or
  unparseable snapshot link. Everything built for v0.7.0 uses the toast bus; these predate it and
  were left alone deliberately, but they are the last blocking dialogs on a sync path.

## Preview deployment (2026-08-31): live

PR #620 carries the `deploy-preview-api` label, so every push redeploys the preview API
(`api-preview.satisfactory-factories.app`, port 3002) from the branch head. Verified live:
`/health` ok with Mongo connected, `/login` without `X-App-Version` answers 426, and a raw
HTTP/1.1 upgrade to `/ws` returns 101 through the tunnel (curl speaks h2 by default and gets
a 404 that looks like a missing route — always probe websockets with `--http1.1`). The
preview stack's own env supplies `JWT_SECRET`, `PORT=3002`, `MONGODB_URI?authSource=admin`
and `CORS_EXTRA_ORIGINS=*.vercel.app,...`; the branch honours the last one in both the HTTP
CORS callback and the WS upgrade check (`backend/src/config/cors.ts`, hostname-parsed
wildcards). While this branch is loaded, main-based previews get 426s — re-run "Backend:
Deploy Preview" against `main` to put it back; nothing does that automatically.

## The CI hardening round (post-PR, 2026-08-31): what the slow runner exposed

Five pushes to green after the PR opened; the same one concurrency test failed each time and
its cause was different at each layer peeled. Keep these, in order of generality:

- **`E2E_CPU_THROTTLE=6 pnpm exec playwright test` reproduces loaded-CI timing on any
  machine** (a CDP `setCPUThrottlingRate` hook in `e2e/helpers/accounts.ts`). The baseline
  failed 1 in 8 throttled where a fast machine passed 12 straight; every future "CI-only"
  e2e flake starts here, not with pushes at CI.
- **Never anchor an e2e action on position or name when a collaborator can mutate the DOM
  between actions.** `.last()` re-resolves per action (a remote factory landing between fill
  and commit put the note in the other client's card), and two simultaneous Adds both hold an
  identical default-named record once one flushes. The one client-local marker is **focus**:
  Add Factory now lands the cursor in the new name field and the helper anchors on
  `input.factory-name:focus`.
- **A rename committed through `props.factory` can land on a detached object** — a rebase
  replaces factory records wholesale, and the commit then never syncs. `commitName` writes
  through the store's live record by id, and an inbound apply no longer clobbers a *focused*
  draft (the user's later commit wins as any content edit does).
- **Post-commit fan-out is best-effort, so a lost `op_apply` needs an active healer**: every
  idle synced room re-joins with its acked revision each `REVISION_PROBE_MS` (10s); the
  server answers `up_to_date` or a healing snapshot. Never fires mid-edit, in flight, or
  offline (`probeRevision` in `room-sync-store.ts`).
- The suite-wide expect ceiling is 30s (`playwright.config.ts`): honest worst-case
  convergence is rebase churn + the 10s probe cycle + the 5s mirror interval on two cores.
- The backend vitest suite runs with `.env` ignored (`ignoreEnvFile` under `VITEST`, env
  from `test/utils/env-setup.ts` which runs before module import) — before that, the suite
  silently tested against a real localhost Mongo wherever one listened, because Nest bakes
  config at import time and the committed `backend/.env` beat `process.env`.
- CI installs need dependency-closure filters: `--filter web...` (three dots) in both
  `web/vercel.json` and `build-web.yml`, because web compiles `common`'s source.

## Three defects found by the e2e suite, all fixed here

Keep these: the shapes recur, and the second one bites twice.

- **The render mirror lags the engine, so every assertion that reads it must poll.**
  `localStorage.factoryTabs` is written on the persistence debounce; `tabMirrorMeta` — the
  revision and the outstanding-intent set — is written eagerly by `persistMeta`. So a harness
  check that waits on revision and quiescence and then reads the mirror is reading a store that
  has not caught up yet, and `expectConverged` does not save it: that compares the two clients'
  mirrors to each other, and two clients equally behind are equal. Measured on the notes race at
  4 stale reads in 6, always correct a moment later, failing about one run in three. `mirroredNote`
  is the raw read and `expectMirroredNote` is the polled one; the concurrency tests were the only
  ones using the raw form for a cross-device check, and now do not. **This looks exactly like a
  lost edit** — the mirror shows the seeded value and the assertion says the user's note vanished
  — so the first instinct is to go hunting in the rebase. Check the timing before the engine:
  add a settle and re-read, and if it converges the engine was never wrong.

- **An uncalculated factory is a valid factory now.** `newFactory()` used to leave `power` as
  `{}` and nothing recalculates on add, so the first op after every "Add Factory" was refused
  by the zod schema (it self-healed through reject → rebase → recalc → resend, at one round
  trip each) and adoption of a plan holding such a factory failed outright with
  `400 invalid_payload`, with no retry behind it. Fixed on both sides deliberately:
  `factoryPowerSchema` defaults `consumed`/`produced`/`difference` to 0 and `power` itself
  defaults to the zeroed object, because plans in the old shape are already in browsers and
  no client-side fix reaches them; and `newFactory()` plus the `initFactories` migration now
  produce the zeroed shape, so the common path never relies on the server filling anything in
  and two clients never disagree about a factory's bytes.
- **`factoryEdited` is intent, and only a user action may emit it.** The sync engine treats
  `factoryUpdated` as payload and `factoryEdited` as intent, and a rebase overlays *only*
  touched factories — so any content edit that never declared intent was discarded by every
  recovery path, offline exit included.

  **The trap, which cost a full e2e run to find: the emit must not come from a Vue watcher on
  the data.** A `watch(() => props.factory.notes)` also fires when an inbound op rewrites that
  note, so the client marks a factory it never edited as touched — and nothing clears intent
  that no diff can satisfy, so it overlays its copy over that peer's edits from then on. The
  notes card therefore emits payload from the watcher and intent from `@update:model-value`
  and the Clear button; everything else emits from click/input handlers, which are always safe.

  **`web/src/utils/sync-intent.ts` is now the one door.** `markFactoryEdited` emits payload and
  intent together, `markTabEdited(field)` does the tab-owned half (`powerTarget`, `groups`), and
  `captureOrder` + `markReorderedFactories` cover the reindex ripple — a move, copy, regroup,
  add or delete rewrites `displayOrder` across the whole plan, so the records that changed are
  never only the one clicked. `markPlanReplaced(before, after)` is the bulk form, for anything
  that swaps the whole plan out: `clearFactories` in `app-store.ts`, the template loader, and the
  demo-plan button in `Introduction.vue`.
  Everything that edits stored content calls one of those: the name
  field and hidden/game-sync chips (`PlannerFactory.vue`), tasks, notes, icon, groups
  (`useFactoryGroups.ts`), show/hide-all and the reorder family (`Planner.vue`), the building
  groups row (`BuildingGroups.vue`, `BuildingGroupsSection.vue`), all five export calculators,
  blank product/generator/import rows, `usePowerTarget`, `addFactory`/`removeFactory` in
  `app-store.ts` for their own reindex, every checklist mutation (`checklist.ts`), the depot
  uploader count, the two research tiers (`useDepotResearch.ts`), and the three add-product
  dialogs (`AddToPlannerDialog.vue`, `AddShortageDialog.vue`,
  `PlannerFactorySatisfactionItems.vue`). Calculation entry points need no call —
  `calculateFactory()` already emits intent for the factory the user acted on — and the added
  or removed record itself needs none, because `markStructuralIntent` infers it from the diff.
  Only the record is inferred, though, never the reindex it caused: that distinction is the
  one this rule keeps getting caught out on.

  Two deliberate exclusions, both load-bearing: the **room name** is server-authoritative
  (`ownsRoom` strips it from a member's diff and `room_meta` overwrites it), so no UI declares
  name intent; and **navigating to a factory** un-hides its card as payload only, because a
  jump restored from session storage on load must not claim the user's authorship. Separately,
  `DroneCalculator.vue` holds `droneTime` in a detached `ref` and never writes it back to the
  factory at all — a pre-existing persistence bug, not a sync one, and untouched here.

Why any of this exists: the old sync uploaded only the active tab as a bare `Factory[]`
(dropping tab-level fields) and any client could clobber the account's data. See
[[project-tab-sync-v2]] for the per-tab prototype this supersedes, [[calc-engine-gotchas]]
before touching the diff/op builder, and [[fontawesome-dynamic-icons]] for the tab-state icons.

How to apply: the plan wins over this summary — read it before changing anything sync-related.
Before merging, the PR body needs the manual box steps at the top, verbatim from
`docs/deployment.md`'s "Required configuration": `JWT_SECRET` must exist in the box's env file
(boot now refuses to start without it), the box's own compose file must probe `/health` rather
than the removed `/hello`, and the tunnel in front of the API must forward WebSocket upgrades
to `/ws` on the same origin as the REST routes.
