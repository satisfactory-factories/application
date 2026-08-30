# Update 6 — Change Log and the "What's new" slides

Branch: `update6` (PR #512). Everything below ships in that PR.

**Status: built.** Every task below is done bar the launch video, which needs a real YouTube ID
in `SplashV6.vue`'s `launchVideoId` before merge — the embed renders only once that is set.

Beta v0.6 is "The Groundwork Update" (renamed from "The Mining Update" as its scope grew past
mining). Two user-facing artefacts need writing before it launches: the
in-app **Change Log** page, which currently covers only the mining half of the release, and a
**What's new** slide deck, the equivalent of the Beta v0.5 splash. `CHANGELOG.md` already carries
the full technical record under `[Unreleased]` and stays there — the release is deliberately not
version-stamped in that file yet.

## Tasks

- Rewrite the Change Log page's "Raw inputs are no longer assumed" paragraph, which describes a
  global switch and per-factory overrides that do not exist — the assumption was removed outright.
- Expand the Beta v0.6 section of `web/src/pages/changelog.vue` to cover every feature merged
  since v0.5, not just mining. The page is the complete record; the slide deck is a highlights
  reel and is deliberately selective.
- Make the automatic showing unskippable: no cross, no click-outside, no escape, slide 1's Next
  disabled until the warning is answered, and the exit only at the end of the tour. The answer
  buttons live in the footer so they can't scroll away. A manual reopen from **Show changes** is
  unlocked — by then it is reference material.
- Let the v0.6 splash take the raw-resources breaking notice over rather than queuing behind it:
  slide 1 is that warning. The notice is deferred, not marked seen, so an unanswered one comes
  back on the next load. The warning shows for everyone; only the wizard offer is conditional on
  the store having raised the notice for an existing plan.
- Add an `openRawWizard` event so the splash's wizard button works: the wizard is local state
  inside `OptionsDialog.vue` and is not reachable from anywhere else today.
- Gate the v0.6 splash on the `introToggle` event rather than reading `dismissed-introduction`
  once at setup. The v0.5 splash reads it once, so a new user who dismisses the introduction
  never sees the splash in that session.
- Close the v0.6 splash before opening the v0.5 one, so two dialogs are never active at once.
- Cover the gating with a spec: first run, already seen, manual reopen, the breaking-notice wait,
  and the hand-off to v0.5.
- Build `web/src/components/SplashV6.vue`: seven slides, same shape as the v0.5 splash.
- Keep `Splash.vue` (v0.5) mounted but manual-only, reachable from the last v0.6 slide.
- Add a `splashShowV5` event to `web/src/utils/eventBus.ts` and point the header's
  "Show changes" link at the v0.6 splash.
- Bump the header chip in `Navigation.vue` from `BETA v0.5` to `BETA v0.6`.
- Capture the new screenshots into `web/public/assets/changelog/beta6/`.
- Leave a marked YouTube slot on slide 1 for the launch video, and put it at the top of the PR
  as a manual step.

## What is in the release

Taken from `CHANGELOG.md`'s `[Unreleased]`, which is the authority:

| Area | Where it goes |
| --- | --- |
| Mining: mines, miner marks and node purity, resource wells, water & oil | Slide 2 |
| BREAKING: raw resources are no longer assumed | Slide 1 |
| The Raw Resources Wizard | Slide 3 |
| Factory groups | Slide 4 |
| Factory icons | Slide 5 |
| Factory status indicators, tasks reordering, sidebar active-factory indicator, Export Calculator belts & pipes, satisfaction jump-to-factory | Slide 6 |
| Ghost exports, plan repair on load, rounding drift, the rest of Fixes | Slide 7 |
| Backend health check, Vuetify 4, ESLint 10, lockfile consolidation | Change Log page only — not slide material |

## The slide deck

Seven slides, mirroring the v0.5 splash: a `v-dialog` holding one `v-if`'d block per slide, a
`slides` array driving the counter and the prev/next labels, and a contents list on slide 1 that
jumps straight to any of them.

1. **Breaking change — raw resources are no longer assumed.** Leads the deck because it is the
   thing that changes what every existing plan reports. Reuses the copy and the three-way image
   toggle (Miners / Resource wells / Water) already written for the notice in `OptionsDialog.vue`,
   the "what this means for your existing plans" alert, and a button into the wizard. Carries the
   video slot and the contents list.
2. **Mining.** Mines as factories, miner mark and node purity per building group, resource wells
   with their satellite nodes, Water Extractors and Oil Extractors. Screenshots exist.
3. **The Raw Resources Wizard.** The migration path: what it lists, what it builds, one mine per
   resource for the whole plan, the confirmation screen and the backup button, and that it writes
   nothing until you confirm.
4. **Factory groups.** Coloured collapsible folders, the sidebar tree, drag between groups,
   multi-group edit, and that deleting a group never deletes a factory.
5. **Factory icons.** 352 icons, the picker, search, and where the icon shows up.
6. **More in the planner.** Status indicators, tasks reordering, the active-factory indicator,
   Export Calculator belts and pipes, jump-to-requesting-factory.
7. **Fixes, and where to read more.** The ghost-export family, plan repair on load, the rounding
   drift repair. Ends with two buttons: the full Change Log, and **Missed Beta v0.5?** which opens
   the old splash.

### Wiring

`Splash.vue` keeps its `seenV51Splash` key but stops auto-showing — otherwise a new user gets two
decks back to back. It shows only on the `splashShowV5` event, emitted by the button on slide 7.
`SplashV6.vue` takes over the auto-show, keyed on `seenV6Splash`, gated on the introduction having
been dismissed exactly as the v0.5 one is, and on the `splashShow` event the header already emits.

## Screenshots

Into `web/public/assets/changelog/beta6/`, captured from the demo plan in headless Chromium at a
fixed width. The demo plan now carries icons and a Copper group, so it shows both features
without any setup.

| File | Shows | Status |
| --- | --- | --- |
| `miners.png`, `resource-well.png`, `water-extractor.png` | Mining | Already shipped |
| `wizard.png` | The Raw Resources Wizard mid-run | To capture |
| `factory-groups.png` | Sidebar tree plus a planner group band | To capture |
| `factory-icons.png` | The icon picker open | To capture |
| `status-chips.png` | A factory carrying shortage and out-of-sync chips | To capture |
| `tasks.png` | The tasks card with its handles and checkboxes | To capture |

No placeholder paths: a named file that doesn't exist renders as a broken image in the app. A
slide whose capture doesn't come out ships as text until the real file lands, and the gap goes at
the top of the PR. The launch video is bound to an ID constant that starts empty, with the embed
behind a `v-if`, so nothing renders until the real ID replaces it.

## Deliberately not doing

- No version stamp in `CHANGELOG.md`. The entries stay under `[Unreleased]` even though the
  features are on `main`, because the release is the update6 merge.
- No new content for the Alpha v0.4 or Beta v0.5 sections of the Change Log page.
- The v0.5 splash's copy is not rewritten. It is kept exactly as it shipped, only re-pointed.
