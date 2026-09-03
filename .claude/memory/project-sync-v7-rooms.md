---
name: project-sync-v7-rooms
description: v0.7.0 realtime rooms sync — built and green on branch claude/sync-mechanism-refactor-7b021b; contract in .claude/plans/sync-v7-realtime-rooms.md, file map and follow-ups here
metadata:
  type: project
  volatility: hot
  lastVerified: 2026-09-03
---

The v0.7.0 headline feature (version 0.7.0): realtime WebSocket sync with rooms, replacing the
10-second last-write-wins blob sync, plus a NestJS backend rewrite. The binding contract is
`.claude/plans/sync-v7-realtime-rooms.md` (revision 9, reconciled with the shipped build).

**Status: shipped for review as PR #620 (opened 2026-08-30) from branch
`claude/sync-mechanism-refactor-7b021b`; not yet merged. Since 2026-08-31 the PR targets the
`beta7` integration branch, not `main`.** `beta7` is the v0.7.0 beta line: a group of test
users validates the sync feature on its Vercel branch preview (previews point at the shared
preview API) before anything reaches `main` and production. The four CI check workflows list
`beta7` beside `main` in their `pull_request`/`push` branch filters; the production deploy
workflows stay `main`-only on purpose, so merging into `beta7` deploys nothing. Branch
protection and required checks on `beta7` are not configured (repo settings, owner's call).
The PR body carries the three
manual box steps and the deliberate 0.7.0-over-0.8.0 version choice. The e2e CI job's first
live run happens on that PR. Every task line in the plan is delivered bar the four
deliberate v0.7.0 follow-ups (history UI, presence beyond an occupancy count, email password
reset, the v0.7.0 changelog modal). Three adversarial Codex reviews of the finished diff raised
seven findings between them; all are fixed, and the sections below are what they were. A
verification pass over the round-two fixes found a further instance of the bulk-replacement
class and fixed it (the demo-plan button, below). Main has since been merged in (66 commits) and the two guarantees that merge could break were
restored: see "The merge from main" below. Green as of 2026-09-03, after the preview-testing rounds
below (load chain, quiet applies, the UI round) and the verification round that closed them:
backend 494 vitest tests (32 files), common 153 (6), web 3105 unit tests (164 files, 1
skipped), all measured 2026-09-03 after the account-recovery offer, rebased onto `747d9616`,
`vue-tsc` clean, root `lint-check` clean (64 pre-existing warnings in `parsing/`, 0 errors), root
`build` clean, and all 45 Playwright e2e tests passing (the 44th and 45th added in the offline
conflict round). The whole suite ran twice at full speed
and once under `E2E_CPU_THROTTLE=6` in the bulk-removal round below; the throttled run is the one
that earns its keep, and it is the one that found the last real bug in an earlier round.
The e2e job in CI has never actually run: it is validated locally only, so the first PR is where
it gets proved.

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
| Offline clash evidence, and the prompt that asks about it | `web/src/sync/offline-conflict.ts`, `components/sync/OfflineConflictDialog.vue` |
| Dev-only staging of that prompt (no server, no second device) | `web/src/sync/offline-conflict-demo.ts`, `utils/factory-setups/offline-conflict-demo-plan.ts` |
| Version header and the 426 path | `web/src/api/client.ts`, `components/sync/VersionPrompt.vue` |
| WS gateway, presence, fan-out, revocation | `backend/src/realtime/` |
| Rooms domain, ensure-steps, sweeper, activity | `backend/src/rooms/` |
| Scrape endpoint, usage heartbeat, fault counters | `backend/src/metrics/`, `event-counters/`, `room-totals/`, `user-activity/` |
| The browser half of those | `web/src/stores/telemetry-store.ts`, `events-store.ts`, `utils/record-event.ts` |
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
  diffs, client-side rebase (server never rebases), opId dedup ring of 50. The ring guards
  **ack replay**, not a client retry: an op the client gives up on is dropped, the room
  re-baselines, and what still differs goes out under a fresh opId. Nothing ever resends one.
- No Mongo transactions (production stays a standalone mongod): resume-aware ensure-steps,
  tombstone-first delete, hourly sweeper.
- Version gate via `X-App-Version` (only `/health` and `GET /share/:id` exempt); `/hello`
  dropped; pre-v7 clients are cut off at backend deploy.
- Adoption replaces migration: per-login, per-browser, create-only; the legacy blob and the
  shares collection are never rewritten.
- Offline mode is first-class (manual airplane switch + detection prompt).
- Caps: **150 factories per room** (2026-09-03, was 300), 10 owned rooms, 25 memberships per
  user. Activity is recorded (who/when per op) but has no UI in v0.7.0.
- **Invite slugs stay three words from the 72-word list** (2026-09-03). 72³ is 373,248, so a
  determined enumeration finds shared rooms; the throttle on the slug lookup is the accepted
  defence and the maths is acknowledged rather than disputed. Revisit if abuse appears.
- **The revocation fan-out window is accepted, tracked as issue #640** (2026-09-03). Closing it
  properly costs a room read per peer per op on the hottest path, which is not worth what
  escapes: the edits made in the milliseconds between the unshare write and the async sweep.
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
driving. Nothing was deleted, and `GET /version` has since landed (below), so upstream's release
ping works as it was intended to.

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

## Calculating and pacing the render are two questions (2026-08-31)

The instant path above landed answering one question for both, and the preview showed the cost:
a switch to a big tab had nothing to calculate, so it skipped the recalculation (right) and the
loader with it (wrong). The click produced no movement whatsoever, and then the tab locked up
for the length of the render. [[rendering-rework-loader-intent]] predicted this exactly — the
75ms stagger is not cosmetic, it paces the render, and it stops being load-bearing only once
rendering is on-select, which is still not built.

The two gates are now separate. Calculation is still decided by the plan's own state
(`needsCalculation`, `forceRecalc`). Pacing is decided by size: `needsPacedRender` in
`web/src/utils/render-pacing.ts` draws the line at more than `PACED_RENDER_FACTORY_COUNT` (10)
factories, the same number `Loading.vue` warns the user at, and both now read that one constant.
`canRenderInstantly` refuses a plan over the line however current its mirror is, and
`shouldStagger` takes the plan as an argument and returns true for one — so both the instant path
and the "nothing was calculated" fast paths in `runLoad`/`startQueuedLoad` land on the staggered
chain. It is the same chain as ever, so `incrementLoad`, the progress bar and `loadingCompleted`
all still fire, with no recalculation anywhere in it.

**The overlay has to be announced before the work, not after it.** `runLoad` emits
`prepareForLoad` at the top for a plan over the line and then yields a frame (`nextPaint`, the
awaitable form of the existing `afterPaint`): everything after it — validation, migration, the
mount storm — blocks the main thread, and an overlay raised on the far side of that is an overlay
nobody sees. The counts are announced again from the plan that really loads.

Quiet applies stay quiet: none of this touches `reloadTabFromMirror`'s active-tab guard or
`onSnapshot`'s "only when the rebase recalculated" rule, so a background snapshot still raises no
overlay. Guards: `app-store.spec.ts` "a plan too big to render in one flush" (three cases, one
spying on `calculateFactories` to prove nothing was calculated) and the e2e `sidebar-tabs` case
"opening a big tab raises the loader, and opening a small one does not". Both were negative
controlled by neutering `needsPacedRender`: three unit failures and the e2e overlay assertion.

## `GET /version` came back (2026-08-31)

The NestJS rewrite dropped it and nothing noticed until the preview, where every client polls it
once a minute (`web/src/utils/version-check.ts`) and got a 404 each time. Restored as
`backend/src/version/` — controller, module and `app-version.ts` — answering `{ version }` with
`Cache-Control: no-store`, on its own throttle bucket of 30 a minute and outside the global one,
which is what the Express original did.

Two things about it are load-bearing. It is **exempt from the version gate**, unlike almost
everything else: its entire job is telling an out-of-date client that a newer build exists, and
the gate refuses exactly those clients. And the version is the **repo root manifest's**, found by
walking up from `process.cwd()` (and from `__dirname` when the module is CommonJS) for the first
manifest carrying a `version` field — only the root has one. A fixed `../package.json` happens to
work in the image and under `pnpm dev`, both of which start in `backend/`, but the walk costs
nothing and does not care. `APP_VERSION` still overrides, and an unreadable manifest degrades to
`"unknown"`, which the planner's comparison rejects, so the failure mode is "no update offered"
rather than a false one.

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
where a `data-testid` on the component falls through to the `.v-overlay.v-dialog` root that
wraps the whole dialog (checked 2026-09-01: `VOverlay` merges fallthrough attrs onto its root
div, not onto `.v-overlay__content`) and stays reachable from the e2e suite. That root is
removed on the leave transition, so `toBeHidden()` on it still tracks a closed dialog.

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

## Advisory field locks (2026-08-31): the protocol and gateway half

One editor per input, so two people cannot type into the same notes box and have the last
write win. Built server-first: `common` carries `lock`/`unlock`/`field_locks` and
`FIELD_LOCK_TTL_MS` (10s), `backend/src/realtime/field-lock.service.ts` holds the maps and
the gateway does the rest. The client half (claim on focus, throttled renewal on keystroke,
release on blur, disable a peer-held field) is a later stage; nothing in the UI reads a lock
yet.

Five decisions worth not re-deriving:

- **`holder` is the socket's `connectionId`, new in `hello_ok`.** Per connection rather than
  per account: a visitor has no `userId`, and two tabs of one account must not silently share
  a lock. A client reads a `field_locks` frame by comparing each `holder` against the id it was
  handed, which is the whole mechanism — no per-recipient `mine` flag, one identical frame to
  the room.
- **Advisory in the strict sense.** The op path neither reads nor enforces them, so a wrong
  answer costs a disabled input and never an edit. That is what lets everything else here be
  cheap.
- **A renewal costs no frame, and a refused claim costs no frame.** `claim` returns whether
  the room's *visible* locks moved; a keystroke renewal moves nothing anyone can see, and a
  claim on a field somebody else holds is refused by simply not granting it, because the last
  broadcast already said whose it is. Only real changes broadcast, and each one restates the
  room's whole list.
- **Expiry is lazy plus a sweep on the existing heartbeat, so no timer is held per lock.** The
  lazy check is what decides correctness — an expired field is granted to the next claimant on
  sight — and the sweep only decides how soon the room is *told*, which is up to
  `WS_HEARTBEAT_INTERVAL_MS` (30s) behind. That is why `FIELD_LOCK_TTL_MS` is exported from
  `common`: the client may drop a displayed lock that long after the frame announcing it,
  rather than waiting on the sweep, and a field left disabled by a stale display is exactly the
  case nobody can claim their way out of.
- **Locks take the same live access check an op does**, and release on every path that drops a
  socket from a room: unlock, expiry, `leave`, disconnect, the revocation kick and
  `room_deleted`. `RoomAccessService.authorize` is the door, so a claim from a socket whose
  membership was voided with the kick lost is refused and the room dropped, the way a malformed
  op frame already was.

Caps are in `common/src/caps.ts`: `fieldKey` 128 characters (zod, so an over-long key is an
`invalid_message`) and `fieldLocksPerConnection` 32, counted across every room on the socket
and enforced in `claim`. `backend/test/ws-field-locks.spec.ts` (17 tests) drives real `ws`
clients and a `FakeClock`; the four that carry the design were negative-controlled by
mutation — steal-the-lock, drop the cap, never expire, never extend on renewal.

### The client half, and the notes field it was proved on (2026-08-31)

`useFieldLock(roomId, fieldKey)` in `web/src/composables/useFieldLock.ts` is the whole
binding: focus claims, input renews, blur releases, and `disabled` plus a one-line hint come
back reactive. `web/src/components/planner/PlannerFactoryNotes.vue` is the first and so far
only caller; a second field is one more call and nothing else, because the key
(`notes:<factoryId>`) is minted client-side and the server never looks inside it. The state
and every frame live in `room-sync-store.ts` (`lockedByOther`, `claimField`, `renewField`,
`releaseField`, `releaseAllFields`, and `fieldLocks` / `connectionId`).

Five things about it that are not obvious from the code:

- **A frame is only sent for a *shared* room.** `canLock` wants `isCollaborative(tabState)`,
  a connected socket, and the room `synced`. So a local tab, a private synced tab and a
  paused or joining room all no-op. The private-tab case is a deliberate scope choice
  rather than an oversight — two devices on one account can still race a notes box, and
  dropping the `shared` requirement is the whole fix if that is ever wanted.
- **The client releases its own claim on the TTL; it never expires one it was shown.**
  Those are two different clocks and only the first is safe. A renewal is deliberately
  silent server-side, so a peer typing steadily sends no frames at all — a display timer
  would re-enable a field somebody is actively in. Giving up our own at ten seconds is what
  makes the release prompt, because the server's sweep is up to a 30s heartbeat behind. The
  e2e proves both directions, and the negative control is exact: neuter the renewal and the
  "still typing" assertion fails; neuter the client's own idle release and the "lapses on
  its own" assertion fails at 25s while the sweep is still coming.
- **The display is dropped whole when the socket falls over.** A re-join is told a room's
  locks only when the room holds some, so a display carried across the gap would disable a
  field nobody is in with no frame coming to correct it.
- **A tab switch is a blur the field never gets** — the card unmounts first — so the store
  watches the current tab id and releases everything it holds. Offline mode releases before
  it stops the socket, in that order.
- **The renewal throttle is 3s** (`FIELD_LOCK_RENEW_MS`), so a typist costs one frame every
  few seconds, and the idle timer is reset only by a frame that was actually *sent*, which
  is what keeps the client's clock and the server's the same one.

The hint is `Another builder is editing this`, rendered through the input's own `:messages`
row: that row already exists for the character counter, so a lock costs no layout jump. It
is amber (`var(--sf-warning)`) and the details row is un-dimmed, because Vuetify renders a
disabled input's messages at 38% and the one line explaining why the field will not take a
keystroke is worth reading.

Out of scope, in Matt's words: "two people pressing the up and down arrows on any numerical,
we can't really do anything about that" — a spinner is not a focused edit and a lock cannot
help. The follow-up fields, in the order they are worth doing: the factory name, tasks,
group names, and the export calculator's inputs.

`web/e2e/tests/field-locks.e2e.ts` is the two-client proof and it is one of the slower files
in the suite (~35s), because the ten seconds are real: there is no compressed clock for the
TTL the way `E2E_PROBE_MS` compresses the revision probe.

## The account panel split (2026-08-31): Local and Cloud

`AccountPanel.vue` now puts the plan lists behind a compact two-tab control (`v-tabs`,
testids `plans-tab-local` / `plans-tab-cloud`, panes `local-pane` / `cloud-pane`). **Local**
lists every tab whose `getTabState(...).kind === 'local'`, each row with a share button
(opens the existing `ShareDialog`, whose local-tab path already offers the snapshot link and
explains why invites need sync) and a `fa-cloud-upload-alt` convert button that calls
`roomsStore.adoptTabs([tabId])` — the same adoption path as the sign-in offer, so rekeying,
name collisions and the offline gate all come for free. **Cloud** splits `roomsStore.entries`
by `role` into "My Plans" (owner) and "Joined Plans" (member; the section hides when empty),
keeping the per-room share button, Shared chip and last-changed time. The Member chip is
gone — the grouping states it. Anonymous `joined`-kind tabs are not listed under Cloud: they
have no `RoomListEntry`, and a logged-in session upgrades them to memberships anyway.

**Recover server copy is gone.** Login pulls the account's rooms and `autoImportLegacy` in
`rooms-store.ts` still recovers the old blob for an empty browser, so the manual button had
no job left. Removed: the button, its handler, and `legacyRecover` in `web/src/api/client.ts`.
Kept deliberately: `legacyAutoImport` (called by the store), the backend
`POST /rooms/legacy/recover` route and `LegacyImportService.recover` (auto-import calls it),
and the snapshot-share endpoints. The FA-name sweep note above that mentions the Recover
button describes a state this section supersedes.

## Cloud plan offload (2026-09-01): the tab bar is the open set

The model, binding since this round: **a cloud plan is OPEN in a browser when a local tab
exists for its roomId, and HIDDEN when the account room exists with no local tab.** The tab
bar is the per-browser open set and nothing extra is persisted — hidden is simply "no tab".
Hiding never touches the server room or the membership.

- `applyRoomList` in `rooms-store.ts` **no longer creates tabs**: it updates state and tracks
  only rooms that already have a tab. That is what makes hidden survive refreshes, reconnects
  and logins, and it means a room made on another device no longer pops into this bar. Its
  old "brings in a room made on another device" spec now asserts the opposite.
- `openPlan(roomId)` / `hidePlan(roomId)` on the rooms-store are the only two doors. Open adds
  an empty tab from the list entry, sets state, tracks (the WS join fills the content, same as
  any synced tab) and activates. Hide steps off the viewed tab first (neighbour right, else
  left), refuses to empty the bar, then `untrackRoom` + `appStore.removeTab` (new; never below
  one tab, selection preserved). Both are idempotent; both refuse offline through `blocked()`
  with a toast emitted in the store (`refuse()`), so no caller can swallow it.
- **Login opens nothing on its own.** `begin()` connects and pulls the list only. Which rooms
  to open on a fresh interactive login is the caller's decision through `openPlan` — that seam
  is where the next stage's login chooser plugs in. Same-browser logout/login still restores
  the open set for free, because signOut leaves the tabs in the bar as local copies and the
  next `applyRoomList` re-marks the ones the list still carries. The one auto-open kept:
  `autoImportLegacy` opens the recovered room, because its toast promises it is on screen.
- The panel rows (`CloudPlanRow.vue`, used by both My Plans and Joined Plans) are two lines:
  name + Show/Hide button (testid `show-plan`/`hide-plan`, with `data-room-id` for e2e), then
  `factoryCount` + relative last-changed with the absolute in a tooltip. The per-row share
  buttons are gone from the panel (local rows included); sharing lives on the planner toolbar
  and, next stage, in the tab settings modal.
- `factoryCount` was added to `RoomListEntry` (common type + backend `toListEntry`, covered by
  a `rooms.spec.ts` test). Additive REST field, `PROTOCOL_VERSION` untouched. There is no zod
  schema for REST responses (only request bodies and WS frames), so no schema change existed
  to make. Backend is now 300 vitest tests; web 2830 (1 skipped) with the new hide/open,
  panel-row and `removeTab` specs. The hide guard specs were negative-controlled: neutering
  the last-tab guard makes "refuses to hide the last tab" fail.
- The e2e suite leaned on auto-open everywhere a second device appeared. `showPlan`/`hidePlan`
  helpers in `e2e/helpers/rooms.ts` open/close a plan through the panel by `data-room-id`;
  `syncedPair`'s second device uses it, as do tab-lifecycle, invite, preferences,
  offline-manual, offline-detected, loading-tab and adoption. A reorder no longer reads as a
  change just because hidden rooms exist: the `sameOrder` comparison filters entries to those
  with tabs.

The share-button and last-changed sentences in the account-panel-split section above describe
a state this section supersedes.

## The login plan chooser (2026-09-01): interactive sign-ins pick their open set

Only an interactive sign-in asks. The discriminator is the `loggedIn` event, which auth-store's
`login()` alone emits: its listener runs `begin({ interactive: true })`, which becomes
`refresh({ offerChooser: true })`. Auth.vue's onMounted path (persisted token validated on page
load) calls `begin()` bare, so a refresh never shows the dialog — that suppression is
negative-controlled in the spec (defaulting `interactive` to true fails exactly the
"never asks on a page refresh" test).

