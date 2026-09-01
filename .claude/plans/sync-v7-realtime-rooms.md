# v0.7.0: Realtime sync, rooms, and the backend rewrite

Status: revision 8. Reconciled with the built backend (2026-08-28): `POST /share` stays —
snapshot links must remain creatable, so "read-only" applies to existing legacy rows, not
the collection; a deleted room sends `room_deleted` and drops that room from the socket
without closing it (one socket carries many tabs); the opId ring is 50; an unshared room's
slug stays reserved so re-sharing restores the same link. Revision 7 dropped `/hello`,
targeted version 0.7.0, made the room document the single authoritative copy for
collaborative tabs (memberships are references, never data), tightened member rights to
content-only, and trimmed `helpText` from the preferences list.
Revision 6 added the local/synced tab choice, the two-link model (snapshot vs collaboration
invite), optional invite passwords, owner-based revocation, and record-only activity
logging. Survived three Codex plan reviews (`6cbaf4bd73c7`, `cc3deea30a04`,
`ec59f7788a68`); all objections folded in. Pending final approval.
Branch: `claude/sync-mechanism-refactor-7b021b`. Date: 2026-08-27.

## What this is

The v0.7.0 headline feature. Today the planner saves one tab as a blob every 10 seconds and the
last writer wins. We replace that with synced tabs: a tab the user chooses to sync lives on
the server as a room, changes flow both ways over a WebSocket in real time, a synced tab can
be opened to live collaboration by invite link (optionally password-protected), snapshot
share links stay separate and read-only-in-time, preferences follow the account, offline use
is a first-class mode, and the backend is rewritten in NestJS. The v0.7.0 changelog modal is a
separate later session.

## Tasks

### Frontend

- Rewrite `sync-store.ts`/`auth-store.ts` as real Pinia stores; kill the leaking closure factories
- Build the room-sync store: native WebSocket, reducer over server messages, close-code-driven reconnect backoff
- Build the two-set op builder (user-touched intent vs changed payload, one op in flight, ack from the sent snapshot)
- Implement the shared rebase path (reject, reconnect, inbound-over-pending, disconnect-before-apply)
- Route every user mutation of synced content through `sync-intent.ts` so it declares intent, never from a watcher; keep the enumeration current when a new stored field gets an editor
- Build offline mode: manual airplane-mode toggle, offline-detection prompt, full backend silence while on, rebase-and-sync on exit
- Persist per-tab sync metadata (`revision`, `appVersion`, user-touched ids) in a sidecar map; `localStorage.factoryTabs` keeps today's exact shape
- Build the new-tab chooser on the plus button: Local tab (default, no account) vs Synced tab (account required, benefits pitched), plus the one-time discovery nudge dot
- Model the tab lifecycle in `app-store`/`TabNavigation`: local / synced / joined, with per-tab state icons (desktop = local, single user = synced, multi-user = collaborative; FontAwesome — toggle a wrapper span, never `:class`-flip the `<i>`, per the FA dynamic-icon gotcha memory)
- Add "Duplicate as local tab" and the revocation handler (membership lost or room deleted → the tab quietly becomes a local copy)
- Add the `/room/:slug` page: resolve the slug, take the password when one is set, join (membership when logged in, visitor token when not), open the tab live
- Build the share dialog with two clearly separated actions: "Copy snapshot link" (read-only copy, any tab, no account) and "Invite collaborators" (synced tabs; slug; optional password set/change/remove; copyable link)
- Build login-time adoption as an offer per tab ("Sync your planner tabs now?"), "(local)" suffixes, and the "Recover server copy" button
- Gate the staggered loader behind "calculation actually happened"; instant render when revision + app version match
- Build the preferences sync store (enumerated semantic keys, debounced PUT with `baseRevision`)
- Overhaul the account tile: change-password, connection state, offline switch, synced-tab list + share controls
- Add the fetch wrapper sending `X-App-Version` and the persistent refresh prompt on 426/4426
- Wire the notes field to the field-lock protocol: claim on focus, renew on keystroke (throttled), release on blur, and disable the input while a peer holds it
- Extend field locks to the remaining text and number inputs once notes proves the mechanism: the factory name, tasks, group names, the export calculator fields and the notes' number-input neighbours

### Backend

