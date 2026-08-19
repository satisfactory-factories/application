# Plan: Factory status indicators (issue #506)

Status: **ready to execute**, phased — see [Delivery](#delivery). Phase 1 is one branch/PR.
Supersedes section 2 of `.claude/plans/498-dimensional-depot-tracking.md` (the `warnings.ts` sketch);
that plan's `depotStarved` becomes phase 2 here. `.claude/plans/awesome-sink-and-byproduct-routing.md`
phase 3 (`#119` unallocated byproducts) is phase 3 here.

## What we're building

`factory.hasProblem` is one boolean. It tells the user *that* a factory is broken and nothing about
*what*, it collapses three unrelated failures into one red blob, and there is nowhere for anything
that isn't outright broken to appear at all.

This replaces it with a **status list**: a registry of typed, severity-tiered conditions derived from
data the engine already computes, rendered as named chips under the factory name in the sidebar and
applied consistently at every site that paints factory state today. `factory.hasProblem` survives as
a persisted rollup, redefined in terms of the registry so there is exactly one detection path.

The design goal that everything else follows from: **adding the next status type is one entry in one
array plus one spec case.** No template edits, no new SCSS, no migration.

---

## 1. The severity model

| Tier | Colour | Means | Border + header tint | Chip |
|---|---|---|---|---|
| `problem` | red (`--sf-problem`) | The factory cannot do what it claims. A quantity does not balance. | 2px red, tinted header (today's look) | filled red |
| `warning` | burnt orange (`--sf-status-warning`) | Coherent, but probably not what you meant, or your world is behind your plan. | 2px orange, tinted header (today's `needsSync` look) | filled orange |

**Precedence: the highest tier present paints the border, everywhere.** Chips are *not* subject to
precedence — a factory that is short of copper *and* out of sync shows both chips and a red border,
because that is two facts and the user wants both. Only the single-slot treatments (card border,
header tint, summary row tint) collapse to one.

**Classification rule for future contributors: red is arithmetic, amber is judgement.** If a
condition can be decided by comparing two numbers the engine already produced, it is red. If deciding
it needs a guess about intent — or it is about the world rather than the plan — it is amber.

Amber reuses the burnt orange that game sync already wears (`palette.orange` `#f57f17` / border
`#a75600`), promoted into its own semantic token so an *item* colour stops doubling as a *status*
colour. Nothing about the out-of-sync look changes visually; it just gains company.

Worth knowing: `inSync` is `null` until the user explicitly marks a factory built, so "everything goes
amber the moment I edit" is not a real risk — only factories claimed as built can drift.

**The accepted trade in having two tiers rather than three:** "your world is behind your plan" and
"your plan has dead weight in it" share a colour, so the border alone no longer separates them. The
chip label does. One amber tier is far simpler to reason about and to extend; if scanning a large plan
for *just* drift turns out to matter, the answer is a filter, not a third colour.

---

## 2. The status inventory

### 2.1 What makes the cut

| Type | Tier | Detected from | Sidebar chip (one subject → many) | Section chip | Anchor |
|---|---|---|---|---|---|
| `partShortage` | problem | non-raw `factory.parts[p].satisfied === false` | `[icon] Shortage` → `[!] 3 shortages` | icons + count | satisfaction |
| `rawShortage` | problem | raw `parts[p].satisfied === false` **and** `factoryAssumesRawInputs(factory)` false | `[icon] Raw shortage` → `[!] 2 raw shortages` | icons + count | imports |
| `exportShortage` | problem | `factory.dependencies.metrics[p].isRequestSatisfied === false` | `[icon] Export unmet` → `[!] 2 exports unmet` | icons + count | satisfaction |
| `buildingGroupMismatch` | problem | any product **or power producer** with `buildingGroupsHaveProblem` | `[icon] Building groups` → `[!] 2 building groups` | icons + count | products |
| `outOfSync` | warning | `factory.inSync === false` | `[x] Out of sync` | *(none — the card header already has the full sync chip)* | — |
| `redundantImport` | warning | `isImportRedundant(i, factory)` | `[icon] Redundant import` → `[!] 2 redundant imports` | icons + count | imports |
| `duplicateImport` | warning | `isDuplicateImport(factory, i)` | `[icon] Duplicate import` → `[!] 2 duplicate imports` | icons + count | imports |
| `depotStarved` | warning | phase 2 — see `498-dimensional-depot-tracking.md` | `[icon] Depot starved` | icons + count | satisfaction |
| `byproductBlocked` | warning | phase 3 — see the Sink plan, §3 | `[icon] Byproduct blocked` | icons + count | satisfaction |

Anchors are element-id suffixes passed to `navigateToFactory(id, anchor)` (`Planner.vue:517-529`,
which scrolls to `document.getElementById(anchor)`). Only `-tasks` and `-notes` exist today;
`-satisfaction`, `-imports` and `-products` are added in phase 1.

### 2.2 Detail per status

**`partShortage`** — the factory needs more of a part than it can supply. Today this is
`factory.requirementsSatisfied` (`parts.ts:18`) computed from the per-part `satisfied` flag
(`parts.ts:58`, `amountRemaining >= 0`). Split from `rawShortage` because the fix is different: a part
shortage is fixed by producing more, importing more, or trimming demand; a raw shortage is fixed by
mining it or importing from a mine.

**`rawShortage`** — a raw resource genuinely unmet because this factory is not assuming raw supply.
`factoryHasRawShortage` (`satisfaction.ts:176-181`) is already exactly this predicate and
`imports/FactoryImports.vue:3` already tints the Imports header with it — it just never reaches the
sidebar. It becomes a one-line delegate to the status module so the two can never drift.
`partShortage ∪ rawShortage` is exactly `!requirementsSatisfied`, so `hasProblem` is unchanged.

**`exportShortage`** — another factory asks for more of a part than this one supplies.
`dependencies.ts:312-319` sets `isRequestSatisfied = (parts[p].amountSupplied - request) >= 0`. Note
this compares against **total** supply, not surplus — existing behaviour, unchanged here.

**`buildingGroupMismatch`** — the building groups on an item do not add up to the item's building
count (`building-groups/common.ts:447-459`, `absDiff > 0.1`). Already shown per-item on the toggle
button and it already turns the factory red — **for products only.** `calculateBuildingGroupProblems`
runs for power producers too (via `recalculateGroupMetrics`, reached from `syncBuildingGroups` at
`factory.ts:199`), and `problems.ts:21-25` never looks at `factory.powerProducers`. That is a bug;
fixing it is part of phase 1 and is the plan's one behavioural change.

**`redundantImport`** — an import row fully covered by internal production or by the other import rows
for the same part (`inputs.ts:222-285`). Already rendered as an orange chip *inside* the Imports table
(`imports/Imports.vue:109`) and invisible from anywhere else. Amber, not red: it costs nothing and the
plan still balances — it is dead weight the user probably forgot about.

**`duplicateImport`** — two rows importing the same part from the same factory, which silently
collapse into one export request so the provider only ever sees one of them (`inputs.ts:287-302`).
Kept separate because the fix differs (delete the row vs. rebalance the amount) and because this one
is genuinely surprising — the second row's amount is simply ignored.

**`outOfSync`** — `factory.inSync === false`, set by `syncState.ts:38-133` when a product/producer
count, amount or recipe drifts from the snapshot taken when the user marked the factory built.

### 2.3 Considered and deliberately left out

| Candidate | Why not |
|---|---|
| **Power deficit** (`power.produced < power.consumed`) | A net-negative factory is the *normal* case — the plan is one grid and most factories only consume. It would fire on nearly every factory. It is also already shown as a chip on the card header (`PlannerFactory.vue:71-84`), and plan-wide deficit already flags the sidebar's Statistics link red (`PlannerFactoryList.vue:218-221`). Rolling it into factory status would only add noise. |
| **`factory.power.difference`** | Dead field: initialised to `0` at `buildings.ts:135` and never assigned anywhere. Don't build on it — `PlannerFactory.vue` recomputes the difference locally. Worth deleting separately. |
| **Empty factory** (no products, no power producers) | Every factory is empty for the first few seconds of its life. An indicator guaranteed to fire on creation trains users to ignore indicators. |
| **Incomplete import row** (no factory / no part / amount 0) | Same objection — it fires the moment a user clicks "add import" and clears once they finish. The row itself is visibly blank. |
| **Dangling surplus / nothing exported** | The Sink plan's territory (`awesome-sink-and-byproduct-routing.md` §1). Surplus is deliberately not a problem today, and making it one before the sink model exists would flag most healthy factories. |
| **Plan-repair findings** (`validation.ts:167-244`, `repair.ts:59-170`) | One-shot load-time fixups, already surfaced by `PlanRepairDialog.vue`. By the time the planner renders they have been repaired, so there is no persistent state to indicate. |
| **Ghost exports / orphan imports** (`dependency-integrity.ts:18-111`) | A real detector, but only ever called from specs — never at runtime — and `validation.ts#repairDependencyChain` fixes these on load. If one appears at runtime it is an app bug, not a user-actionable status. |
| **World resource over-extraction** | The counter exists (`Planner.vue:112,370,389-396`) and **nothing reads it**. It is also inherently plan-level, not per-factory, so it belongs in Statistics. Worth its own issue. |
| **Belt / pipe over-provisioning** (`exportCalculator.ts:243-266`) | An opt-in scratchpad the user configures per export; not plan state, and it never runs during `calculateFactory`. |
| **Somersloop / power-shard over-budget** | No world budget is modelled anywhere (`statistics.ts:171-195` counts them, nothing caps them). Would need new game data. |
| **Per-factory raw-input override** (`factory.assumeRawInputs !== null`) | Surprising when reading someone else's plan, but it is a setting, not a fault, and it is already visible on the Raw Resources card. Too niche to earn a tier. |
| **`buildingGroupItemSync`** | Not a problem state at all — a mode flag (auto-rebalance on/off), `common.ts:54-59`. Easy to mistake for `buildingGroupsHaveProblem`; it isn't one. |

---

## 3. The data shape and where it is computed

### 3.1 Recommendation: derive at render time

**Do not persist a status list on `Factory`.** Compute it from a pure registry, memoised per component
with a `computed` map. Keep `factory.hasProblem` exactly as it is — a persisted boolean — and redefine
it in terms of the registry so there is one detection path.

- **Persisting costs a migration and a stale-data class of bug.** A new `Factory` field means a
  backfill in `app-store.ts#initFactories` *and* `validation.ts`, plus the hand-maintained duplicate in
  `backend/interfaces/FactoryInterface.ts`. Worse, several statuses have no calculation behind them:
  `depotStarved` is driven by a checkbox no calculation reads, and `outOfSync` changes outside the
  engine. Persisting them means either triggering a full recalculation on a checkbox click (seconds of
  blocked main thread on a large plan) or accepting a status that is wrong until the next recalc.
- **Persisting puts presentation in the save file.** Chip labels and tooltips are UI copy. They would
  land in `localStorage`, in every shared plan and every backend document, and changing a label would
  become a data change.
- **The diff-commit engine would churn on it.** `applyDiff` compares arrays positionally
  (`commit.ts:62-78`), so a status appearing shifts every later element and rewrites the tail, plus a
  `structuredClone` per new element. An array of objects is the worst shape to hand it.
- **Deriving is cheap.** Per factory it is the same loops `calculateHasProblem` already does —
  O(parts) — plus O(inputs²) for the two import predicates, where inputs is typically under 10.

The one real cost of deriving: a `computed` reading into every factory's `parts` and `inputs` registers
reactive dependencies on all of them, so any calculation invalidates the whole map. Acceptable at these
sizes, and the same trade `PlannerFactoryList` already makes for `factoriesCopy`. What is **not**
acceptable is calling the helper from a template expression — see [section 4](#4-display-sites).

### 3.2 The module

New leaf module `web/src/utils/factory-management/status.ts` (+ `status.spec.ts`).

**It must be a leaf.** `problems.ts` is imported by `factory.ts:20` and `building-groups/common.ts:11`,
and `inputs.ts:3` imports `factory.ts` — so `problems.ts → inputs.ts` would close the cycle
`problems → inputs → factory → problems`. Both `isImportRedundant` and `isDuplicateImport` are pure
functions over a `Factory` with no business in a module that imports the calculation engine, so:

- Extract them from `inputs.ts:222-302` into a new `inputs-analysis.ts`, and **re-export them from
  `inputs.ts`** so `imports/Imports.vue:143-144` and `inputs.spec.ts` are untouched.
- `status.ts` imports only `inputs-analysis.ts`, `parts.ts` (`factoryAssumesRawInputs`, already a leaf)
  and the interfaces. Nothing else.
- `satisfaction.ts:176` `factoryHasRawShortage` becomes a one-line delegate to the status predicate.

```ts
export type FactoryStatusSeverity = 'problem' | 'warning'

export type FactoryStatusType =
  | 'partShortage' | 'rawShortage' | 'exportShortage' | 'buildingGroupMismatch'
  | 'outOfSync' | 'redundantImport' | 'duplicateImport'

// `type` maps straight onto <game-asset>'s prop. A power producer's `id` is a random instance
// number (`power.ts:22`), NOT an item id — feeding it to type="item" renders an unknown asset.
export interface FactoryStatusSubject { id: string; type: 'item' | 'building' }

export interface FactoryStatus {
  type: FactoryStatusType
  severity: FactoryStatusSeverity
  label: string        // condensed, for the sidebar
  detailLabel: string  // fuller, for section headers
  detail: string       // tooltip sentence
  icon: string         // FA class — the fallback when there is no single subject icon
  chip: boolean        // false = drives colour and precedence only
  section?: FactoryStatusSection
  subjects: FactoryStatusSubject[]  // deduped — drives the icons and the count
}
```

Subjects are deduped and mostly items: the shorted part, the imported part, the product whose building
groups do not add up (a `FactoryItem.id` *is* a part id). The exception is `buildingGroupMismatch` on a
**power producer**, whose subject is `producer.building` at `type: 'building'`. That is what lets one
chip component render an icon for any status without knowing which one it is. (Consequence: two rows
importing the same part from the same factory count as one duplicate-import subject, which is the right
count to show.) `outOfSync` has no subjects and falls back to its `icon`.

The registry is a single array **declared in severity order**, so `getFactoryStatuses` returns statuses
already sorted and the display sites never sort. Alongside it:

```ts
export const getFactoryStatuses = (factory: Factory): FactoryStatus[]
export const highestSeverity    = (statuses: FactoryStatus[]): FactoryStatusSeverity | null
export const factoryStatusClass = (statuses: FactoryStatus[]) => ({ problem: …, warning: … })
export const getSectionStatuses = (statuses: FactoryStatus[], section: FactoryStatusSection) => FactoryStatus[]
```

`getFactoryStatuses` takes only a `Factory` — deliberately. Nothing in phase 1 or 2 needs `gameData`;
the fluids check a future `byproductBlocked` would want can arrive as an optional second parameter
without breaking a single caller.

The CSS class is `warning`, not `needsSync`. The old name describes only one of three amber statuses,
so it is renamed everywhere it appears.

### 3.3 `problems.ts` must not run the warning detectors

`calculateHasProblem` runs for **every** factory at the end of **each** factory's calculation
(`factory.ts:228-230`), and the engine runs per factory twice (`:255,261`) — roughly O(2n²)
invocations, on the order of 30,000 for a 124-factory plan. Calling the full `getFactoryStatuses`
there would drag the O(inputs²) import-redundancy detectors into that loop. So the engine gets its own
entry point, touching problem-tier definitions only and short-circuiting:

```ts
// Problem-tier definitions only, bailing on the first hit — strictly less work than the previous
// version, which looped every part, every dependency metric and every product with no exit.
export const hasFactoryProblem = (factory: Factory): boolean =>
  factoryStatusDefinitions.some(def => def.severity === 'problem' && def.detect(factory) !== null)

// problems.ts
export const calculateHasProblem = (factory: Factory) => { factory.hasProblem = hasFactoryProblem(factory) }
```

The full `getFactoryStatuses` is called only from the UI, once per factory per render pass — which is
what "derive at render time" was always about. The early `return` at `problems.ts:9` disappears; it was
a micro-optimisation that also hid export and building-group failures behind a shortage, which is
precisely what this issue is about.

**Not in scope but worth an issue:** hoisting `allFactories.forEach(calculateHasProblem)` out of the
per-factory engine loop would remove the O(n²) entirely.

### 3.4 The one place `hasProblem` would silently shift — and does not

`calculateParts` (`parts.ts:11-15`) short-circuits `requirementsSatisfied = true` whenever
`factory.products.length === 0`, **even if the factory has unsatisfied fuel ingredients in
`factory.parts`**. A naive per-part detector would turn those power-only factories red, quietly
changing `hasProblem` on existing saved plans and breaking the regression guarantee in §7.

`partShortage` and `rawShortage` therefore mirror that guard exactly — return nothing when
`factory.products.length === 0` — with a comment saying why and a spec case pinning it. Whether a
power-only factory short of fuel *should* read as satisfied is a real question and a separate issue; it
is not something to change as a side effect of a presentation feature.

`buildingGroupMismatch` deliberately does **not** take that guard — a power-only factory with broken
building groups going red is the bug fix in §2.2, and it is the plan's one intended behaviour change.

---

## 4. Display sites

Every site does the same two things: read a memoised status list, then bind `factoryStatusClass` and
drop in `<factory-status-chips>`. **Never call `getFactoryStatuses` from a template expression** — the
sidebar renders every factory in the plan and per-chip calls would multiply the work by the chip count.

```ts
// One pass over the plan; rows index this rather than re-deriving per chip.
const statuses = computed(() => new Map(
  compProps.factories.map(factory => [factory.id, getFactoryStatuses(factory)]),
))
```

### 4.1 The chip component

One component, `web/src/components/planner/FactoryStatusChips.vue`, used at every site:

- **Condensed** (`detailed: false`, sidebar and card header) — one subject renders that subject's
  `<game-asset>` icon plus the short label; two or more render `fa-exclamation-triangle` plus the count.
- **Detailed** (`detailed: true`, section headers) — up to six subject icons inline, then `+N`, and the
  `detailLabel`. Wrapped in the existing `<tooltip>` listing each subject's display name.
- **`animated` is opt-in, and only the sidebar sets it.** The card-header and section-header chip rows
  sit in already-reflowing layouts where a growth animation would be noise; the sidebar is the
  fixed-height row that needs to make room.
- Emits navigation; the sidebar wires it to `navigateToFactory(id, anchor)`. A status with no `section`
  (i.e. `outOfSync`) renders a non-clickable chip.

Chips are **filled, not outlined**. This is load-bearing, not decoration: `.sf-chip.yellow`
(`--sf-yellow #fbc02d`) is already used on the very same chips bar for the tasks and notes chips
(`PlannerFactory.vue:19,26`) and for power shards (`:87`), and an outlined amber chip beside them would
be indistinguishable. A filled background plus `fa-exclamation-triangle` separates them.

### 4.2 The growth animation

The chips line must never snap in. The entry colours, then **grows** to make room; when the condition
clears it **retracts**. Same feel as `DebounceSpinner.vue` (0.25s ease) — that component is the
reference, but it animates a known width and this animates an unknown height, so:

```scss
.status-chips {
  display: grid;
  grid-template-rows: 0fr;              // closed
  &.open { grid-template-rows: 1fr; }   // open — interpolates to auto height
  &.animated { transition: grid-template-rows 0.25s ease; }

  .status-chips-inner {
    overflow: hidden;
    min-height: 0;                      // required, or the grid row will not collapse
  }
}
```

Three details that decide whether this feels right or looks broken:

1. **No animation on first paint.** An `animated` class gated on a `ready` ref flipped in `onMounted` +
   `nextTick`. Without it, loading a plan with twelve broken factories plays twelve simultaneous grow
   animations. The sidebar list is `v-show`n rather than unmounted across a plan load
   (`PlannerFactoryList.vue:233-239`, the `prepareForLoad` / `incrementLoad` bus events), so `ready`
   must also be dropped and re-raised on `incrementLoad`.
2. **The border colour is already free.** `.factory-card` carries `transition: all 0.3s`
   (`global.scss:395`), so the border cross-fades. Colour lands slightly before the height finishes,
   which is the ordering wanted: *colour, then grow*.
3. **`grid-template-rows` interpolation** needs Chrome 107+ / Safari 16+ / Firefox 121+. Older Firefox
   snaps to the final height — degrades to today's behaviour, nothing breaks. The alternative (a JS
   `<transition>` measuring `scrollHeight`) is more code for the same result.

### 4.3 Sidebar entry — `PlannerFactoryList.vue`

The entry is currently a single `flex-nowrap` `v-row` (`:102-167`) with a `v-spacer` for the name and
three `cols="auto"` cells (tasks, notes, sync) on the right. Turn the `v-spacer` into a column: the
existing icon+name line, then a conditional chips line beneath it. The right-hand cells are untouched
and stretch to the new height.

```
┌──────────────────────────────────┬────┬────┐
│ ⣿ 🏭 Aluminium Plant             │ ☑3 │ ✗  │
│    [Cu Shortage] [x Out of sync] │    │    │
└──────────────────────────────────┴────┴────┘
```

The sync cell stays exactly as it is — it is the tri-state control and it aligns down the column with
the Factories Summary row above. The `Out of sync` chip only ever renders for `inSync === false`, so
the chip line stays "things needing attention" and the tick/question states never earn one.

`factoryClass` (`:241-248`) becomes
`{ 'factory-card': true, 'active-view': …, ...factoryStatusClass(statuses.get(factory.id)) }`.
Chips need `@click.stop` — the whole `v-card` navigates on click (`:100`).

### 4.4 Factory card — `PlannerFactory.vue`

- `factoryClass` (`:390-396`) — same replacement. Today's hand-rolled
  `needsSync: !factory.hasProblem && factory.inSync !== null ? !factory.inSync : false` goes away.
- Status chips go at the **front** of the existing chips bar (`:16`), at `small` to match neighbours,
  **with `outOfSync` filtered out.** That bar already has a full clickable "Out of sync with game" chip
  carrying help text and a reset button (`:48-63`); a second one saying the same thing with different
  click behaviour is worse than none. The sidebar — which has no such control, only a 30px cell — is
  where the sync chip earns its place.
- Compute `getFactoryStatuses(factory)` **once here** and pass it down as a `:statuses` prop to the
  three section components. They receive only `factory` today, and letting each call the helper itself
  would run the predicates three times per expanded card.
- Add scroll anchors `-satisfaction`, `-imports`, `-products` beside the existing `-tasks` (`:181`) and
  `-notes` (`:188`). All three section components have a single root `<div>`, so an `:id` on the tag
  falls through the same way `PlannerFactoryTasks` already relies on. (Exports live *inside* the
  Satisfaction table in the expanded card — `PlannerFactorySatisfactionItems.vue:308-353` — so
  `exportShortage` anchors to satisfaction. The `Exports:` label at `:299` is the collapsed view only.)

### 4.5 Factories Summary — `StatisticsFactorySummary.vue`

- `factoryClass` (`:366-370`) currently returns `{ problem }` only and never painted the amber state at
  all. Replace with `factoryStatusClass`, which fixes that inconsistency for free.
- Scoped SCSS at `:449-450` styles `&.problem td`; add `&.warning td` beside it.
- **No chips in this table.** The Satisfaction column already itemises every shortage as a per-part chip
  (`:160-181`) and the factory column is the narrowest one. Instead wrap the existing factory chip in a
  `<tooltip>` listing the statuses — full information, zero layout cost.

### 4.6 Section headers inside the card

Each header renders `<factory-status-chips detailed>` fed by `getSectionStatuses`, and takes its colour
from the highest severity it gets back. This is where the extra detail lives — the sidebar says
*shortage*, the header says *which items*.

| Header | File | Statuses |
|---|---|---|
| Satisfaction | `PlannerFactorySatisfaction.vue:3-24` | `partShortage`, `exportShortage` (+ later `depotStarved`, `byproductBlocked`) |
| Imports | `imports/FactoryImports.vue:3-6` | `rawShortage`, `redundantImport`, `duplicateImport` |
| Products & Power | `products/ProductsAndPower.vue:3-6` | `buildingGroupMismatch` |

The Satisfaction header is three `v-show`-toggled `<h2>` blocks today. Adding a fourth for amber is the
wrong move — collapse them into **one** `<h2>` driven by a computed `{ icon, class }`. Own commit; it is
a tidy-up, not a feature. States: problem → `fa-times` red; warning → `fa-exclamation-triangle` amber;
satisfied → `fa-check`; no parts → `fa-question`.

Existing per-item treatment stays untouched: the red/green satisfaction rows
(`PlannerFactorySatisfactionItems.vue:448-460`), the Raw Resources card tint, the redundant-import chip
inside the Imports table (`imports/Imports.vue:109`), and the per-item building-groups button. The new
chips summarise them; they do not replace them.

### Handoff to the graph rebuild

`.claude/plans/graph-view-vue-flow-rebuild.md` M5 lists "`hasProblem` minimap coloring" and the M-4 node
spec says "red border when `hasProblem`". Once this lands, that becomes
`factoryStatusClass(getFactoryStatuses(factory))` and the node gets amber for free. **Do not touch
`components/graph/` in this work** — the rebuild deletes and rewrites those files.

---

## 5. Colour tokens and SCSS

No literal hex goes in a component or in SCSS — everything routes through `web/src/utils/colors.ts`
(read its header comment first).

The new token is called **`statusWarning`**, not `warning`. `sfColors.warning` already exists (the
yellow `#fbc02d`) and `--sf-warning` is live in `OptionsDialog.vue:205`, where it colours caution text —
taking the name over would silently turn that text orange.

```ts
// sfColors — the middle status tier. Same values the needsSync rules use inline today, so this is
// effectively a rename: identical rendered output, but a status colour stops being an item colour.
statusWarning: { color: palette.orange, border: palette.orangeBorder, background: 'rgba(255, 136, 0, 0.16)' },
```

The `rgba` is carried over verbatim on purpose; converting it to an opaque equivalent (the same trap
`problem` was fixed for) is a separate, eyeballed change.

| Rule | Location | Change |
|---|---|---|
| `.sf-chip.status-warning` | status block, ~`:181-190` | New. **Filled**: colour, border and background from `--sf-status-warning*` |
| `.sf-chip.problem` | same block | New alias beside `.red, .error`, also filled, from `--sf-problem*` |
| `.factory-card.needsSync` → `.warning` | `:429-435` | Rename the class; swap `var(--sf-building-border)` → `var(--sf-status-warning-border)` and the literal `rgba(255,136,0,.16)` → `var(--sf-status-warning-bg)` |
| `.factory-card.inSync` | `:437-443` | **Dead rule** — nothing has ever set that class (`factoryClass` returns `problem`/`needsSync` only). Delete it; a green-border rule nobody applies is a trap for the next person |
| `.sub-card.warning` | ~`:361` | Mirror `.sub-card.problem` |
| `StatisticsFactorySummary.vue` scoped | `:449-450` | Add `&.warning td` |

### The collision to check in a real browser

Two warm colours now live within about 20° of hue on the same card:

- `--sf-yellow` `#fbc02d` — tasks, notes, power-shard chips (outlined)
- `--sf-status-warning` `#f57f17` / border `#a75600` — the warning tier (filled)

**Explicit browser check:** park three sidebar entries next to each other — one red, one amber, one
carrying only tasks and notes chips — and confirm all three read as different states *without reading
the labels*, on the **border** as much as the chips. If they are confusable, the fix is to deepen the
decorative tasks-and-notes yellow, not to move the warning tier off orange.

---

## 6. Extensibility — adding `depotStarved` end to end

This is the whole point of the design, so here is the complete diff for phase 2:

```ts
// status.ts — 1. add to the union
export type FactoryStatusType = /* … */ | 'depotStarved'

// status.ts — 2. one registry entry, placed in the warning block
{
  type: 'depotStarved',
  severity: 'warning',
  icon: 'fas fa-warehouse',
  chip: true,
  section: 'satisfaction',
  detail: 'Every unit of these items is used by exports or internal production, so nothing reaches the Dimensional Depot.',
  // Zero counts, not just negative: a part sitting at exactly 0 surplus is fully spoken for.
  detect: factory => nonEmpty(Object.keys(factory.dimensionalDepot ?? {})
    .filter(part => part in factory.parts && (factory.parts[part].amountRemaining ?? 0) <= 0)
    .map(id => ({ id, type: 'item' }))),
  label: subjects => subjects.length > 1 ? `${subjects.length} depots starved` : 'Depot starved',
},
```

That is the entire change. The sidebar chip, the card chip, the card border, the Satisfaction header
colour, the Factories Summary row tint and its tooltip all follow with **zero** template edits, because
every one of them reads the list rather than a named flag. `498-dimensional-depot-tracking.md` sections
6 and 7 are superseded by this — that PR keeps only its per-part row treatment, its Satisfaction toggle
and its Statistics section.

---

## 7. Verification

### Unit

**New** `status.spec.ts` — the bulk of the work:

- each definition in isolation: fires when it should, returns `null` when it shouldn't, and lists the
  right deduped subjects;
- `partShortage` and `rawShortage` partition correctly — a raw shortage on a factory that *is* assuming
  raw supply yields neither;
- `buildingGroupMismatch` fires on a **power producer** with `buildingGroupsHaveProblem` and no products
  (the bug fix), and its subject is a `building`, not an item;
- a power-only factory (`products.length === 0`) with unsatisfied fuel parts yields **no** shortage
  status (§3.4) but *does* yield `buildingGroupMismatch` when its groups are broken;
- `getFactoryStatuses` returns severity-descending order with several statuses at once;
- `highestSeverity` / `factoryStatusClass` precedence: problem+warning → `problem` only; warning alone →
  `warning`; nothing → all false;
- `getSectionStatuses` routes each status to the right header;
- `hasFactoryProblem` agrees with `getFactoryStatuses(...).some(problem)` on every fixture, so the
  engine's short-circuit and the UI's full list can never disagree;
- a clean factory returns `[]`.

**Existing** specs that must pass **unchanged** — that is the regression guarantee:
`problems.spec.ts` (plus one new case for the power-producer fix), `inputs.spec.ts` (if it fails, the
`inputs-analysis.ts` re-export is wrong), `satisfaction.spec.ts` (`factoryHasRawShortage` after it
becomes a delegate).

Fixtures already in the repo — use them rather than hand-building factories:
`factory-setups/324-redundant-import.ts`, `499-broken-chain-plan.ts`, `273-import-issues.spec.ts`,
`375-byproduct-ghost-surplus.ts` (for phase 3). Real-plan regression: run `maels-big-boi-plan.ts`
through `calculateFactories` and assert the set of factories with `hasProblem === true` is identical
before and after.

```
cd web && pnpm exec vitest run factory-management/status factory-management/problems \
  factory-management/inputs factory-management/satisfaction
```

Then the full suite plus `pnpm lint` and the `vue-tsc` pass inside `pnpm build`.

### Browser (`/verify` skill)

Launch per the skill: from `web/`, `VITE_ENV=dev pnpm exec vite --port 3005 --strictPort` in the
background — **pin the port**, 3001 is vitest's gameData server. Drive with `puppeteer-core`, seeding
the first-run modal keys via `page.evaluateOnNewDocument()` or clicks land on an overlay.

1. Load `/?setupDemo=true`. "Copper Basics" has a deliberate Copper Ingot shortage — its sidebar entry
   should show a red border and a `Shortage` chip, and its card the same chip in the header bar.
2. **The animation.** Fix the shortage while watching the entry: chips fade, the entry retracts
   smoothly, no snap. Re-break it: colour lands, then it grows. Reload with the shortage present: it
   renders open with **no** animation.
3. Click the sidebar chip → the page scrolls to Satisfaction, the `<h2>` is red and carries the
   detailed chip with the item icon.
4. Add a redundant second import → the entry gains an **amber** `Redundant import` chip while keeping
   the red border (precedence: border red, both chips shown), and grows again. Click it → Imports.
5. Mark a healthy factory as in sync, then change a product amount → amber border, `Out of sync` chip in
   the sidebar, the sync cell unchanged on the right, and **exactly one** out-of-sync chip on the card
   header (the existing control, not a duplicate).
6. **The collision check** from §5, screenshotted.
7. Factories Summary — the same rows read red / amber, and the factory-name tooltip lists the statuses.
8. Break a power producer's building groups on a factory with **no products** → it turns red. On `main`
   today it does not.
9. **Perf.** Load the 124-factory stress plan (`window.__sfLoadStressPlan`,
   `web/testing/browser/stress.e2e.mjs`) and time an edit before and after. The status memo must not
   move settle time measurably; if it does, drop the plan-wide `computed` to a per-row `computed` inside
   the draggable item so only the changed row re-derives. The sidebar list exists **twice** in the DOM
   (desktop + teleported mobile drawer), so anything counting nodes counts double.

---

## Delivery

Three phases, one branch and one PR each, per `.claude/memory/feedback-scope-plans-per-session.md`.
Phases 2 and 3 are already-planned PRs that gain this system rather than new work.

| Phase | Scope | Key files |
|---|---|---|
| **1. The system** | `status.ts` + registry + `inputs-analysis.ts` extraction, `problems.ts` redefinition, power-producer bug fix, colour token + SCSS, `FactoryStatusChips.vue`, all four display sites, Satisfaction header refactor, scroll anchors, specs | `status.ts` (new, +spec), `inputs-analysis.ts` (new), `FactoryStatusChips.vue` (new), `problems.ts` (+spec), `inputs.ts`, `satisfaction.ts`, `colors.ts`, `global.scss`, `PlannerFactoryList.vue`, `PlannerFactory.vue`, `StatisticsFactorySummary.vue`, `PlannerFactorySatisfaction.vue`, `imports/FactoryImports.vue`, `products/ProductsAndPower.vue` |
| **2. Depot** | `depotStarved` — one registry entry, one spec block. Merged into the `#498` PR | `status.ts` (+spec) |
| **3. Byproducts** | `byproductBlocked` — one registry entry. Merged into the Sink plan's phase 3 | `status.ts` (+spec) |

Phase 1 must ship with at least one amber status or the tier is untestable in the browser and
unreviewable — which is why `outOfSync`, `redundantImport` and `duplicateImport` are in phase 1.

- Branch: `506-factory-status-indicators`. PR title `feat(web): factory status indicators`.
- Conventional commits, scoped. Suggested split so review can follow it: (1) this plan rewrite;
  (2) `inputs-analysis.ts` extraction, no behaviour change; (3) the status module + specs; (4) colour
  token + SCSS; (5) `FactoryStatusChips.vue` incl. the growth animation; (6) the display sites;
  (7) the Satisfaction header refactor; (8) `fix(web):` the power-producer building-group rollup.
- `CHANGELOG.md` entry under `[Unreleased]`.
- **Release**: the in-flight release is Beta v0.6, "The Groundwork Update". Phase 1 is additive and
  presentation-only apart from the one bug fix, so it is safe for v0.6. The branch is cut from `main`
  while PR #503 (mining) is still open and touches five of the same files — **rebase onto `main` once
  #503 merges** and re-run the suite before opening the PR.

---

## Open questions

1. **Chip cap in the sidebar.** A factory could in principle carry five chips and grow the entry to
   three lines. *Recommendation:* let them wrap; the labels are short and five simultaneous statuses is
   a factory that deserves the space. Revisit only if it shows up in a real plan.
2. **`.factory-card.inSync` (`global.scss:437-443`) — delete or wire?** Nothing sets the class today, so
   it has never rendered. *Recommendation:* delete it in phase 1. If a green "built and in sync" border
   is actually wanted, that is a deliberate feature and a separate call.

## Bugs and dead code found on the way

Not all in scope; recording them so they are not re-discovered.

| Finding | Location | In scope? |
|---|---|---|
| Power producers' `buildingGroupsHaveProblem` never reaches `hasProblem` | `problems.ts:21-25` vs `building-groups/common.ts:834` | **Yes** — phase 1 |
| `.factory-card.inSync` styles a class nothing sets | `global.scss:437-443` | Yes — open question 2 |
| A power-only factory short of fuel reports `requirementsSatisfied === true` | `parts.ts:11-15` | No — deliberately preserved (§3.4), its own issue |
| `factory.power.difference` is initialised to 0 and never assigned | `buildings.ts:135` | No — separate cleanup |
| `worldRawResources` is maintained every recalc and read by nothing | `Planner.vue:112,370,389-396` | No — its own issue (world-limit warnings in Statistics) |
| `findDependencyChainViolations` is called only from specs | `dependency-integrity.ts:18-111` | No |
| `calculateHasProblem` runs O(2n²) times per full recalculation | `factory.ts:228-230,255,261` | No — flagged for a perf pass |
| `StatisticsFactorySummary` never applied the amber state | `StatisticsFactorySummary.vue:366-370` | **Yes** — fixed for free by `factoryStatusClass` |
