# Update 7 — the "What's new" slide deck

Beta v0.7 is **"Realtime sync, rooms and offline mode"**. It is merged and live: `main` is at
v0.7.0 (#674) plus the live-cutover hotfix #678. The `beta7` branch is gone.

`CHANGELOG.md` is complete and is the authority for this deck. The in-app Change Log page
(`web/src/pages/changelog.vue`) still carries only the pre-sync half of v0.7, because it was
written before the sync work landed, and it still reads "In development". Both need finishing.

The deck is a highlights reel. The Change Log page is the complete record.

## Tasks

- Build `web/src/components/SplashV7.vue`: eight slides, same shape as `SplashV6.vue`.
- Record the headline demo: two browser windows side by side, one edit, both screens moving.
- Expand the Beta v0.7 section of `web/src/pages/changelog.vue` to cover sync, rooms, offline
  mode, the account panel, import/export and the backend rewrite.
- Add a `splashShowV6` event to `web/src/utils/eventBus.ts`.
- Make `SplashV6.vue` manual-only: stop it auto-showing, show it on `splashShowV6` only.
- Point the header's "Show changes" link at the v0.7 deck.
- Gate the v0.7 deck on `seenV7Splash` and on the introduction having been dismissed, exactly
  as the v0.6 deck is gated.
- Capture the screenshots into `web/public/assets/changelog/beta7/`.
- Polish the account panel before slide 5 is captured, so the screenshot is of the fixed UI.
  Forked to its own session, see "Account panel polish" below.
- Cover the gating with a spec: first run, already seen, manual reopen, hand-off to v0.6.
- Version-stamp the v0.7 section of `CHANGELOG.md` and drop "_In development._", and the same
  on the Change Log page's heading.
- Reword `CHANGELOG.md`'s v0.7 opening line. "Cloud saving is gone and live plans have taken
  its place" says the feature was removed. It was replaced: the old backend save is gutted and
  a new one is in its place. Slide 1 says it the right way round and the changelog should match.

## The slides

Eight slides. Slide 1 carries the video and a contents list that jumps to any of the others.

| # | Slide | What goes on it | Media |
| --- | --- | --- | --- |
| 1 | **Realtime sync is here** | The old backend cloud-save system has been gutted and replaced. It is still cloud saving, it is a new one. What it buys you: every tab is a first-class plan on your account rather than one blob, tabs can be shared, and two people can edit the same plan live. Contents list. | The two-browser demo |
| 2 | **Every tab is local, synced or shared** | A heading per kind, each with a picture of that tab as it appears in the tab bar sitting beside the heading: the monitor for **Local**, the cloud for **Synced**, the group of people for **Shared**. One short paragraph per kind saying what it is and what it needs. Local is still the default and still needs no account. Then the tab edit menu behind the pencil: rename, convert to cloud, convert to local, hide, share settings, delete. | `tab-local.png`, `tab-synced.png`, `tab-shared.png` (small, inline beside each heading), `tab-settings.png` |
| 3 | **Editing together** | Invite link `.../room/three-word-slug`, your own words for it, live availability. Optional password. Edits to different factories both survive; same factory settles on one. One person at a time in a text field, released after ten seconds. Stop sharing hands everyone their own copy. Snapshot link is still there and is a separate thing. | Live demo clip |
| 4 | **Offline mode** | Say plainly **where it is**: the account panel, on the cloud account tile, not under Options. Then what it does: no connection, no requests, no retries. Chip in the tab bar. Coming back is manual, like a phone. One prompt on return, listing every factory both sides touched, your figures against the live ones, product by product, and you pick. Survives a refresh. | `offline-switch.png` (the toggle in the account panel), `offline-conflict.png` |
| 5 | **Your account, your plans** | The account panel with its **Local** and **Cloud** tabs, showing what each holds. Signing in asks which plans to open instead of opening all of them. Settings follow your account. A pre-v0.7 cloud save is brought over on its own. Export plan and Import plan now do files as well as the clipboard. | `account-panel-local.png`, `account-panel-cloud.png`, `signin-chooser.png` |
| 6 | **AWESOME Sinks and the Dimensional Depot** | The Storage column. A sink disposes of surplus so the planner treats it as gone; 30 MW each. An Uploader deliberately changes no number. New "Will cause backlog" warning. New Dimensional Depot section and sidebar entry. Mercer Spheres join Power Shards and Somersloops. Upload and expansion research are saved on the plan. | `sink-depot.png`, `depot-section.png` |
| 7 | **Also new in the planner** | Search the plan (Ctrl/Cmd+K). Custom buildings — twenty of them, portals included, with real power and part demands. Material costs panel. Checklist rework: three tables, and a desynced row now says `560/min → 720/min`. Sidebar Arrange dialog and scroll-spy following. Every dialog shares one header. Statistics start collapsed. "Last updated" beside the search box. Power generators offer **Expand to supply** and **Trim to supply** against the fuel their own factory can spare. | `search.png`, `custom-buildings.png`, `material-costs.png`, `checklist.png`, `generator-fuel.png` |
| 8 | **Fixes, and where to read more** | Seven fixes, one line each: task edit on Enter, checklist ticks, Fix Product counting imports, phantom export surplus, imports for an over-committed mine, Share sharing the wrong tab, duplicate generator IDs, wizard backup zeroing a power target. Then the backend rewrite in one paragraph. Two buttons: the full Change Log, and **Missed Beta v0.6?**. | none |

### Deliberately not on a slide

Backend internals beyond one paragraph, the shared package, the schema limits, idempotent
steps, the audit record, the version gate, the telemetry heartbeat, the loading-path changes,
and the dev-tools conflict stager. All of it stays on the Change Log page.

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