- `openPlanChooser(list)` in `rooms-store.ts` filters the room list to entries with no tab
  (the hidden set) and opens `PlanChooserDialog.vue` (built on the `AdoptionDialog` pattern:
  per-id checkboxes, all ticked, testids `plan-chooser-dialog`/`chooser-candidate`/
  `chooser-submit`/`chooser-decline`). Zero unopened rooms means no dialog, which is also what
  keeps a just-registered user out of it.
- Submit runs `openChosenPlans` (each id through `openPlan`, so the WS join fills content);
  "Not now" runs `closeChooser()`. Both count as an answer. **The adoption offer is parked
  while the chooser is up** (`parked` in `refresh`, which since the recovery offer below holds
  two offers rather than one) and runs on the answer, so the login dialogs never stack;
  `closeChooser(false)` — sign-out's cleanup — drops what was parked without answering,
  mirroring `declineAdoption()`'s remember split. There is no
  answered-once flag for the chooser: every interactive login with hidden rooms asks again,
  by design.
- The dialog rows read name + `factoryCount` + relative `lastActivityAt` straight from
  `entries`, and a candidate whose entry vanished mid-dialog is filtered out rather than
  crashing the row.
- e2e: `signIn` in `e2e/helpers/session.ts` grew a `chooser` option (`'open-all'` default,
  `'not-now'`, `'none'` for accounts that cannot show it — the helper *waits* for the dialog
  unless told `'none'`, so a roomless sign-in must say so). `showPlan` is now ensure-open (a
  plan the chooser already opened is left be), which the adoption and preferences suites lean
  on. `login-chooser.e2e.ts` proves "Not now" plus the reload suppression end to end.