- Scaffold NestJS: Mongo via `@nestjs/mongoose`, config, `/health` byte-identical, SIGTERM graceful shutdown; `/hello` is dropped (it duplicates `/health`)
- Port auth: `/register`, `/login`, `/validate-token`, new `/me/password`; JWT guard; boot assertion on `JWT_SECRET`
- Build `Room` (revision, tombstone, opId ring, `passwordHash`, `passwordVersion`), `RoomMembership`, `UserPreferences`, and capped `RoomActivity` schemas
- Build rooms REST as resume-aware ensure-steps: list, create, rename, tombstone-first delete, leave, reorder, share/unshare, slug lookup, `POST /rooms/:id/auth` (password → visitor token), join, create-only adopt, password set/rotate/remove
- Build the WS gateway: hello/join → snapshot-or-up-to-date, serialized per-room apply with revision-guarded writes and opId dedup, live access re-checks (membership, shared flag, visitor-token `passwordVersion`), Origin check, heartbeat, throttles, `maxPayload`
- Hold the advisory field locks in the gateway: claim/renew/unlock, 10s expiry swept on the heartbeat, released on every socket-drop path, broadcast as `field_locks`
- Implement metadata fan-out: room changes bump every member's `roomsRevision` and notify every affected user channel
- Record activity: stamp actor + timestamp + kind on every accepted op and meta mutation into `RoomActivity` (capped per room; no UI in v0.7.0)
- Implement the hourly sweeper: tombstoned rooms (any state), membership-less non-shared rooms older than 24h, activity-log trim
- Enforce the validation/caps table through the shared zod schemas; port today's truncation exactly
- Keep `GET /share/:id` read-only on the existing collection; `/save` and `/load` return 410
- Add the version gate (426 + typed body; exempt `/health` and `GET /share/:id`)
- Fix CORS: real web origins, `X-App-Version` in allowed headers

### Between them

- Create the `common` workspace package: message unions, zod schemas, `PROTOCOL_VERSION`, canonical `Factory`/`FactoryTab` types
- Write the complete zod `Factory`/`FactoryTab` schema with the caps table — the persistent-data boundary
- Declare bulk removals on the wire: `bulkRemoval` past `BULK_REMOVAL_THRESHOLD`, set only by a whole-plan replacement and only for the ids it removed; refuse an undeclared burst with a snapshot to rebase onto, and stash the pre-op plan as `lastBulkRestore`

### Infrastructure and proof

- Wire `common` into `pnpm-workspace.yaml`, the root lockfile, the Dockerfile manifest-copy layer, and the build order
- Move the backend image to compiled `dist/`; same image name, port, healthcheck
- Write the backend vitest suite (routes, gateway, concurrency, injected-failure ensure-steps, passwords + rotation, sweeper, fan-out, activity log, gate, CORS, caps)
- Write the Playwright multi-client e2e suite (list at the bottom) and wire it into CI
- Update Dockerfile, compose docs, `docs/deployment.md`; write the release runbook; manual box steps loud at the top of the PR
- Update `CHANGELOG.md`; bump to 0.7.0

### Cloud plan offload (post-review round) — delivered

The shared model for this round: a cloud plan is OPEN in a browser when a local tab exists
for its roomId and HIDDEN when the account room exists with no local tab. The tab bar is the
per-browser open set; nothing extra is persisted, and hiding never touches the server room.

- Add `openPlan(roomId)` / `hidePlan(roomId)` to `rooms-store` — open creates the tab from the
  list entry and tracks the room (the socket join fills the content), hide untracks and removes
  the tab, its state and its mirror meta while leaving the room and membership alone; both
  idempotent, both refuse offline with a visible toast, hide steps off the viewed tab first and
  never empties the bar
- Stop `applyRoomList` creating tabs for rooms with no local tab, so a hidden room stays hidden
  across refreshes, reconnects and logins; login opens nothing on its own (the login chooser,
  delivered in the block below, decides through `openPlan` — that was the seam)
- Rework the account panel's My Plans / Joined Plans rows to two lines — name plus Show/Hide on
  line one, factory count plus relative last-changed (absolute in the tooltip) on line two — and
  drop the per-row share buttons (`CloudPlanRow.vue`)
