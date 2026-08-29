---
name: project-sync-v7-rooms
description: v7 realtime rooms sync — built and green on branch claude/sync-mechanism-refactor-7b021b; contract in .claude/plans/sync-v7-realtime-rooms.md, file map and follow-ups here
metadata:
  type: project
  volatility: hot
  lastVerified: 2026-08-29
---

The v7 headline feature (version 0.7.0): realtime WebSocket sync with rooms, replacing the
10-second last-write-wins blob sync, plus a NestJS backend rewrite. The binding contract is
`.claude/plans/sync-v7-realtime-rooms.md` (revision 8, reconciled with the built backend).

**Status: the build is complete on branch `claude/sync-mechanism-refactor-7b021b` and not yet
merged — no PR has been opened.** Every task line in the plan is delivered bar the four
deliberate v7 follow-ups (history UI, presence beyond an occupancy count, email password
reset, the v7 changelog modal). Two adversarial Codex reviews of the finished diff raised
three findings each; all six are fixed, and the sections below are what they were. Green as of
2026-08-29, on the committed tree: backend 243 vitest tests, common 68, web 1754 unit tests,
25 Playwright e2e tests, `vue-tsc` clean, root `lint-check` clean
(44 pre-existing warnings in `parsing/`, 0 errors), root `build` clean. The e2e job in CI has
never actually run — it is validated locally only, so the first PR is where it gets proved.

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
  has no UI in v7.
- **Revocation is a single write, not a chain.** Unshare clears `shared` and bumps the room's
  `membershipEpoch` in one update; a `RoomMembership` whose `epoch` is below it grants nothing
  anywhere (REST list, WS join, every op), owner rows exempt. The deletions, revision bumps
  and socket kicks after it are cleanup that a retry or the sweeper finishes. Re-sharing never
  lowers the epoch, so a former member must join again — the row is re-stamped, not resurrected.
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
`RoomAccessService.resolve` the parsed op path runs, answering `forbidden` and dropping the room
when it fails. `leave()` emits `access_revoked` scoped `departed-member` with the leaver's
`userId`, and the gateway drops that room from that account's sockets rather than closing them:
leaving withdraws nothing the room itself grants (a shared room would still admit them as a
visitor), so a re-check would not kick them, and one socket carries every other tab.

**Every bulk clear of the plan declares itself.** `clearFactories` in `app-store.ts` replaced
both arrays and emitted nothing — no payload, no intent — so no flush was ever scheduled and the
next rebase brought the whole plan back off the server. It now routes through
`markPlanReplaced(before, after)` in `sync-intent.ts`, which declares every arriving record and
every departing one. `Templates.vue` uses the same call: a template load *is* announced (through
`calculateFactories`), but structural inference only sees ids that appeared or vanished, so a
template landing on an id it overwrites carried no intent at all. Paste-from-clipboard is covered
because it emits `clear-all` first.

**The duplicate-op ack replay goes through `deliver()`.** It was the one post-commit send still
calling `connection.send` directly, on exactly the path a client takes when its ack went missing:
a synchronous send failure escaped to the outer handler, the client got `internal_error` instead
of an ack, and its one in-flight slot never cleared. The audit that came with it moved
`onRoomDeleted`, `fanOutRoomsChanged`, `fanOutRoomMeta` and `revokeAccess` onto `deliver()` too —
each loops over sockets after a committed REST mutation, and one unwritable socket used to abort
the loop and leave the rest unnotified.

## Flagged follow-ups, none of them blocking

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
- **A voided membership row still counts toward the 25-membership cap** until the cleanup
  deletes it. Deliberate: re-stamping a row the user already holds costs no capacity, and the
  sweeper reclaims it.
- **`web/src/pages/share/[id].vue` still uses three blocking `alert()`s** for a bad or
  unparseable snapshot link. Everything built for v7 uses the toast bus; these predate it and
  were left alone deliberately, but they are the last blocking dialogs on a sync path.
- **`CHANGELOG.md` has a `## [Unreleased]` section sitting *below* the finished
  `## Beta v0.7` section**, holding the factory-icon and building-group work. Whoever cuts the
  release has to decide what that heading now means rather than assuming it is empty.

## Two defects found by the e2e suite, both fixed here

Keep these: the shapes recur, and the second one bites twice.

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
  that swaps the whole plan out: `clearFactories` in `app-store.ts` and the template loader.
  Everything that edits stored content calls one of those: the name
  field and hidden/game-sync chips (`PlannerFactory.vue`), tasks, notes, icon, groups
  (`useFactoryGroups.ts`), show/hide-all and the reorder family (`Planner.vue`), the building
  groups row (`BuildingGroups.vue`, `BuildingGroupsSection.vue`), all five export calculators,
  blank product/generator/import rows, `usePowerTarget`, and `addFactory`/`removeFactory` in
  `app-store.ts` for their own reindex. Calculation entry points need no call —
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
