# Update 7 — the "What's new" slide deck

Beta v0.7 is **"Realtime sync, rooms and offline mode"**. It is merged and live: `main` is at
v0.7.0 (#674) plus the live-cutover hotfix #678. The `beta7` branch is gone.

`CHANGELOG.md` is complete and is the authority for this deck. The in-app Change Log page
(`web/src/pages/changelog.vue`) still carries only the pre-sync half of v0.7, because it was
written before the sync work landed, and it still reads "In development". Both need finishing.

The deck is a highlights reel. The Change Log page is the complete record.

## Tasks

Done:

- ~~Build `web/src/components/SplashV7.vue`: eight slides, same shape as `SplashV6.vue`.~~
- ~~Expand the Beta v0.7 section of `web/src/pages/changelog.vue` to cover sync, rooms, offline
  mode, the account panel, import/export and the backend rewrite.~~
- ~~Add a `splashShowV6` event to `web/src/utils/eventBus.ts`.~~
- ~~Make `SplashV6.vue` manual-only: stop it auto-showing, show it on `splashShowV6` only.~~
  The raw-resources breaking notice goes back to `RawMigrationPrompt.vue` with it: the v0.6 deck
  took that warning over while the two shipped together, and they no longer do.
- ~~Point the header's "Show changes" link at the v0.7 deck.~~ It emits `splashShow`, which
  the v0.7 deck now answers and the v0.6 deck no longer does.
- ~~Gate the v0.7 deck on `seenV7Splash` and on the introduction having been dismissed, exactly
  as the v0.6 deck is gated.~~
- ~~Cover the gating with a spec: first run, already seen, manual reopen, hand-off to v0.6.~~
  `SplashV7.spec.ts`, and `SplashV6.spec.ts` cut down to its manual-only surface.
- ~~Version-stamp the v0.7 section of `CHANGELOG.md` and drop "_In development._", and the same
  on the Change Log page's heading.~~ 09/Sep/2026, the date #674 and #678 landed.
- ~~Reword `CHANGELOG.md`'s v0.7 opening line.~~

- ~~Polish the account panel before its slide is captured.~~ Merged as #680 and pulled into this
  branch.
- ~~Restructure the deck around the four features the release is actually about.~~ Renamed it the
  **SINKronisation Update**, on the pun the two headline features hand you.

Outstanding:

- Record the headline demo: two browser windows side by side, one edit, both screens moving.
  `video-placeholder.png` stands in the slot until it exists.
- **Nine of the fifteen screenshots are captured.** The rest all need a live backend and a signed-in
  account, and must not be faked: a stubbed session renders "Not connected" with an empty Cloud tab,
  which misrepresents the feature. Still wanted: `account-panel`, `offline-switch`, `tab-local`,
  `tab-synced`, `tab-shared`, `share-tray`, `share-invite`.
- **`main`'s `Build & Test Web` is red and this PR inherits it.** `SyncSocket`'s default
  `new WebSocket(url)` opens a real socket in jsdom; under Node 24 undici throws asynchronously
  after the test has passed, so every test passes and the run still exits 1. A validated fix — an
  inert `WebSocket` stub in `web/src/setup-vitest.ts` — is posted as a comment on #679 but not
  applied, because it belongs on `main` and this branch is not the place for it.

## The slides

Eight slides. Slide 1 carries the video and a contents list that jumps to any of the others.

The release is named for the pun its two headline features hand you: you **sync** a plan and you
**sink** a surplus. Slide 1 leads on the four features everything else hangs off — realtime sync
and search on the top row, AWESOME Sinks and the Dimensional Depot beneath — the last two wearing
the game's own art and the colours the satisfaction table already gives them.

| # | Slide | What goes on it | Media |
| --- | --- | --- | --- |
| 1 | **The SINKronisation Update** | "Sync your plans. Sink your surplus." The video, then the four features as equal cards, then the contents list. | The two-browser demo; `video-placeholder.png` until it exists |
| 2 | **Every tab is local, synced or shared** | Opens on the thing to read first: **an account is never mandatory**, the planner works 100% without one. Then a heading per kind carrying that tab as it appears in the bar. Then adding a tab, with the + button ringed. | `tab-local.png`, `tab-synced.png`, `tab-shared.png`, `plus-button.png` ✅ |
| 3 | **Tab sharing** | The sharing tray, then the two links side by side in the order the tray puts them: **snapshot** on the left (the old system — a one-time link that loads a frozen copy into someone's browser, no account either end), **invite** on the right (both edit live, password optional, unshare at any time and nobody loses data). Says plainly that collaboration is the one feature that *does* need an account, and why. | `share-tray.png`, `share-snapshot.png`, `share-invite.png` |
| 4 | **Manage your plans in the new account panel** | Local and Cloud tabs, My Plans against Joined Plans, Show/Hide per plan, Change password. Then settings following your account, then **offline mode** in three lines — switch it on to stay deliberately unsynced, it kicks in by itself if the connection drops, everything re-syncs when you come back. | `account-panel.png`, `offline-switch.png` |
| 5 | **AWESOME Sinks and the Dimensional Depot** | Two sections. A sink disposes of surplus so it never backs the belt up (which is a bad thing), with the backlog warning it answers. Then Depot support: the summary table, and that an Uploader deliberately changes no number. | `sink-storage.png` ✅, `backlog-sidebar.png` ✅, `backlog-satisfaction.png` ✅, `depot-summary.png` ✅ |
| 6 | **Search the plan** | Its own slide — it is one of the four. Ctrl/Cmd+K, a factory or a part, results grouped by what each factory does with it, landing on the row it names. | `search.png` ✅ |
| 7 | **Also new in the planner** | Custom buildings, material costs, the checklist rework, generators matching fuel to supply, plans in and out as files, then an "around the edges" list. | `custom-buildings.png` ✅, `material-costs.png` ✅, `checklist.png` ✅, `generator-fuel.png` ✅ |
| 8 | **Fixes** | Four a player would notice: task edit on Enter, Fix Product counting imports, phantom export surplus, and imports for an over-committed mine. Then **Missed Beta v0.6?**. | none |

### Deliberately not on a slide

The backend rewrite entirely — nobody reading a release deck cares that the server is a new
application. Also: the shared package, the schema limits, idempotent
steps, the audit record, the version gate, the telemetry heartbeat, the loading-path changes,
the dev-tools conflict stager, the sign-in chooser, the one-time pre-v0.7 cloud recovery (a
future reader would not know what it meant), and the mechanics of what happens when two people
type into the same field at once. All of it stays on the Change Log page.

## Format

Same as the v0.6 deck, so nothing new has to be learnt or maintained:

- One `v-dialog`, `max-width` 1200 on slide 1 and 1000 elsewhere, one `v-if`'d block per slide.
- A `slides` array driving the counter, the prev/next labels and the contents list.
- Screenshots in `web/public/assets/changelog/beta7/`. A named file that does not exist renders
  as a broken image, so a slide whose capture is not ready ships as text.
- **No forced-answer gate this time.** The v0.6 deck was unskippable because raw resources broke
  every existing plan and needed an answer. v0.7 breaks nothing the user must act on — the old
  cloud save is brought over on its own — so the deck is closable from the corner throughout.
- Deck chain: v0.7 → **Missed Beta v0.6?** → v0.6 → **Missed Beta v0.5?** → v0.5.

## The headline video

Two browser windows side by side, two different accounts, in one room. A number changes on the
left and moves on the right a moment later.

`web/testing/gifs/` already records the planner with a gliding cursor and click feedback, but
every scenario in it drives one page. This needs two browser contexts recorded together and
stitched side by side with ffmpeg, and it needs the v0.7 backend running locally with two
accounts and a room. That is a new scenario in the toolkit rather than a variation on one.

## Account panel polish (forked)

Slide 5 photographs the account panel, so the panel is fixed before the capture. Forked to its
own session, working on `web/src/components/sync/AccountPanel.vue` and
`web/src/components/sync/CloudPlanRow.vue` off `beta7`:

- An aeroplane icon beside the **Offline mode** switch label. The connection chip already uses
  `fa-plane` for the offline state, so the toggle matching it is the point.
- **My Plans** and **Joined Plans** are `text-body-2` bold paragraphs, the same size as the plan
  names beneath them, so each reads as one of the plans rather than as the heading over them.
  They need to be visibly bigger.
- The factory-count chip on each plan row is `variant="tonal"` on a dark tray and reads as
  disabled. Brighten it.
- Each plan gets its own small card rather than two bare stacked lines, styled the way the
  planner's factory card headers are.