- Counts after this round: web 2850 unit tests (1 skipped) across 153 files; the store spec
  holds 86 and the new dialog spec 10.

## The account-recovery offer (2026-09-03): the old save, offered on sign-in

The blob import has existed server-side since the first backend commit, but `autoImport` fires
only for an account with no rooms **in a browser with no local tabs** — so the returning user
who already has plans in this browser, which is most of them, could never reach the plan their
account saved before v0.7. There was no UI for it at all: the plan's "Recover server copy"
button was never built. The owner chose the offer-on-login shape over a button in the panel.

- **`GET /rooms/legacy/status` → `{ exists, factoryCount }`** (`legacy-import.service.ts`
  `status()`, route in `rooms.controller.ts`). Guarded, version-gated, and on the **global**
  throttle bucket exactly like `legacy/auto-import` and `legacy/recover`; it gets no bucket of
  its own because it is one authenticated projection per sign-in. The count comes out of an
  aggregation (`$cond` on `$isArray`, then `$size` over a `$filter` for object-shaped entries,
  which is what `loadBlob` keeps), so **the blob body never leaves Mongo** — the saves this
  exists for are megabytes. `exists` is false once `User.legacyImportRoomId` is stamped,
  because a stamped account is all `recover` would refuse: offering an import that can only
  fail is worse than not offering.
- **Eligibility is the account's, not the browser's.** An interactive sign-in whose room list
  holds no room this user owns (`role === 'owner'`), which is `offerLegacy` threaded from the
  same `interactive` flag the chooser uses. A page refresh with a persisted session asks
  nothing and does not even call the endpoint. Local plans are irrelevant, which is the whole
  point of the feature.
