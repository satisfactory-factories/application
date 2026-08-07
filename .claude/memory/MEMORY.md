# Memory index


- [Satisfactory Factories project](project-satisfactory-factories.md) — logistics planner for the game; my architecture docs live in `docs/architecture/`
- [Renovate catalog lockfile mismatch](renovate-catalog-lockfile-mismatch.md) — why `sharedWorkspaceLockfile` must stay true; Renovate only ever commits the root lockfile
- [Backend deploy & prod drift](backend-deploy-and-prod-drift.md) — before assuming the API is deployable from `main`, or reading a green Actions run as a successful deploy
- [Building groups branch status](building-groups-branch-status.md) — in-flight overclocking/somersloop feature on branch `11-product-building-groups` (snapshot 2026-07-17)
- [Calc engine gotchas](calc-engine-gotchas.md) — double-pass recalc, load-bearing step order, migration patches, and other traps
- [Tab sync v2 rework](project-tab-sync-v2.md) — in-flight multi-tab sync on branch `tab-sync-v2`; rendering rework deferred to its own plan
- [Scope plans per session](feedback-scope-plans-per-session.md) — split big multi-part features into separate plans/branches/sessions
- [Graph rebuild plan (parked)](project-graph-rebuild-plan.md) — Vue Flow graph-view rebuild plan saved to repo `.claude/plans/graph-view-vue-flow-rebuild.md`, decisions locked, M1–M6 not started
- [AWESOME Sink plan (Beta v0.6)](project-awesome-sink-plan.md) — sink + byproduct routing plan approved, in `.claude/plans/awesome-sink-and-byproduct-routing.md`; do NOT implement during Beta v0.5
- [TDD specs fail intentionally](tdd-specs-fail-intentionally.md) — web/testing/tdd/ holds WIP specs written before implementation; failures there may be pre-existing user work
- [Dependency modernization plan](dependency-modernization-plan.md) — phased upgrade programme state; TS capped at 6.0, ESLint target 9+neostandard, vue-router pinned ~4.4.5, VNumberInput gotchas
- [Vuetify 4 migration](vuetify-4-migration-checklist.md) — done in PR #490; cascade layers invert app-vs-Vuetify precedence, and one layer bug only shows in a production build
- [Color system](color-system.md) — semantic colours live in utils/colors.ts → --sf-* CSS vars; use sfColors / semantic sf-chip classes, never new literal hexes
- [Verify: tab navigation](verify-tab-navigation.md) — puppeteer recipe for adding/switching factory tabs (:scope > add btn; factory .v-tabs = the one without "Change Log")
- [Verify: export calculator](verify-export-calculator.md) — open the tray via export chips w/ '/min' text (not the calc button); scope belt selectors to .belt-section
- [Icon library choice](icon-library-choice.md) — why the planner runs MDI, and the conveyor-belt and Discord gaps it doesn't cover
- [FontAwesome dynamic icons](fontawesome-dynamic-icons.md) — obsolete: MDI is a webfont, so `:class`-flipping an icon now works fine
- [Rendering rework + loader intent](rendering-rework-loader-intent.md) — planned on-select factory rendering; loader should track calc not render; don't micro-opt the 75ms stagger before that lands
- [Verify: colour iteration](verify-color-iteration.md) — compare style candidates by editing the file through HMR; DOM overrides get clobbered by Vue re-renders
- [Perf: devtools sync watcher](perf-devtools-sync-watcher.md) — the add-factory hang was Pinia devtools' deep+sync $subscribe (O(n²) traverse per write); fixed by the clone-run-commit engine
- [Perf: deep-watcher bottleneck](perf-deep-watcher-bottleneck.md) — full-plan deep watchers + devtools overlay eliminated; remaining edit cost is render/layout (rendering rework); benchmarks inside
- [Perf: devtools sync watcher](perf-devtools-sync-watcher.md) — the add-factory hang is Pinia devtools' deep+sync $subscribe (O(n²) traverse per write), not a calc cascade; benchmarks inside
- [Perf: deep-watcher bottleneck](perf-deep-watcher-bottleneck.md) — post-diff-commit, 124-factory edits still block ~5s: three full-plan deep watchers + persistence stringify; fix plan inside
- [VNumberInput clamping](vnumberinput-clamping.md) — clamp typed values on entry and remount the field; `:max` swallows the update event
- [Export/import chain invariants](export-import-chain-invariants.md) — exports are derived from imports, factory IDs must be unique, and a loaded plan won't self-heal unless validation asks for a recalc
- [Factory status registry](factory-status-registry.md) — adding a status is one array entry; keep the warning tier out of the engine loop and mirror the product-less guard or saved plans change colour
