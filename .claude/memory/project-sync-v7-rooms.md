---
name: project-sync-v7-rooms
description: v7 realtime rooms sync — built and green on branch claude/sync-mechanism-refactor-7b021b; contract in .claude/plans/sync-v7-realtime-rooms.md, file map and follow-ups here
metadata:
  type: project
  volatility: hot
  lastVerified: 2026-08-28
---

The v7 headline feature (version 0.7.0): realtime WebSocket sync with rooms, replacing the
10-second last-write-wins blob sync, plus a NestJS backend rewrite. The binding contract is
`.claude/plans/sync-v7-realtime-rooms.md` (revision 8, reconciled with the built backend).

**Status: the build is complete on branch `claude/sync-mechanism-refactor-7b021b` and not yet
merged — no PR has been opened.** Every task line in the plan is delivered bar the four
deliberate v7 follow-ups (history UI, presence beyond an occupancy count, email password
reset, the v7 changelog modal). Green as of 2026-08-28: backend 236 vitest tests, common 68,
web 1694 unit tests, 22 Playwright e2e tests, `vue-tsc` clean, root `lint-check` clean, root
`build` clean. The e2e job in CI has never actually run — it is validated locally only, so
the first PR is where it gets proved.

## Where things live

| Concern | Path |
| --- | --- |
| Wire protocol, zod data boundary, caps table | `common/src/` (`types/protocol.ts`, `schemas/`, `caps.ts`) |
| Sync engine, two-set op builder, rebase, offline state machine | `web/src/stores/room-sync-store.ts` |
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

## Flagged follow-ups, none of them blocking

- **`revokeAccess` closes the whole socket, not just the room.** `room.gateway.ts` drops a
  *deleted* room from each connection and leaves the socket alive, which is right — one
  socket multiplexes every synced tab. Revocation (unshare, password rotation) instead closes
  the connection `4403`, and 4403 tells the client to stop reconnecting, so losing access to
  one shared tab takes the user's other synced tabs offline until a reload. A `room_revoked`
  frame mirroring `room_deleted` would be the cheap fix.
- **A partial unshare leaves a socket receiving broadcasts it can no longer earn.** The epoch
  denies that socket every read it asks for and every op it sends, but the kick rides on
  `access_revoked`, which is emitted only once the whole chain finishes — so until the owner
  retries, or that peer sends its own op (rejected `forbidden`, which drops it from the room),
  it still receives `op_apply` fan-out. Emitting `access_revoked` straight after the first
  write would close it; it was left as prescribed cleanup deliberately, so the lingering-row
  case stays reproducible in `backend/test/rooms-unshare-revocation.spec.ts`.
- **Adoption and joined-tab upgrade are sequential by necessity.** `adoptTabs` and
  `upgradeJoinedTabs` in `rooms-store.ts` walk their tabs one at a time, because each server
  call is a chain of non-transactional ensure-steps and there is no transaction to make a
  batch atomic. A failure part-way leaves some tabs adopted and the rest local; they are
  simply re-offered at the next login. Parallelising or batching this is a replica-set
  conversation, not a client one.
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
  touched factories — so a notes-only or icon-only edit that never declared intent was
  discarded by every recovery path, offline exit included. `PlannerFactoryNotes.vue`,
  `FactoryIconDialog.vue` and `useFactoryGroups.ts` (a regrouping writes `factory.group`, same
  shape) now all declare it.

  **The trap, which cost a full e2e run to find: the emit must not come from a Vue watcher on
  the data.** A `watch(() => props.factory.notes)` also fires when an inbound op rewrites that
  note, so the client marks a factory it never edited as touched — and nothing clears intent
  that no diff can satisfy, so it overlays its copy over that peer's edits from then on. The
  notes card therefore emits payload from the watcher and intent from `@update:model-value`
  and the Clear button; the other two emit from click handlers, which were always safe. Adds
  and deletes need none of this: `markStructuralIntent` infers them from the diff.

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
