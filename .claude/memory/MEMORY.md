# Memory index

- [Satisfactory Factories project](project-satisfactory-factories.md) — logistics planner for the game; my architecture docs live in `docs/architecture/`
- [Building groups branch status](building-groups-branch-status.md) — in-flight overclocking/somersloop feature on branch `11-product-building-groups` (snapshot 2026-07-17)
- [Calc engine gotchas](calc-engine-gotchas.md) — double-pass recalc, load-bearing step order, migration patches, and other traps
- [Tab sync v2 rework](project-tab-sync-v2.md) — in-flight multi-tab sync on branch `tab-sync-v2`; rendering rework deferred to its own plan
- [Scope plans per session](feedback-scope-plans-per-session.md) — split big multi-part features into separate plans/branches/sessions
- [Graph rebuild plan (parked)](project-graph-rebuild-plan.md) — Vue Flow graph-view rebuild plan saved to repo `.claude/plans/graph-view-vue-flow-rebuild.md`, decisions locked, M1–M6 not started
- [TDD specs fail intentionally](tdd-specs-fail-intentionally.md) — web/testing/tdd/ holds WIP specs written before implementation; failures there may be pre-existing user work
- [Dependency modernization plan](dependency-modernization-plan.md) — phased upgrade programme state; TS capped at 6.0, ESLint target 9+neostandard, vue-router pinned ~4.4.5, VNumberInput gotchas
- [Vuetify 4 migration checklist](vuetify-4-migration-checklist.md) — verified Phase 5 execution plan: typography classes removed (define our own), CSS reset revert, breakpoint thresholds, grid prop swaps
- [Color system](color-system.md) — semantic colours live in utils/colors.ts → --sf-* CSS vars; use sfColors / semantic sf-chip classes, never new literal hexes
- [Verify: tab navigation](verify-tab-navigation.md) — puppeteer recipe for adding/switching factory tabs (:scope > add btn; factory .v-tabs = the one without "Change Log")
- [FontAwesome dynamic icons](fontawesome-dynamic-icons.md) — FA SVG replacement detaches `<i>`; toggle a wrapper span, never `:class`-flip an icon
- [Rendering rework + loader intent](rendering-rework-loader-intent.md) — planned on-select factory rendering; loader should track calc not render; don't micro-opt the 75ms stagger before that lands
- [Verify: colour iteration](verify-color-iteration.md) — compare style candidates by editing the file through HMR; DOM overrides get clobbered by Vue re-renders
- [Perf: devtools sync watcher](perf-devtools-sync-watcher.md) — the add-factory hang is Pinia devtools' deep+sync $subscribe (O(n²) traverse per write), not a calc cascade; benchmarks inside