- **`LegacyRecoveryDialog.vue`** (AppDialog, testids `legacy-recovery-dialog` /
  `legacy-factory-count` / `legacy-submit` / `legacy-decline`, `fas fa-cloud-download-alt` —
  FA5, the v6 `cloud-arrow-down` name draws the dashed placeholder). It names the size and
  imports through the existing `POST /rooms/legacy/recover`, then `openPlan`s the room. That
  is what makes the migration work: `openPlan` mounts an **empty** tab and the socket join
  fills it, which is the `firstFill` branch in `onSnapshot` — the first snapshot of an empty
  tab goes through `reloadTabFromMirror` and the loader funnel rather than being written in
  quietly. Verified against the existing guards rather than reimplemented
  (`room-sync-store.spec.ts` "sends the first snapshot of an empty tab through the loader
  funnel" and "migrates a legacy-shaped plan the first snapshot brings in").
- **One dialog at a time.** `parked` in `rooms-store.ts` now carries both the adoption offer
  and this one; `runParkedOffers` releases the next one still due on every real answer, and a
  cleanup close (sign-out) drops them. The silent auto-import still owns the empty-account,
  empty-browser case, and `legacyImported` stops the offer asking for a plan it has just taken
  in the same sign-in. "Not now" writes nothing at all, so the next sign-in asks again — there
  is deliberately no answered-once flag, unlike adoption.
- **One cost worth knowing:** the check is awaited inside `refresh`, so for an account owning
  no cloud plan, `whenSessionReady()` now resolves one request later. That is what
  `TabSettingsDialog.spec.ts` had to mock `legacyStatus` for — its convert-to-cloud button
  waits on exactly that promise, and an unmocked call left the dialog stuck in its signing-in
  state.
- **No e2e case.** The harness cannot seed a blob: `MongoMemoryServer` lives in `global-setup`
  and its URI never reaches the workers, and no route writes `factorydatas`. Covered by unit
  tests instead (12 in `rooms-store.spec.ts`, 7 in `LegacyRecoveryDialog.spec.ts`, 7 in
  `backend/test/rooms-legacy-import.spec.ts`). Exposing the URI to the workers is what an e2e
  case would cost, and it would buy one dialog click.

## The tab settings dialog (2026-09-01): the pencil opens a dialog, and synced tabs wear a cloud

The pencil on the selected tab (`TabNavigation.vue`) no longer renames in place; it opens
`TabSettingsDialog.vue` (AppDialog, `sync/`, testid `tab-settings-dialog`, close button id
`close-tab-settings`). The pencil shows for **every** role now — the dialog explains what a
role may not do — so "a member is offered no rename" became "a member's name field is
disabled with the reason beside it" everywhere it was asserted.

- The name field always shows; Apply, Enter and blur all run the same `applyRename` (guarded:
  an unchanged name is a no-op, so the blur that a close click fires never double-sends).
  Everything goes through `roomsStore.renameTab`, refusals land inline (`rename-error`), and
  a non-owner gets a disabled field plus `rename-refusal` text matching the store's message.
- **No new store code was needed for the conversions.** Convert to cloud is
  `adoptTabs([tabId])` (the panel's path). Convert to local is `roomsStore.removeTab(tabId)`,
  which already does exactly the required semantics for all three roles: owner = server
  delete + `markTabLocal` (content kept; `selfRemoved` silences the echo), member = leave +
  keep, visitor = untrack + keep. The tab is never removed from the bar.
- The owner's convert to local sits behind an in-dialog confirm (`convert-to-local` →
  warning + `confirm-convert-to-local`/`cancel-convert-to-local`); the shared-plan copy says
  collaborators keep local copies. The gate is negative-controlled: wiring the button straight
  to `convertToLocal` fails 3 tests (the no-call-before-confirm one included).
- **Signed out, convert to cloud is the sign-in itself (2026-09-01).** Superseded: it used to be
  a disabled button under a `v-tooltip` telling the visitor to go and use the account button in
  the app bar ("You need to have an account for this, please register using the Sign in Pioneer
  button top right of the planner"). That tooltip and its spec are gone. The button is enabled,
  reads "Sign in to convert", and swaps the dialog body for `AuthForm.vue` (`signingIn` ref,
  `cancel-sign-in` Back button in the actions slot) exactly as `NewTabDialog.vue` does.
  - **There is no cross-component way to open the account tray, and adding one was not worth
    it.** `Auth.vue` opens its tray from a local `trayOpen` ref on a `v-overlay` with
    `activator="parent"`; nothing outside the component can set it, and the only inbound trigger
    is `sessionExpired`, which fronts the "Session Expired!" dialog first. So the reusable half
    of "the app's sign-in prompt" is `AuthForm.vue`, and there are now three hosts for it: the
    tray, the new-tab chooser and tab settings. An `openSignIn` event would also have put a
    tray overlay on top of an open dialog, which is a z-index and focus-trap gamble for nothing.
  - After `@authenticated` the handler awaits `roomsStore.whenSessionReady()` before dropping
    `signingIn`, for the reason `NewTabDialog` does it: adopting into a room list still in
    flight comes back missing and is reverted. The button then flips on the `isLoggedIn`
    computed alone, with the dialog never closed.
  - The reassurance copy under the signed-out button (`convert-cloud-reassurance`) is the
    owner's own wording with a `<strong>not</strong>`, and it is the first place in the planner
    that mentions an account at all. Signed in it is not rendered.
  - Negative controls, all three run: freezing `isLoggedIn` to a snapshot fails the flip test
    only; dropping the `v-if="!isLoggedIn"` on the copy fails 2; wiring the button straight to
    `convertToCloud` fails 3. `tab-lifecycle.e2e.ts` covers the whole flip in a browser.
  - The button's icon needed the keyed span and so did the dialog title's, which was missed
    first time round: `AppDialog` rendered `<i :class="icon">`, so the title said "Sign in to
    convert" beside a pencil until the wrapper was keyed there too. One fix in `AppDialog`
    covers `NewTabDialog` as well. See [[fontawesome-dynamic-icons]].
- **Share Settings is ungated (2026-09-01).** It used to render only under
  `isCollaborative(state)`, so a private synced tab (which is what a converted local tab
  becomes) and a local tab had no share entry point at all once the account panel's per-row
  share buttons went. The `<template v-if="collaborative">` is gone; the button always shows,
  with a `shareBlurb` computed picking the sentence above it per kind. `ShareButton.vue` in the
  tab bar was already ungated, so nothing there needed changing. Negative control: putting the
  `v-if` back fails 4 TabSettingsDialog tests.
- **A local tab is told why it cannot collaborate.** `share-capabilities.ts` grew
  `blockedDetail` beside `blockedReason`, and the local branch's reason is now the verbatim
  "You must convert this tab to a cloud tab before it is possible to share it." (it used to
  point at the + button, which is not where the conversion lives any more), with the reasons in
  `blockedDetail` under it (`invite-blocked-detail`). Every other branch, offline included,
  leaves `blockedDetail` null. The snapshot half is untouched and works for all five kinds.
- **`ShareDialog` is on `AppDialog` now (2026-09-01).** The share-settings verify flagged it as
  the last raw `v-dialog` + `v-card` on a sync path; it is `<app-dialog>` with
  `card-class="border-md"`, `icon="fas fa-share-alt"`, `max-width="760"`, a computed
  `Share "<tab name>"` title, `close-title="Close share settings"` and
  `close-id="close-share-dialog"`. Body content is unchanged, so every testid held. The
  bottom-row Close button is gone (the corner close replaces it), which is why
  `closeShareDialog` in `e2e/helpers/rooms.ts` now clicks `#close-share-dialog` the way
  `closeTabSettings` does rather than matching a button by the name "Close". The only dialogs
  still on raw chrome are the release splash decks and `StatisticsFactorySummary.vue`, both
  deliberate (checked 2026-09-01: `<v-dialog` survives only in those three and in `AppDialog`).
- **`expect(at('x')?.querySelector(...)).not.toBeNull()` cannot fail.** When `at('x')` is null the
  optional chain yields `undefined`, and `undefined` is not null, so the assertion passes. The
  first shell test written for the `AppDialog` move used that shape to pin the `share-dialog`
  testid the e2e suite anchors on, and deleting the testid outright left all three shell tests
  green. Assert the handle itself first (`expect(dialog).not.toBeNull()`), then use `!`. Worth
  checking wherever a spec guards an anchor through `at(...)?.`.
- **`shareBlurb` must not promise a link the pane cannot show.** Its first cut sent both
  non-owners down one branch saying "and the invite link for this plan", which is a lie for an
  anonymous visitor: `shareCapabilities` hardcodes `inviteLink: null` for `kind: 'joined'`
  (no membership row, so no slug), and `ShareDialog` renders the read-only link only when
  `inviteLink` is non-null. A synced *member* does get one, because a room they belong to is
  shared and therefore has a slug. The branch is split on `kind === 'joined'` and both halves
  are pinned by a spec.
- Icon swap: synced tabs now wear `fas fa-cloud` (was `fa-user`) in the tab bar and on the
  new-tab chooser's Synced card; local `fa-desktop` and collaborative `fa-users` unchanged.
  No spec asserted `fa-user` anywhere; assertions for the new icons were *added*
  (TabNavigation.spec icon test, NewTabDialog.spec). The e2e tab-kind reader
  (`readTabElements`) already treated "neither desktop nor users" as synced, so it needed no
  change; the dead inline-editor read in it was dropped.
- e2e: `renameAffordance` is gone; `tabSettingsAffordance`/`openTabSettings`/
  `closeTabSettings` in `e2e/helpers/planner.ts`, and `renameCurrentTab` drives the dialog.
  tab-lifecycle's member test opens the dialog and asserts the disabled field before and
  after the owner's rename.
- Counts after this round: web 2887 unit tests + 1 skipped across 154 files (2026-09-01, after
  the `AppDialog` move added 3 shell tests: TabSettingsDialog.spec 22, ShareDialog.spec 21,
  share-capabilities.spec 18, TabNavigation.spec 12, NewTabDialog.spec 11); e2e 42/42 in 5.7m,
  tab-lifecycle also standalone 5/5 — both measured *before* the `AppDialog` move. After it, the
  seven specs that drive the share dialog were re-run green, 18/18 (invite, invite-password,
  tab-lifecycle, unshare, snapshot-link, sidebar-tabs, field-locks); the full 42 has not been
  re-run since.
- Verified live against a local API (mongodb-memory-server on 3001, `CORS_EXTRA_ORIGINS`
  pointed at the vite dev origin, since the static allowlist only carries `localhost:3000`):
  local pencil shows Share Settings on the snapshot-only pane, convert to cloud flips the tab
  to `synced`/owner, and reopening the pencil gives Share Settings on the invite pane with the
  notice gone. Creating the invite link from there minted a real room slug.

## The offline conflict prompt (2026-09-01): the one decision the engine hands back

Until now an offline edit simply won: the rebase overlaid every touched record onto the server's
copy and a peer's edit to the same factory was gone with no notice. That is still the default,
but the user is now asked first, and only in the case that is genuinely a decision.

**The trigger, and it is narrow on purpose.** A *snapshot* for a tracked room (join, reconnect,
the probe's heal, leaving offline mode, reopening a device whose mirror meta carries touched ids),
whose revision is past this client's acked baseline, carrying a factory in `touchedFactories`
whose print differs from the acked one or which the room no longer holds. `findClashes` in
`room-sync-store.ts` is the whole predicate and it runs *before* the rebase, because the rebase
replaces both halves of the comparison. Deliberately silent everywhere else: an `op_reject` rebase
during live editing (the 400ms race is routine and field locks cover it), a snapshot with no
overlap, a room with no local intent, and a snapshot parked mid-load — parking wins, and the check
runs when the parked snapshot is finally applied.

Three things it took to make the predicate honest, each of which was a false prompt before it:

- **A restart leaves no baseline to compare against.** `seedFromMirror` marks touched records
  `UNKNOWN_CONTENT`, so "differs from the acked print" is true of every unsent edit. `TabMirrorMeta`
  now carries `baselinePrints` — a 32-bit FNV-1a of the acked record, per touched id, cached against
  the print itself so a 300-factory clear does not re-hash the plan on every persist. No fingerprint
  means no answer, and no answer is silence.
- **The snapshot after a drop can be this client's own op coming back.** A socket can die between
  the write and the ack, and the reconnect's snapshot then carries our own edit. `abandonPendingOps`
  keeps the sent prints in `engine.unacknowledged` and `changedRemotely` treats a match as ours;
  the existing "loses nothing when the socket drops before the ack" spec is what caught this.
- **Derived figures are not a disagreement.** `describeClash` returns null unless there is something
  to show, because a peer editing a factory this one imports from moves `dependencies` and `parts`
  on both sides. The "other changes" line compares an explicit whitelist of authored fields for the
  same reason.

**The whitelist was the first review's finding, and it is the trap to remember.** "A field missed
there only costs a summary line" was wrong: with no product row and no whitelisted field differing,
`describeClash` returns *null*, the factory earns no section, and the overlay takes this device's
version silently — the one thing the prompt exists to stop. The products were the hole. They are
compared by rate and recipe alone, and everything a user dials in below that lives inside them:
`buildingGroups` (overclocks, somersloops, miner marks, well satellites), the checklist ticks, the
product order. Two versions asking 60/min and building it differently, one machine at 200% here and
two at 100% there, read as no clash at all. `productsDifferBeyondRates` now compares the authored
half of each product whose rate and recipe agree — the solver's own figures (`parts`, `powerUsage`,
the problem flags) deliberately excluded, and only where the rates agree, so a moved rate still
earns one row rather than a row plus a vague second line. When adding a field to a factory or a
product, ask which of the two whitelists it belongs in; the cost of guessing wrong is silence.

**The answer is per factory, with per-product evidence.** The owner's requirement verbatim: "We do
need a per product per factory level, clearly showing 'current plan is X, you changed it to Y,
which wins'". Products are evidence only — the engine's unit of sync is the whole factory, and a
per-product merge would be a second consistency model. Mine-winners are today's behaviour;
live-winners go through `releaseIntentFor` (shared with the `undeclared_bulk_removal` reject path)
and take the snapshot's record back, absence included. One op carries the mine-winners plus every
non-clashing edit. The flush is held for that room while the question is open, and every newer
snapshot or applied op re-measures the rows, closing the dialog unprompted if the overlap has gone.

**An answer can land while a load chain owns the plan**, because the rebase that raised the question
hands the plan to the loader. Written into the array then it would be half-overwritten and then
committed — the truncation class this branch has been bitten by twice. The answer parks and is
applied from `flushAll`/`probeTick` once `isLoaded` is back and the chain has let go; it is retried
rather than scheduled, since a queued load can own the plan again a tick later. **The flush hold
lasts until the answer is applied, not until the dialog closes** (the review's second finding):
`flushRoom` refuses a room in `parkedResolutions` as well as one in `conflicts`. `isLoaded` almost
covers it, but the tail of a chain has the array whole again with the load still owning the tab, and
a paused room's `probeTick` retry could put this device's version of a factory on the wire after the
user had handed that factory to the live plan.

The prompt also resets the keep-a-copy box for each new question rather than remembering the last
answer: clearing it answers one clash, and the next one starts from the choice that can destroy
nothing.

Files: `web/src/sync/offline-conflict.ts` (pure evidence + fingerprint),
`web/src/components/sync/OfflineConflictDialog.vue` (AppDialog, persistent, `closable: false`,
mounted in `layouts/default.vue`), the engine half in `room-sync-store.ts` (`conflicts`,
`findClashes`, `noteClashes`, `refreshConflict`, `resolveConflict`), and
`web/e2e/tests/offline-conflict.e2e.ts`. Guards: 23 store specs, 19 component specs, 20 pure specs,
2 mirror-meta specs and 2 e2e tests, all negative-controlled by neutering one half at a time (the
clash test, the flush hold, the parked hold, the mid-load park, the fingerprint, the server-copy
take, the kept copy and its reset, the re-measure, the untrack, the building-group comparison and
both its guards, and both e2e cases). **The wire protocol is unchanged** and
`PROTOCOL_VERSION` did not move: this is a client-side decision about which local records survive a
rebase, and the server sees an ordinary op either way.

Two traps found building it, both worth keeping:

- **A fixture that sets `product.amount` and recalculates with `origin: 'recalculate'` edits
  nothing.** Building groups are sacrosanct on that origin, so the typed amount is pulled straight
  back to what the groups say. Use `origin: 'item'`, which is what the quantity field itself does.
- **The account tray cannot be closed with Escape while this dialog is up.** It is persistent, so
  Escape reaches it, does nothing, and leaves the tray open; the e2e comes back online without
  closing the tray for exactly that reason.

### A wait and the read it gates must not share a debounced source (2026-09-01)

CI run 33542817015 failed the mixed-answer case with "Casting is a mixture of both versions", and
the mixture was in the *expected* value, not the merged one. The merged record was a whole owner
copy, every field of it. The snapshot it was compared against was half-written.

`authoredFactories` reads `localStorage.factoryTabs`, and so does `mirroredProductAmount` — both
are the plan as last *saved*, not as currently held. `app-store.ts` saves on a 500ms debounce with
a 5s interval that writes whatever is current, finished burst or not. So `divergeOffline`'s wait,
which claimed the owner's edit had reached the server, was reading the owner's own save and was
satisfied the moment the amount landed in it. The note is typed after the amount and reaches the
store at once, but the op carrying it is on `OP_DEBOUNCE_MS` (400ms) and the save that would hold
it is 500ms out — so the wait passed on a record with the new amount and the old note, and the
snapshot taken ~90ms later took it that way. The end comparison then held the merged plan against
a version of the live plan that had never existed.

Reproduced 9 times in 10 at `E2E_CPU_THROTTLE=6 --repeat-each=10`, every failure differing in the
note alone. CI's save had landed one step earlier still, so its building group was stale too — one
building at 100% against an amount of 75 — which is the same tear one field wider.

Both fixes are in the harness, because nothing in the product ever mixed two versions: the owner's
edits are now gated on `outstandingIntent` reaching zero, which is the server's word that it holds
them rather than the local save's, and both pre-resolution snapshots go through
`settledAuthoredFactories`, which reads the projection twice 750ms apart and requires them equal.
The byte-identical assertion is untouched and there are no retries. The general lesson is the
heading: a wait and the read it gates must not come from the same debounced source, or the wait is
satisfied by exactly the partial write the read must not see.

### Seeing that prompt without two devices (2026-09-01)

The owner asked to witness the dialog first hand, so there is now an **"Offline conflict demo" row
in the Templates dialog**, shown only when `import.meta.env.DEV` is true or
`localStorage.sfDevTools === 'true'` — one console command on a preview build. It makes its own
local "Conflict demo" tab, seeds four raw-fed factories (Iron Smelting, Copper Smelting, Concrete
Casting, Steel Smelting), and stages a fabricated clash covering every row shape at once: a moved
product rate, a recipe change carrying the "other changes in this factory as well" line, a factory
the pretend live plan deleted, and one removed on this device but edited there. What opens is the
production `OfflineConflictDialog` reading the production `conflicts` entry, and answering it runs
the real `resolveConflict`, so the demo is worth exactly as much as the code it drives.

**The sandbox is structural, and that is the whole design.** `stageDemoConflict` registers an
engine in `engines` and a question in `conflicts`, and deliberately **no `RoomState`**. `flushRoom`
is the only thing in the store that puts an op on the wire, and its first line returns on a room
`rooms` does not hold — so the answer's own `flushRoom` call is a no-op and `ensureSocket` is never
reached. Nothing was relaxed to make this work; the pseudo-room simply has less state than a real
one. `rooms-store`'s reconcile watcher keys off `roomSync.rooms` too, so it never sees the demo
either. Staging refuses over a tracked room, over a question already on screen, and mid-load;
`applyResolution` ends the demo (engine, question, mirror meta) so the tab is an ordinary local tab
afterwards. The one place production code learned about the demo is a
`for (const roomId of demoRooms) applyParkedResolution(roomId)` at the top of `probeTick`, over a
set that is empty in every real session — without it an answer that parked behind a load chain
would never be retried, because the loop below it is per room.

Two traps, both found by driving it rather than by a spec:

- **A hidden tab never paints, so `requestAnimationFrame` never fires.** The demo waits out the
  load chain the tab activation queues (an answer given inside one parks), and that wait began with
  two bare `requestAnimationFrame`s to let `app-store`'s own `afterPaint` run. In a backgrounded
  tab it hung forever and the dialog simply never appeared. Every frame wait in app code wants a
  timer racing it.
- **`addTab` reads a tab arriving with factories as an imported plan.** It leaves `plannerVersion`
  undefined for exactly that case, so the load raised the one-time raw-resources migration notice
  on top of the dialog the demo exists to show. Stamp `config.plannerVersion`, the same thing
  `Templates.vue` does for a template built by today's code.

Files: `web/src/sync/offline-conflict-demo.ts` (orchestration, the flag, the refusals),
`web/src/utils/factory-setups/offline-conflict-demo-plan.ts` (the three versions of the plan),
the `stageDemoConflict`/`endConflictDemo` pair in `room-sync-store.ts`, and the row in
`Templates.vue` (a `run` callback on a template, so the row never reaches the loader). Guards: 15
store specs, 8 module specs and 6 component specs, negative-controlled throughout — the row hidden
on a normal build against shown on both switches, a wire spy proved to catch a real room's op
before it is asserted silent on the demo, an ordinary template still reaching the loader, and
staging refused when the two versions agree. Verified live on a dev server: all four sections
render, a mixed answer moves Iron Smelting to the live rate and brings Steel Smelting back while
leaving the other two on this device's version, the offline copy tab appears, and the only requests
in the network log are vite's own.

#### "Structural" has to mean the function, not its callers (2026-09-01)

The adversarial pass over the demo found the sandbox held in fact and not in structure, in two
places. Both are now one line each, and each is proved by a spec that fails without it while every
other spec passes with the line reverted — the guards are inert for real rooms by construction.

- **`requestSnapshot` was gated on the engine, not the room.** It is the only send site in the
  store besides `flushRoom`, it puts a `join` frame on the wire, and `if (!engine)` was its whole
  test. Nothing could reach it — every caller (`healFromSnapshot`, `onOpApply`, the `probeTick` and
  `onLoadingCompleted` loops) already sits inside a `rooms` scope — so "no room, no frame" was true
  of the callers rather than of the store, and it is exported. `if (!rooms.value[roomId])` now says
  it where the claim is made. `trackRoom` is the only other engine creator and it always makes the
  `RoomState` too, so an engine without a room is the demo and nothing else.
- **A synced tab is untracked until `GET /rooms` reaches this device.** Signed out, offline, or in
  the window before the room list lands, a synced tab is absent from `rooms` — so the `rooms`
  check alone would have let `stageDemoConflict` stage over a real one, and `endConflictDemo`
  would then have stripped that tab's `tabMirrorMeta`, revision and baseline prints. Only the
  orchestration's current-tab check stood between them, and it guards the caller rather than the
  store. `stageDemoConflict` now refuses any tab `getTabState` does not call `local`.

Verified against the real production build the e2e harness serves, which is the honest test of the
flag: `import.meta.env.DEV` folds to `false` there and `devToolsEnabled` compiles down to the
`localStorage` read alone. The row is absent with the ordinary Demo row still present, and appears
once `sfDevTools` is set. Driven with a WebSocket route between the client and the gateway: an
anonymous session ran the whole demo end to end having opened **zero** sockets, and a signed-in
session with a live room sent no `op` and no frame naming the demo tab across staging, a mixed
answer and a probe cycle — with the same spy proved beforehand to catch that room's own op, and
the room still syncing an edit afterwards. The dialog is the single production mount in
`layouts/default.vue`; the demo renders nothing of its own.

## The QA hardening round (2026-09-02): what a cheap frame was allowed to cost

Seven of these are one shape: **a message small enough to be free was answered with work
proportional to the whole plan.** The room document *is* the plan, so any unprojected read of
it is a plan fetch.

- **Authorization read the room twice, unprojected, for every op, lock and revocation sweep.**
  `RoomAccessService.authorize` now projects both reads down to the access fields plus
  `revision` (`RoomAccessView`); `authorizeWithContent` is the opt-in for the paths that
  actually serialise a snapshot — join, the op apply, and the unparsable-op reply. The first
  read is projected even there: it is never the copy handed back, so it never needs content.
- **Rejections that carry a snapshot get a budget of their own**
  (`WS_SNAPSHOT_REJECT_LIMIT`, 60 a minute per socket). A ninety-byte malformed op bought a
  document read and a serialisation, twelve times a second inside the message limiter. Past
  the budget the socket is closed 1008 rather than served; its reconnect re-joins and gets one
  snapshot per room. The budget cannot be spent below a snapshot-less reject, because a client
  reads *no snapshot* as "the room is gone" and turns its tab local.
- **`WS_MAX_PAYLOAD_BYTES` was 25MB against a largest legitimate frame of about 4.6MB** — a
  room built entirely of the biggest factory a real plan holds (15KB, measured off
  `maels-big-boi-plan-data.json`, whose 36 factories average 6.3KB). It went to 8MB, and to
  **4MB** when the room cap dropped to 150 (below), because that frame is now 2.2MB.
  `ws-limits.spec.ts` builds it and asserts the constant sits between it and three times it,
  so the number stays derived rather than chosen.
- **Nothing capped concurrent sockets.** The 60/minute rate limit says how fast they arrive and
  nothing about how many are held. `ConcurrencyLimiter` in `ws-throttle.ts` caps per address
  (at the rate limit) and process-wide (2000); the slot is released off `info.req.socket`'s
  `close` in `verifyWsClient`, not off the gateway, so an upgrade that never completes gives
  its slot back too.
- **The sweeper loaded every room document to read its id**, and decided orphanhood from a
  membership read taken before the delete. Both `find`s now project `{ roomId: 1 }`, and
  `purgeOrphans` re-reads the memberships immediately before purging, so a join landing in the
  gap keeps its room. `heldRoomIds` is `protected` for exactly that test.
- **Every `z.record` in `common/src/schemas/factory.ts` was unbounded**, which is one op away
  from a document Mongo will not store. zod has no `.max()` for records, so `boundedRecord`
  refines on key count; the ceilings are new `CAPS` entries sized against the game's own totals
  (157 parts + 24 raw resources, 24 buildings) with several updates' worth of headroom.
- **Two unauthenticated routes leaked or invited guessing.** `GET /rooms/by-slug/:slug`
  returned the plan's name to anyone who guessed a slug and now answers
  `{ roomId, hasPassword }` only; the invite page's password prompt lost the name with it. It
  and `POST /login` each got a bucket of their own (20/min and 10/5min) rather than sharing the
  200/5min global. `auth.spec.ts` is `unthrottled` because it signs in a dozen times.
- **`toRoomSnapshot` shipped `createdBy`** — the owner's account id — to every anonymous
  visitor holding an invite link. Removed from `RoomSnapshot` outright.
- **`join` and `leave` wrote their activity row before the membership write**, so a resumed
  chain wrote it twice and counted one collaborator as two in `room_totals`. Both go through
  `recordOnce(..., { perActor: true })` now, keyed on room + actor + kind. Ordering is
  unchanged deliberately: the membership write staying last is what tells a retry the chain is
  unfinished.
- **Field locks live 10s and were swept on the 30s heartbeat**, so a field could show as
  somebody else's for three times as long as it was held. The sweep has its own 5s interval.
- **Both JWT guards verified the signature and nothing else**, and a room visitor token is
  signed with the same secret — so one passed as an account with `id` and `username` both
  undefined. `isAccountTokenPayload` in `auth-token.ts` is the shared shape check, now used by
  `JwtAuthGuard`, `OptionalJwtAuthGuard`, `POST /validate-token` and the gateway's handshake.
  Not exploitable on today's routes, which all key off `user.id` and find nothing; latent, and
  four routes 500ed unauthenticated.

**A "socket hang up" in the full run only, never in isolation.** Chased in
`metrics-usage.spec.ts` ("still issues a token when the stamp fails", the one test that builds
a second app inside a test body). Not reproducible here — three whole-suite runs and five
standalone runs of that file, all green — so the cause is recorded rather than proven: Node's
`http.globalAgent` has `keepAlive: true` with a 5s timeout since Node 19, supertest goes
through it, and the suite builds and tears down dozens of servers on ephemeral ports in one
process (`fileParallelism: false`). A pooled socket outliving its server, on a port the next
app then binds, is exactly a hang-up on a request that reached nothing. `test/utils/env-setup.ts`
now installs a non-pooling agent. If it recurs, that hypothesis is wrong and the next suspect
is the nested app's teardown racing the enclosing suite's.

**The final gate saw the same shape in the other harness**, which is the best corroboration
that hypothesis has: the full-speed Playwright run failed one test on `read ECONNRESET` against
`POST /register` after 10ms, and it passed alone, passed under `E2E_CPU_THROTTLE=6`, and left no
crash in the API log. Playwright's `APIRequestContext` pools keep-alive connections the same way
supertest does. Two harnesses, one symptom, neither reproducible in isolation. Left unfixed on
purpose: a Playwright retry would hide real failures, and the context exposes no agent to swap.

**A guarded read is not optional in a release path.** The recovery copy `abandonLoad` restores
is read by `beginLoading` too, so a `preLoadFactories` that will not parse is both why the chain
dies and why the release is skipped — the tab wedges with `isLoaded` false and the client
persists and sends nothing for the session, which is the exact state that release exists to
prevent. Anything inside a catch-all handler has to be incapable of throwing.

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
  sweep, is the cheap version of the fix. **Accepted on 2026-09-03 and tracked as issue #640**,
  so this is settled rather than outstanding: reopen it against that issue, not as a new find.
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
- ~~**`GET /version` does not exist on the NestJS API.**~~ Closed 2026-08-31: the preview showed
  every client 404ing on the poll, so the route is back (see "`GET /version` came back" above)
  and it *is* on the version-gate exemption list, which was the open question here.
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

## `activePinia` is a global, and every action call re-points it (2026-09-01)

Cost two CI runs. `TabNavigation.spec.ts` > "keeps copy, share and delete together in that
order" failed in the full web suite and passed in isolation every time: `duplicate-tab` was
missing, which reads as "the current tab is local". The store was right at the assertion —
`currentFactoryTab` was `room-a` and its state was `synced`. The *component* was reading a
different store.

Pinia's action wrapper calls `setActivePinia(that store's pinia)` on **every** action call, and
a component mounted without pinia in `global.plugins` resolves `useAppStore()` off that module
global. Each test here mounts and never unmounts, so every render leaves a `plan-activity-store`
behind (`LastUpdatedIndicator` creates it) whose `loadingCompleted` listener outlives the test.
When the load chain that `activateTab` starts emits `loadingCompleted` inside the
`await flushPromises()` window, those dead listeners call `appStore.getCurrentTab()` and take
`activePinia` with them; the `mount()` on the next line then binds the whole component to a
previous test's stores. Nothing in production can hit it — one page, one pinia.

Reproduce on demand: `eventBus.emit('loadingCompleted')` immediately before the mount, 3/3 with
the exact CI assertion. Contention alone reproduces it at roughly 1 in 30 with twenty copies of
the file running at once, which is the recipe for any "CI-only" vitest flake here. The fix is
to hand the mount its pinia (`plugins: [vuetify, pinia]`, already the pattern in every
`components/sync/*.spec.ts`) and to dispose the plan-activity store in `afterEach`; either half
alone closes it. Any spec mounting a store-backed component with `plugins: [vuetify]` alone is
still exposed to this.

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

## A loading tab is read-only to the engine (2026-08-31)

Reported from live use: while one collaborator was opening a shared plan, everyone else's
console filled with "Factory not found" and the corruption alert fired. The receiving side was
innocent — `findFac`, `flushInvalidRequests` and the alert were tripping over references to
factories a *peer* had just told the server were deleted.

**The staggered loader empties the tab's factory array and refills it one record at a time, so
for a second or more the plan on that client is a fragment.** The pre-existing `!isLoaded`
guard covered *sending* and nothing else, so five paths still read the fragment and wrote it
back, and the client then honestly reported every unmounted record as a user deletion:
`applyRemote` merging a peer's diff into it, `overlayIntent` reading "touched and gone from
local state" as a deletion (worst of the five: touched ids are persisted in the mirror meta,
so a cold boot carries a large set of them straight into this), `writeContentToTab` queueing
the truncated content as the next load, `seedFromMirror` taking a baseline off it, and
`recordIntent` inferring removals from it.

Two separate faults kept `isLoaded` true while a chain ran, and either alone is enough:

- **`startQueuedLoad` never lowered it.** Verified empirically rather than assumed:
  `Loading.vue`'s `v-overlay` sets `appear: true`, so its `@after-enter` fires on *mount* as
  well as on a false-to-true transition. `Loading.vue` is mounted only by `pages/index.vue`, so
  navigating away from `/` and back remounts it, re-fires the event and restages the whole
  plan — in an app that already said it was loaded. The chain is now started from
  `Planner.vue`'s own `onMounted` instead, because a load must never hang off a CSS
  transition. That mount is load-bearing on the way back too: `planVisible` in `Planner.vue`
  starts false and only `loadingCompleted` flips it, so skipping the chain leaves placeholders.
- **`beginLoading` emptied the tab before it captured the owner**, so a tab switch inside the
  pause left the first tab permanently empty while the records went to the second. e85e953e
  fixed the push target; this was the emptying target, the other half of the same bug.

The fix is one rule stated in three places. `appStore.isTabLoading(tabId)` is the fact —
`loadInFlight` plus the tab the chain actually owns, tracked from `beginLoading` rather than
inferred from whichever tab is current. `roomIsMidLoad` in `room-sync-store.ts` reads it, and
every inbound path (`onSnapshot`, `onUpToDate`, `onOpApply`, `onOpReject`) **parks** rather
than touching the tab: it sets a per-room `needsSnapshot`, and `onLoadingCompleted` requests a
fresh snapshot that rebases onto a complete array. Parking is not dropping, and it is
self-healing — `probeTick` retries a request that could not be sent.

**The wire guard is the belt to that pair of braces, and it deliberately does not consult
`isLoaded`** — that is the flag that failed. `flushRoom` refuses to build a diff at all when
the baseline holds a factory the loading tab does not, logs the ids loudly and re-baselines. It
sits *before* `markStructuralIntent`, which would otherwise record the truncation as the user's
own intent and persist it into the next boot.

One deviation from the prescribed guard, and it matters. "Only send a removal if every removed
id is in `touchedFactories`" cannot work as written: `markStructuralIntent` runs immediately
before `buildDiff` and marks every missing id, so the test is a tautology. Capturing the set
*before* the inference does not rescue it either, because inference is the **only** declaration
a plain delete has — `removeFactory` and `Planner.vue`'s `deleteFactory` mark the records the
reindex shifted, never the record removed. Declaring at every site that shrinks a plan is what
that would take, and one missed site silently stops deletions syncing. So the guard ships keyed
on load ownership, and the declaration comes back in the section below, scoped to bulk removals
where the call sites are enumerable.

Guards: `room-sync-store.spec.ts` "a tab a load chain owns" (7 cases, including a negative
control that sends the removal once the tab stops reporting itself as loading),
`app-store.spec.ts` "what the chain tells the rest of the app" (2), and
`web/e2e/tests/loading-tab.e2e.ts` (3), which reads the frames off the socket through the
harness gate's new `sent()`. All twelve were negative-controlled by neutering the fix; the two
e2e cases that fail on the old code fail with real data loss, not a wire assertion.

Two things found in passing and **not** fixed: `createRoom` posts no `plannerVersion`, so the
first snapshot back writes the owner's tab stamp to `undefined` and the raw-resources migration
notice can raise itself on a plan that had answered for it; and the import row's option menu
cannot be clicked by a real pointer event in the e2e viewport, so `addImport` selects with
`dispatchEvent`.

## Bulk removals are declared, and the server keeps a restore point (2026-08-31)

The guard above stops *this* client truncating a room. It cannot stop the next one, because the
failure was a client honestly reporting a state it honestly held. So the same rule is stated on
the wire as well, where it depends on no client being correct.

**Past `BULK_REMOVAL_THRESHOLD` (5, in `common/src/types/protocol.ts`) removals in one op, the op
must carry `bulkRemoval: true`.** The gateway refuses one that does not, with
`op_reject { reason: 'undeclared_bulk_removal', snapshot }`, so a truncated client re-baselines
onto the room's real state instead of emptying it for everybody in it. The check reads nothing
about the sender: past that many, a diff is a whole-plan replacement rather than an edit.

**Every deliberate removal declares, and it declares *which ids*.** `markPlanReplaced` in
`web/src/utils/sync-intent.ts` emits `planReplaced { removedIds }`; the store holds them in
`engine.declaredRemovals` and sets the flag only when every id in the diff's `removedFactoryIds`
is one of them. The bulk paths call it: `clearFactories` and `loadServerPlan` (both branches) in
`app-store.ts`, `Templates.vue`, `Introduction.vue`'s demo button and `RawResourcesWizard.vue` —
and pasting a plan is covered because it clears first, through `clear-all`. Single deletes
declare too, since 2026-09-01: `markFactoryRemoved` (same file) declares the one id, called from
`removeFactory` in `app-store.ts` and `deleteFactory` in `Planner.vue`. A boolean latch would
have covered all of them and not been honest: a latch set by a clear would launder the next
accidental removal that happened to follow it. The set is persisted in the tab mirror meta,
because the op can be a restart away — cleared while offline, or queued behind a pending op — and
it is spent in `clearSatisfiedIntent`, where a record the baseline no longer holds can never be
removed again. Any *new* site that shrinks the plan must declare, or its deletions silently stop
syncing past the threshold.

**The refusal has to converge, and it does not for free.** A rejected op is rebased and resent,
and the rebase reads the missing records as intent — so a refused removal would be resent every
probe cycle for ever, the plan gone on one screen and whole everywhere else. `onOpReject` drops
the intent for exactly the ids the refused op named when the reason is
`undeclared_bulk_removal`, and logs them, so the rebase puts the records back from the server's
copy. Restoring is the safe direction: the plan is on the server, not in the client that just
failed to explain itself.

**The one honest cost of the threshold — closed 2026-09-01:** single deletes could coalesce into
one op behind a slow ack, and past five of them that op was refused, so the user watched those
deletions come back. Closed by declaring at `removeFactory`/`deleteFactory` (and at
`loadServerPlan`, the restore path, which replaced the plan wholesale and declared nothing).
Guard: `room-sync-store.spec.ts` "declares a burst of single deletes made through the store",
negative-controlled by the raw-splice test beside it.

`PROTOCOL_VERSION` is deliberately unchanged: v0.7.0 is unreleased, so client and server ship
together and no compatibility shim is owed. The one live consequence is on the shared preview
API — a tab left open on a preview build from before this change sends no flag, so a clear of
more than five factories is refused and the plan comes back. A refresh is the whole fix, and the
version gate will not prompt for one because the protocol version did not move.

**The restore point.** An accepted over-threshold op stashes the pre-op array on the room as
`lastBulkRestore { factories, revision, at }` inside the same revision-guarded
`findOneAndUpdate`, so it can only exist for a state that actually committed. Latest only, no UI,
and it never leaves the server: `toRoomSnapshot` names its fields and this is not one. Skipped
with a warning when the stored plan is too big to duplicate, because a second copy of an
oversized array is how a room document reaches Mongo's own 16MB limit. **That guard is on
bytes, not on the factory count** (`BULK_RESTORE_MAX_BYTES`, 4MB, in `room-op.service.ts`):
a room-cap plan of outsized records outweighs a room-cap plan of ordinary ones, and only one of
those two shapes was refused by a count. Since the cap dropped to 150 the guard clears every
plan the cap allows (2.2MB at the largest), so it now fires only on records the schema never
saw: `ws-limits.spec.ts` pins that, and `ws-ops.spec.ts` reaches the skip with 30KB notes.
It is also skipped when the pre-op plan is empty, or a second declared bulk in a row would
overwrite the stash with the emptiness the first clear produced — which is the state somebody
would be restoring *from*.

**The testing lesson, and it is why the truncation bug reached live at all.** Every sync fixture
was two factories. Two mount in one flush, so the stagger the bug lives in never existed in a
test, and nothing ever delivered an op *during* a load. Both are covered now:
`loading-tab.e2e.ts` seeds fifteen and lands a peer's op mid-stagger, `bulk-clear.e2e.ts` seeds
past the threshold so the clear exercises the declaration end to end, and the store spec builds
eight. A fixture small enough to be convenient is a fixture that cannot reach the code being
protected.

Guards: `backend/test/ws-ops.spec.ts` "declared bulk removals" (5) and
`room-sync-store.spec.ts` "declared bulk removals" (7), each negative-controlled by neutering
one half at a time — the server check both ways, the restore point, its cap skip, the flag, the
id set, its persistence and the convergence rule.

## Metrics and telemetry, which postdate the contract (recorded 2026-09-03)

Built alongside the rooms work and absent from the plan's original text, so the plan now carries
a section for it too. Three surfaces, all `@SkipVersionGate()` for the reason `/health` is: the
callers are a scraper and the oldest, most broken clients, none of which sends a useful
`X-App-Version`.

- **`GET /metrics`** serves Prometheus text behind a bearer token read from `METRICS_TOKEN` at
  request time. **Unset means 404, not an open endpoint** — forgetting the variable on a new box
  cannot publish one. Its own rate-limit bucket, so ordinary traffic cannot throttle a scrape
  into a gap in the graphs; counts cached at `METRICS_CACHE_MS` (15s) with a 120s slow tier.
- **`POST /telemetry`** is the anonymous usage heartbeat, unauthenticated by design because the
  users it exists to count are the ones with no account. The browser keeps an instance id in
  `localStorage` and beats on `TELEMETRY_CAPS.intervalMs` with version and build commit. Always
  204; 429 for the per-instance floor or the `TELEMETRY_MAX_INSTANCES` ceiling, and the client's
  answer to either is to drop it and wait for the next tick.
- **`POST /events`** takes a batch of fault counts (`EVENT_REASONS` / `EVENT_SOURCES` in
  `common`) which become prom-client counters. Its web hooks sit inside recovery paths, so
  nothing in `record-event.ts` or `events-store.ts` may throw.
- `room-totals/` keeps the permanent count of room lifecycle events, which a live
  `countDocuments` cannot answer; `user-activity/` derives the active-account windows from
  `room_activity`.
- Both POST bodies are bounded twice, on `Content-Length` and on the parsed body: the global JSON
  parser is sized for a plan, and a declared length is the sender's claim rather than a fact.
- prom-client is deprecated and the backend stayed on it deliberately: see
  [[prom-client-deprecated-successor]] before changing anything about a metric.

## The room cap drops to 150 (2026-09-03)

`CAPS.factoriesPerRoom` was 300 and is now 150. The reason is measured rather than theoretical:
the client crashes opening plans of 175-250 factories, so a room the server accepts is one no
client can open, and the server must not hold data the app cannot show. Raising it again is a
one-line change once the client can take it, which is why the conservative number was the easy
call to make.

**Everything downstream is derived, so sweep by grep, not by memory.** Nearly every site reads
`CAPS.factoriesPerRoom` and moved on its own: the zod plan and op schemas, `rooms.dto.ts`, the
legacy-import truncation, `boundedRecord` on the export calculator's per-factory settings, and
the backend tests that seed `cap + 1` or `cap - 1`. Four things did not, and each is the kind of
number that goes stale silently:

- **`WS_MAX_PAYLOAD_BYTES`, re-derived from 150 and now 4MB** (was 8MB). The largest legitimate
  frame is a full room of the biggest factory a real plan holds (15,314 bytes): 2,297,568 bytes
  measured, so 4MB is the same "roughly double" the 8MB was against 300.
- **`BULK_RESTORE_MAX_BYTES` (4MB) now clears every plan the cap allows**, since the same room
  serialises to 2.2MB. The stash is no longer skippable by a legitimate plan, so the guard is
  defence in depth against a document that got large by some other route. `ws-limits.spec.ts`
  asserts the room-cap plan fits inside it, which is also the cap change's negative control.
- **`ws-ops.spec.ts` seeded 250 factories** to reach the skip, which is now over the cap and
  would be refused `too_large` before the restore point was ever considered. It seeds a full
  room of 30KB records instead, written straight to Mongo so nothing schema-checks them.
- **Prose repeats the number**: `backend/README.md` (twice, plus the 25MB `maxPayload` line it
  still carried), the v0.7 `CHANGELOG.md` entry, the plan's caps table, and a comment in
  `rooms-store.ts` explaining the legacy-import overflow toast.

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