- Add `factoryCount` to `RoomListEntry` (common type + backend `toListEntry` + backend test);
  additive REST field, `PROTOCOL_VERSION` unchanged
- Add `removeTab(tabId)` to `app-store` (never below one tab, selection preserved)
- Update the e2e helpers and tests that relied on rooms auto-opening: `showPlan`/`hidePlan`
  helpers in `e2e/helpers/rooms.ts`, second devices in `syncedPair`, tab-lifecycle, invite,
  preferences, offline-manual, offline-detected, loading-tab and adoption open plans via the
  panel's Show button

### The login plan chooser — delivered

Only an interactive sign-in (the `loggedIn` event, emitted by auth-store's `login()` alone)
asks; a page refresh with a persisted session restores the bar it already had and never does.

- Thread `interactive: true` from the `loggedIn` listener through `begin()` into
  `refresh({ offerChooser })`; the chooser lists the account rooms with no local tab, and an
  account with zero unopened rooms asks nothing
- Build `PlanChooserDialog.vue` on the `AdoptionDialog` pattern: one checkbox per plan (name,
  factory count, relative last-changed), all ticked by default, "Open N plans" via
  `openChosenPlans` (each through `openPlan`), "Not now" via `closeChooser`
- Park the adoption offer while the chooser is up and run it once the chooser is answered, so
  the two dialogs never stack; a sign-out clears the chooser without counting as an answer and
  drops the parked offer
- Teach the e2e session helper to answer the chooser (`signIn`'s `chooser` option, open-all as
  the expected default), make `showPlan` ensure-open, and prove the "Not now" path plus the
  reload suppression in `login-chooser.e2e.ts`

Still open for the next stage: sharing controls in the tab settings modal.

## Locked decisions

1. **Three tab types, and the user chooses.** **Local** — default, this browser only, no
   account. **Synced** — your account only; a private room server-side. **Collaborative** —
   a shared room, centralized on the server; others open it as consumers. Adoption at login
   is an offer, never forced. **Iconography makes the type unmistakable**: a desktop/PC icon
   = local, a single-user icon = synced, a multi-user icon = collaborative.
2. **Two link types, never mixed.** Snapshot links (`/share/:id`, read-only copy, any tab,
   no account) and collaboration invites (`satisfactory-factories.app/room/<three-words>`,
   live).
3. **The room document is the data; the owner is its admin.** One authoritative copy on the
   server, exactly like albion-mapper. A collaborator's account stores only a reference
   (membership = access + tab-bar position), never a second copy of the plan, so there is
   nothing to desync. Joiners see the tab in their bar on every device; local mirrors are
   render caches, never authoritative. The owner can do anything (delete, share, unshare,
   slug, password, rename); everyone else can only write content.
4. **Optional invite password.** Open link or password, owner's choice; rotation kicks
   anonymous visitors; members are not re-prompted. Password gates new joins.
5. **Revocation never destroys a collaborator's data.** Unshare (or delete) converts every
   collaborator's tab into a local copy of the last state. Two levers: rotate password =
   stop leaked links, keep members; unshare = make it fully private again, kick everyone.
6. **Anonymous visitors stay local** except joining someone's shared tab.
7. **NestJS + MongoDB/Mongoose, standalone mongod** (no transactions, no replica-set change).
8. **Old clients are cut by the version gate**; v0.7.0+ clients get a refresh prompt.
9. **Preferences sync = semantic keys only** (`showSatisfactionBreakdowns`,
   `factoryGroupCustomColors`, `buildingGroupTutorialOpened`,
   `dismissed-introduction`, `statistics*Hidden`, `summaryHidden`, `shortageJumpToFactory`).
   Device-shaped values stay local.
10. **Password work is change-while-logged-in only**; email reset (Mailgun) later.
11. **Offline mode is first-class**: manual toggle plus graceful detection.
12. **Activity is recorded, not rendered.** Who/when/what lands in a capped per-tab log now;
    the history UI is a follow-up.
13. **Playwright** for the live two-browser tests; one v0.7.0 headline release; `main` stays
    shippable until the branch lands; `tab-sync-v2` is a design reference only.

---

## Frontend

**Tab bar.** A tab is `local` (localStorage only), `synced` (a private room, your account
only), `collaborative` (a shared room — yours as owner, or someone else's as member), or
`joined` (an anonymous pointer into someone's shared tab). In every non-local case the room
document on the server is the only authoritative copy; the browser holds a render cache. Badges make the state
visible at a glance. The plus button opens a small chooser: **Local tab** — lives in this
browser, no account; **Synced tab** — needs an account, syncs across your devices, supports
live collaboration and invites; chosen without an account, the chooser swaps its body for the
sign-in/register form and makes the tab once that lands. New visitors default to local; a
one-time nudge dot on the plus button advertises the rest. A local tab's UUID becomes its room ID if it is ever
synced, so identity never changes. Synced tabs still write full content to
`localStorage.factoryTabs` in today's exact shape (the render mirror — and what makes a v6
rollback land on readable data). Sync metadata (`revision`, `appVersion`, user-touched ids)
lives in a sidecar map.

**Sharing UI.** One dialog, two clearly separated actions:
- **Copy snapshot link** — a frozen, read-only-in-time copy anyone can open. Works for any
  tab, no account. This is today's `/share` and it stays.
- **Invite collaborators** — synced tabs only. Shows the three-word slug (or a custom one,
  checked live), the optional password controls (set, change, remove), and the copyable
  `satisfactory-factories.app/room/<slug>` link.

**Collaboration lifecycle.** A joiner who is logged in becomes a member: the tab appears in
their bar on every device, live. A logged-out joiner gets a `joined` pointer in this browser.
"Duplicate as local tab" gives anyone an independent copy at any time. If the owner unshares
or deletes, every collaborator's tab quietly converts to a local copy with a small notice —
data kept, live link dead.

**Sync client.** One WebSocket when signed in or in a joined tab. A reducer applies server
messages to the store. Close codes drive reconnection: `4401`/`4403` stop, `4426` prompts
refresh, anything else backs off 1s → 30s and resyncs from a snapshot.

**Offline mode.** Two ways in: the manual airplane-mode switch in the account tile (total
backend silence — no WS, no REST, no retries), or detection — after a few failed reconnects
or a browser offline signal, a friendly prompt: "You appear to be offline. Your data will
sync when you're back online. Go into offline mode?" Accept → same silence. Decline → quiet
retrying continues. Leaving offline mode is manual, like a phone. On exit: reconnect,
snapshot, rebase kept edits, recalc, send. User-touched ids are persisted, so offline edits
survive a browser restart. No blocking alerts anywhere; queued preference writes flush on
exit.

**Loading.** The staggered loader runs only when calculation actually happened. A tab switch
where the revision matches the mirror and the mirror's app version is current renders
instantly. Everything else goes through the full `initFactories` validation/migration path.
Server data stops bypassing the loader funnel.

**Account tile** (replaces `Auth.vue` + `Sync.vue`): username, change-password, logout, live
connection state, the offline switch, the synced-tab list with share controls and a
last-changed time per plan, "Recover server copy". The old OOS dialog and force-download
button die.

**Adoption on login.** Every login, every browser: local tabs the server does not know get a
per-tab offer to sync ("Sync your planner tabs now?"). Never forced, create-only, "(local)"
suffix on name collisions, content never merged.

**Version prompt.** A fetch wrapper adds `X-App-Version`; any 426 or WS 4426 shows a
persistent "new version available — refresh" prompt.

## Backend

**Data model (Mongo).**
- `Room`: `{ roomId (uuid, unique), slug (unique sparse), name, shared, deletedAt,
  passwordHash: string|null, passwordVersion: number, membershipEpoch: number, factories,
  powerTarget, groups, revision, appliedOps ring, createdBy, timestamps }`. Tab-level fields
  finally persist.
- `RoomMembership`: `{ userId, roomId, role owner|member, order, epoch, joinedAt }`, unique on
  `{userId, roomId}`. **Carries access and tab-bar position only — never plan data.** The
  room document is the single source of truth for a synced tab's content. `epoch` is the
  room's `membershipEpoch` at the moment the row was granted; below it the row is void.
- `RoomActivity`: `{ roomId, at, actor (userId or 'anon'), kind, summary? }`, capped per
  room (~200; the sweeper trims). Written on every accepted op and meta change. **No UI in
  v0.7.0** — the data is simply ready for the history feature later.
- `User`: + `roomsRevision`, `legacyImportRoomId`. `UserPreferences`: `{ userId, prefs,
  revision }`.
- Legacy `FactoryData` (keyed by username) stays read-only forever. `Share` keeps accepting
  new snapshot rows via `POST /share` (zod-validated, version-gated, 5-per-5-min throttled);
  existing rows are never rewritten. New data keys on userId; the JWT carries both.

**REST.** Auth (`/register`, `/login`, `/validate-token`, `/me/password`), rooms (list mine,
create, rename, delete, leave, reorder, share/unshare, password set/rotate/remove,
`GET /rooms/by-slug/:slug` — internal API only, users see `/room/<slug>` —
`POST /rooms/:id/auth` exchanging a correct password for a visitor token,
`POST /rooms/:roomId/join`, `POST /rooms/adopt`), preferences (GET/PUT), legacy
(`GET /share/:id` and `POST /share` for creating snapshot links; 410 on `/save`//`/load`),
`/health` unchanged. `/hello` is dropped — it duplicates `/health` and should have gone
when `/health` landed.

**Join and password rules.** Slug lookup resolves only shared, non-tombstoned tabs. Joining
needs: a membership, **or** `shared` with no password, **or** `shared` plus a visitor token
whose `passwordVersion` is current. Logged-in joiners clear the password once, then hold a
durable membership. Rotating the password bumps `passwordVersion`, which invalidates every
visitor token and closes those sockets `4403`. Unshare removes all non-owner memberships,
closes non-owner sockets `4403`, and deactivates the slug — the "make it private again"
lever; clients turn their copy into a local tab.

**Unshare revokes in one write.** Clearing `shared` and bumping `membershipEpoch` are the
same document update, so from that instant every non-owner membership is void whether or not
the row still exists: access resolution (REST list, WS join, every mutating op) treats a
non-owner row below the room's epoch as absent, and the owner's own row is exempt. Membership
deletion, the `roomsRevision` bumps and the socket kicks are recoverable cleanup after it — a
retry or the sweeper finishes them, and a row that lingers grants nothing. **Re-sharing does
not restore the old collaborators**: the epoch is never lowered, so a former member gets back
in only by joining again, which re-stamps their row at the current epoch.

**An authorization and the room it authorizes are one operation.** The room read and the
membership read are two operations and an unshare fits between them, so a voided row can agree
with a room copy from before the revocation and authorize a snapshot of a room that is already
private. `RoomAccessService.authorize` reads the room, resolves, re-reads, and retries (bounded,
then refuses) unless `membershipEpoch`, `passwordVersion`, `shared` and `deletedAt` are unmoved;
it returns the room copy the decision is true of, and **a snapshot may be built from that copy
and no other**. The op write carries the same fingerprint into its filter for non-owners —
`membershipEpoch`, plus `passwordVersion` for a visitor — because neither revocation lever
touches `revision`, so the revision guard alone would let a just-revoked op commit. Owners are
exempt everywhere: they never lose their own room, and guarding them would refuse the op an
owner had in flight across their own share or password change.

**Multi-document safety without transactions.** Every mutation is a chain of individually
idempotent "ensure" steps; a retry resumes at the incomplete step instead of aborting on a
duplicate key:
- *Create/adopt*: ensure room (duplicate → mine-with-membership = done; mine-without =
  resume; someone else's = client re-keys with a fresh UUID) → ensure membership → bump
  `roomsRevision` (re-bumping is harmless).
- *Delete is tombstone-first*: one owner-authorized write sets `deletedAt`; from that instant
  the room is inert (joins refused, ops refused, slug 404, sockets told `room_deleted`).
  Cleanup follows, authorized by the tombstone itself, so no partial failure can strand a
  live shared room.
- *Sweeper (hourly)*: tombstoned rooms regardless of state; membership-less non-shared rooms
  older than 24h (adoption resumes at next login, well inside that); activity trim.
- *Fan-out*: rename/share/unshare/delete/password changes bump **every** member's
  `roomsRevision` and notify every affected user channel; joined sockets also get
  `room_meta`/`room_deleted`. Clients refetch the tab list on every connect, so a lost
  notification only delays freshness.

**WS gateway.** Token (account JWT or visitor token) rides in the `hello`/`join` messages,
never the URL, and access is re-verified on every mutating op. Origin checked at upgrade
(anti-CSRF hygiene, not authorization). Server `ws` ping/pong heartbeat. Connection and
message throttles, explicit `maxPayload`, snapshot sends serialized per client with a queue
cap. A DB failure during handshake closes retryable, never `4401`. **Once the room write has
committed, nothing may stand between it and the ack**: the activity row and every socket send
are best-effort and logged, because a client that loses its ack never clears its one in-flight
slot and stops editing entirely. The same holds for the REST meta mutations — a committed
unshare or rename is never reported as a 500 because its audit row failed.

**Roles.** Owner: everything — delete, share, unshare, slug, password, rename. Member: edit
content and leave, nothing else. Anonymous visitor: edit content only.

**Validation and caps.** `Room.factories` is `Mixed`, so the shared zod schema is the real
data boundary — full `Factory`/`FactoryTab` shape, unknown keys stripped, numbers finite:

| Field | Rule |
| --- | --- |
| Room/tab, factory, group names | truncate 200 (today's behavior) |
| Factory notes | truncate 1000 |
| Task titles / count | truncate 200 / 50 |
| Slug | reject unless `^[a-z0-9-]{1,100}$` after lowercasing |
| Invite password | reject outside 1–100 chars (bcrypt-hashed at rest) |
| Group color | reject over 32 chars |
| Factories per room | reject over 300 |
| Rooms per user (owned) | reject over 10 |
| Memberships per user (owned + joined) | reject over 25 |
| Any other string | reject over 10k |

Truncation applies identically to ops, adoption, and blob import.

## The mechanisms between them

**The `common` package.** One workspace package both apps import: message unions, zod
schemas, `PROTOCOL_VERSION`, canonical `Factory`/`FactoryTab` types. Retires the
hand-duplicated backend interface file.

**Wire protocol.**
- Client → server: `hello {token?, protocolVersion}`, `join {roomId, lastRevision?,
  visitorToken?}`, `op {roomId, opId, baseRevision, diff, bulkRemoval?}`, `leave {roomId}`,
  `lock {roomId, fieldKey}`, `unlock {roomId, fieldKey}`.
- Server → client: `hello_ok`, `snapshot {room, revision}`, `up_to_date {revision}`,
  `op_ack {opId, revision}`, `op_apply {revision, diff}`, `op_reject {opId, reason,
  snapshot}`, `room_meta`, `room_deleted`, `rooms_changed {roomsRevision}`,
  `presence {roomId, count}`, `field_locks {roomId, locks}`, `error`.
- `up_to_date` is the "nothing changed, skip the reload" primitive.

**Advisory field locks.** A focused text or number input is locked for everyone else, so
two people cannot type into one notes box and have the last write win. The client mints
opaque keys (`notes:<factoryId>` to start with, so a further field is client wiring
alone); the server treats them as strings, capped at 128 characters and 32 live locks per
socket. `lock` claims or renews, keystrokes renew it, `unlock` releases on blur, and a
claim nobody renews for `FIELD_LOCK_TTL_MS` (10s) lapses — checked lazily on access and
swept on the existing heartbeat tick, so no timer is held per lock. Every change restates
the room's whole lock list as `field_locks`, and a joiner is told what the room already
holds. **`holder` is the `connectionId` `hello_ok` handed that socket**, per connection
rather than per account, because a visitor has no `userId` and two tabs of one account
must not share a lock. Locks take the same live access check an op does and are released
on every path that drops a socket from a room, but they are advisory in the strict sense:
the op path never reads them, so the worst a wrong answer costs is a disabled input.
Simultaneous arrow presses on a number field stay out of scope.

**The client half.** `useFieldLock(roomId, fieldKey)` binds focus to a claim, input to a
renewal and blur to a release, and hands back a reactive `disabled` plus the one line the
locked-out reader sees. The store holds the room's lock map from `field_locks`, compares
each `holder` against the `connectionId` it was given, and refuses to send a frame at all
unless the tab is a *shared* room and the socket is connected: a local or private tab has
nobody to lock against. Renewals throttle to 3s, so a typist costs one frame every few
seconds. Two rules make the display honest without a second protocol. The client gives up
its **own** claim after `FIELD_LOCK_TTL_MS` of no renewal, exactly as the server would, so
a released field is announced within ten seconds rather than on the sweep three heartbeats
later; and it **never expires a lock it was shown** — a renewal is deliberately silent, so
a peer typing steadily produces no frames and a display timer would re-enable a field
somebody is in. Every held lock is released on blur, on unmount, on a tab switch, on
entering offline mode, and the whole display is dropped when the socket falls over, since
a re-join is told what a room holds only when it holds something.

**The consistency contract.** The build implements exactly this:
- What you see is always: last acknowledged server state + all your unacknowledged edits +
  a full local recalc.
- Two client-side sets against the acknowledged state: **user-touched** (factories you
  actually edited — intent, the only thing a rebase may overlay) and **changed** (everything
  the recalc changed, ripples included — what an op sends).
- One op in flight per room. Send clears nothing. An ack advances the baseline to the exact
  sent snapshot and clears only intent matching it; edits after send stay.
- The server accepts an op only at exact `baseRevision`, so every stored state was fully
  calculated by some client, and receivers apply diffs byte-identically with no recalc.
  Same-factory ties: last write wins. Different factories: both survive, via rebase.
- One shared rebase path covers reject, reconnect, inbound-over-pending, offline exit, and
  disconnect-before-apply: adopt server state, overlay user-touched, recalc, resend — or
  send nothing if nothing differs (how "it applied before the drop" resolves).
- Duplicate `opId`s in the ring return the original ack; the guarantee's honest scope is the
  single in-flight retry window, the only op a client ever retries.
- **Removals past `BULK_REMOVAL_THRESHOLD` (5) in one op must carry `bulkRemoval: true`**, which
  only a whole-plan replacement sets (clear, paste, template, demo) and only for the ids that
  replacement removed. Without it the server answers `op_reject {reason:
  'undeclared_bulk_removal', snapshot}`, so a client whose plan is half-mounted re-baselines
  instead of emptying the room. An accepted bulk removal stashes the pre-op factory array on the
  room as `lastBulkRestore`, latest only, in the same guarded write.

**Who declares intent.** Adds, deletes and tab-field divergence are inferred from the diff
(`markStructuralIntent`); everything else has to be declared, because a factory that already
exists on both sides carries no structural signal. The rule, and it is not negotiable:

- Every user mutation of persisted factory or tab content calls `markFactoryEdited` /
  `markTabEdited` (`web/src/utils/sync-intent.ts`). Payload alone (`factoryUpdated`) saves the
  plan and schedules the flush but is *not* intent, so a rebase discards it.
- **Only from a user event handler.** Never from a `watch` on the data, which also fires when an
  inbound op rewrites it — that marks a factory this client never edited, nothing clears intent
  no diff can satisfy, and the client overlays its copy over that peer's edits for ever.
- Calculation entry points are the exception that needs no call: `calculateFactory()` emits
  `factoryEdited` for the one factory the user acted on, and payload for the ripples.
- A reindex counts, and an add or a delete reindexes too. A move, a copy, a regroup, and
  `addFactory`/`removeFactory` in `app-store.ts` all rewrite `displayOrder` across the whole
  plan, so `captureOrder` before and `markReorderedFactories` after declare every record that
  actually moved. The new or removed record is structural and inferred; the ones it pushed
  along are not, and marking only the one clicked leaves them on the server's old index.
- The room *name* is deliberately outside this: the server owns it (`ownsRoom` strips it from a
  member's diff, `room_meta` overwrites it), so no UI declares name intent.

**Offline, protocol-side.** Offline mode is purely a client stance; the backend needs
nothing special. Coming back is the reconnect case of the rebase path. Stated honestly:
others' edits to the same factories you edited while away lose to yours.

**Version gate.** All API routes except `/health` and `GET /share/:id` require a
valid `X-App-Version`; WS requires `protocolVersion`. Mismatch → 426 / close 4426 → the
refresh prompt. Pre-v7 clients send nothing and are cut off (verified: no version gating
exists today).

**Adoption and legacy data.** Adoption is per-login, per-tab, and create-only. The legacy
blob auto-imports as one room only for an account with zero rooms and a browser with zero
local tabs, under a deterministic import id; otherwise "Recover server copy" imports it on
demand. The blob is never written again; the shares collection only ever gains new snapshot
rows.

## Infrastructure

**Packaging.** `common` joins `pnpm-workspace.yaml`, the single root lockfile, and the
Dockerfile's manifest-copy layer; it builds before the backend. The backend image moves from
ts-node-at-boot to compiled `dist/` — same image name, same port 3001, same healthcheck
contract, plus a SIGTERM handler that closes sockets cleanly.

**CORS, fixed deliberately.** Today's allowlist contains the API's own origin instead of the
web origin, and `X-App-Version` triggers preflights. The new config allows the production
web origin + `localhost:3000`, and the header. Without this, v0.7.0 could not call a single
gated endpoint in production.

**Release runbook.**
1. Merge; backend deploys first. Pre-v7 clients lose save/load/login; `/health` and share
   links keep working.
2. Verify from the production origin: a preflighted `X-App-Version` request succeeds, and a
   WS upgrade completes through the Cloudflare tunnel.
3. Web deploys to Vercel minutes later. Refreshes get v0.7.0.
4. The breakage window is those minutes plus stale open tabs. Accepted, announced.
5. Rollback: retag the previous backend image, revert the Vercel deploy. Legacy data was
   never written and mirrors kept `factoryTabs` v6-readable, so both server and browser land
   on usable state. Room edits made inside the window do not back-port.

**Manual steps (loud at the top of the PR).** Verify the tunnel passes WebSocket upgrades;
confirm `JWT_SECRET` is set in the box's env file (boot now refuses to start without it).

**Accepted risks.** Deploys drop every socket (clients resync via snapshot). Single server
process by design. Big-plan snapshots stay large, bounded by `maxPayload` and the per-client
send queue.

## How we prove it

**Backend (vitest + supertest + mongodb-memory-server + `ws`).** Routes; handshake
auth/version/DB-failure; snapshot vs `up_to_date`; interleaved two-client ops; duplicate
`opId` replay; stale-base reject; password join (right, wrong, none-set), rotation
invalidating visitor tokens mid-session; unshare removing memberships and closing sockets;
tombstone delete with an injected failure after each write; ensure-step resumption from
every partial state; adoption UUID disambiguation; sweeper (tombstones, orphans, sparing
fresh adoptions, activity trim); fan-out reaching a second member; activity rows on ops and
meta changes; caps and truncation vs rejection; gate exemptions; CORS preflight.

**Web unit (vitest).** Reducer; two-set op builder; the rebase path including
disconnect-before-apply with edits after send; offline-mode state machine (manual, detected,
prompt, exit); new-tab chooser and tab lifecycle (local → synced, revocation → local copy);
mirror shape stays v6-readable; preferences merge.

**Playwright e2e (two browser contexts, real backend + WS).**
- A edits, B sees it within 2s; deep-equal of both clients after quiesce.
- Same-factory simultaneous edits converge on one winner; different factories both survive.
- Tab create/rename/delete/reorder propagate to a second logged-in device once it opens the
  plan from the panel (rooms never open tabs on their own); a hidden plan stays hidden
  across a reload and Show restores it with its content; the owner's rename reaches a
  member's device; a member's rename attempt is refused.
- New-tab chooser: local by default, synced requires login.
- Invite flow: share a tab, join by `/room/<slug>` logged-out and logged-in; the joined plan
  opens from the panel on the joiner's second device; snapshot link still imports a frozen
  copy.
- Password: set one, wrong password refused, correct password joins, rotate kicks the
  anonymous visitor, member stays.
- Unshare: collaborator's tab converts to a local copy with the last state intact.
- Manual offline mode: edits accumulate, zero network calls, exit syncs, B converges.
- Detected offline: kill the network, prompt appears, accept, edit, restore, exit offline,
  everything syncs — including an edit in flight at the kill.
- Two browsers, different local tabs, same fresh account → both adopt, nothing stranded.
- Version bump → refresh prompt. Preferences set in A appear on fresh login in B.

CI gets a new job running the e2e suite headless.

## Out of scope (v0.7.0 follow-ups)

Email password reset (Mailgun), the v0.7.0 changelog modal, the activity/history UI (data is
recorded from day one), on-select factory rendering rework, room read-only lock, presence
cursors/avatars (bare occupancy count only if free), the Vue Flow graph rebuild
(`graphPosition` is already optional in the payload schema), horizontal backend scaling.
