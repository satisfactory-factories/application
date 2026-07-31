# Plan: Dimensional Depot tracking (issue #498)

Status: **ready to execute**. One branch/PR. No calculation-engine changes.
Related: `.claude/plans/awesome-sink-and-byproduct-routing.md` (Beta v0.6) — same axis, and it inherits
the warning tier built here.

## What we're building

1. A per-item opt-in "send this surplus to the Dimensional Depot" flag under Satisfaction.
2. A Statistics section listing every flagged item, its input rate, and the factories feeding it.
3. **A new amber warning severity**, distinct from the existing red problem state, raised when a
   flagged part has no surplus left — because if every last unit is spoken for by exports and
   internal use, the depot never receives anything and the player has no way to see that today.
   The warning surfaces at four levels: the part row, the Satisfaction section, the factory card,
   and the sidebar entry.

## Decisions

1. **Eligibility is surplus-driven, never production-driven.** Offered wherever `amountRemaining > 0`,
   regardless of what created the surplus — production, byproduct or import. Nothing checks whether
   the factory makes the part. A logistics centre that imports everything and depots the overflow is
   a real build, and gating on local production would exclude the very factory whose surplus most
   needs a destination. *(Applies to the parked Sink work too — noted in that plan.)*
2. **The depot flag does not change the calculation.** `parts.ts` and `PartMetrics` untouched;
   `amountRemaining` still reads as surplus; nothing is consumed. Making a depoted surplus land at
   zero is the Sink plan's `amountRequiredSink` mechanism and a locked v0.6 decision.
3. **Warnings are derived at render time, not persisted.** No `factory.hasWarnings` field, no
   migration, no engine pass — a pure helper over data already on the factory. This keeps a checkbox
   click off the recalculation path entirely (it would otherwise cost a full factory recalc for a
   flag no calculation reads). *Alternative if you'd rather mirror `hasProblem` exactly: compute it in
   `problems.ts` and persist it — costs a migration and a recalc per toggle. The helper is written so
   it can move there later without changing its callers.*
4. **Red outranks amber outranks orange, everywhere.** A factory that is both broken and depot-starved
   reads red. The precedence is `problem > warning > needsSync`, applied identically on the card, the
   sidebar entry and the part row.
5. **Named "Dimensional Depot"** in the UI, not the issue's "Dimension Storage" — the game's term, and
   the icons already shipped under that name (`web/public/assets/game/item/dimensional-depot_64.png`).

---

## 1. Data model

`factory.parts` is wiped and rebuilt on every calculation (`parts.ts:34` — `factory.parts = {}`), so a
user flag **cannot** live on `PartMetrics`. It gets its own map on `Factory`, the same shape as
`exportCalculator`:

```ts
// Parts the user has flagged as being uploaded to the Dimensional Depot. Purely a marker:
// the depot rate is derived from the part's surplus at read time.
dimensionalDepot: { [partId: string]: boolean };
```

**Flags are sticky by design** — never pruned when a part leaves the factory. Read-time filtering
against `factory.parts` makes a stale key inert, and if the part comes back the user's intent is
still there. It also means a flag survives its surplus drying up, which *is* the warning case.

Survives the clone-run-commit engine unchanged: `calculateFactories` `structuredClone`s the whole
factory (`factory.ts:268`) and `applyDiff` preserves any key the engine didn't touch.

| File | Change |
|---|---|
| `web/src/interfaces/planner/FactoryInterface.ts` (`Factory`, ~197) | Add the field |
| `backend/interfaces/FactoryInterface.ts` (`Factory`, ~134) | Same field — hand-maintained duplicate |
| `web/src/utils/factory-management/factory.ts` (`newFactory`, 60) | `dimensionalDepot: {}` |
| `web/src/stores/app-store.ts` (`initFactories`, patch block from 331) | Backfill `{}` — **do not** set `needsCalculation`; an empty map changes no derived value, and a needless recalc blocks the main thread for seconds on big plans (see the comment at line 505) |

Backend needs nothing else — plans are stored as `Mixed` (`backend/models/FactoyDataSchema.ts`).

---

## 2. The warning tier

New module `web/src/utils/factory-management/warnings.ts`. Built as a **list of typed warnings, not a
boolean**, so the next amber condition (unallocated byproducts, #119, already queued in the Sink plan)
slots in without redesigning any of the four display sites.

```ts
export type FactoryWarningType = 'depotStarved'

export interface FactoryWarning {
  type: FactoryWarningType
  parts: string[]   // the part ids this warning covers
  label: string     // sidebar chip text, e.g. "Depot starved"
  icon: string      // game-asset subject or FA class for the chip
}

// A flagged part with nothing left over: every unit is taken by exports and internal
// consumption, so the depot receives nothing. Zero counts, not just negative — a part
// sitting exactly at 0 surplus is fully spoken for.
export const isDepotStarved = (factory: Factory, partId: string): boolean =>
  !!factory.dimensionalDepot?.[partId] && (factory.parts[partId]?.amountRemaining ?? 0) <= 0

export const getFactoryWarnings = (factory: Factory): FactoryWarning[]
export const hasFactoryWarnings = (factory: Factory): boolean
```

Note `<= 0`, not `< 0`: exactly-zero surplus is the case Matt raised, and it is invisible today
because zero surplus is otherwise a perfectly healthy state.

A part that is *also* in shortage (`amountRemaining < 0`) is already red — decision 4 means the red
treatment wins and the amber one is suppressed at every display site.

**Perf note:** `PlannerFactoryList.vue` renders every factory in the plan. Don't call
`getFactoryWarnings` three times per row from the template — build one `computed` map of
`factoryId -> FactoryWarning[]` in the component and index it. The helper itself is O(flagged parts)
and usually O(0), but a 124-factory plan makes sloppy template calls add up.

### Colour tokens

Two new tokens in `web/src/utils/colors.ts` — never a literal hex in a component.

**Amber, for the warning tier:**

```ts
// A soft warning: worth a look, but not a broken factory. Amber sits between the red problem
// state and the healthy default. Background is OPAQUE for the same reason `problem`'s is —
// an alpha value composites to a different shade on every surface it lands on.
warning: { color: palette.yellow, border: '#a07a00', background: '#4b3a17' },
```

**Muted purple, for an active Depot flag** — the same shade as the circuit boost, which reads
nicely against the blue/cyan Product and Byproduct chips beside it. Promote that hex into the
palette so both tokens draw from one definition rather than repeating the literal:

```ts
// palette
mutedPurple: '#9f6d9f',

// sfColors
circuitBoost: { color: palette.mutedPurple, border: palette.mutedPurple },   // unchanged value
dimensionalDepot: { color: palette.mutedPurple, border: palette.mutedPurple },
```

Deliberately a **separate token** from `circuitBoost` rather than reusing it: the two are unrelated
concepts that happen to share a shade today, and a semantic name means either can be re-tuned without
dragging the other with it. Note this is distinct from `somersloop`'s purple (`#bd67ff`), which is far
more saturated — check the two aren't confusable if a plan shows both.

Then mirror the three existing `problem` rules in `web/src/assets/styles/global.scss`:
`.sf-chip.warning` (~line 172 block), `.sub-card.warning` (~359), `.factory-card.warning` (~421), and
add `.sf-chip.dimensional-depot` alongside the other item/flow chip colours.

**Watch out:** `needsSync` already paints a card border in `--sf-building-border` (burnt orange
`#a75600`). Amber and burnt orange on the same border are the one real visual risk in this plan —
check them side by side in the browser and shift the amber if they read as the same state. The
sidebar chip is the disambiguator, but the border shouldn't need it.

---

## 3. Satisfaction — the toggle

`PlannerFactorySatisfactionItems.vue`, in the Item cell's right-hand action stack
(`<div class="align-self-center text-right">`, ~line 70) — empty on healthy rows, so the control is
visible without crowding the chips.

- Outlined toggle button carrying `<game-asset subject="dimensional-depot" type="item_id" />` plus
  "Depot". A `v-checkbox-btn` is the literal reading of the issue, but every other control in that
  stack is a small outlined `v-btn` — match it. Give it an id of the form
  `<factoryId>-depot-toggle-<partId>` for browser tests.
- **When checked, the row also gains a purple "Depot" chip** in the name cell alongside
  Product/Byproduct/Imported — `class="sf-chip x-small dimensional-depot"` with the depot icon. That
  chip, not the button state, is what makes a depoted item scannable down a long satisfaction table,
  and the muted purple reads cleanly against the blue Product and cyan Byproduct chips it sits with.
  Colour the toggle button itself to match (`color` bound to `var(--sf-dimensional-depot)`) so the
  control and the chip are obviously the same concept.
- On a **starved** row the purple chip is joined by the amber warning chip from section 4 — the item
  is still flagged for the depot (purple) *and* not receiving anything (amber). Don't swap one for the
  other; they say different things.
- **Predicate**, new export in `satisfaction.ts` beside the other `show*` helpers:

  ```ts
  export const showDepotToggle = (factory, partId, gameData) => {
    if (gameData.items.parts[partId]?.isFluid) return false // Depots take conveyor input only
    if (factory.dimensionalDepot?.[partId]) return true     // Stay visible once flagged, so a
    return (factory.parts[partId]?.amountRemaining ?? 0) > 0 // dried-up surplus can be seen and undone
  }
  ```

- `toggleDimensionalDepot(factory, partId)` also in `satisfaction.ts` so it is unit-testable.
  `delete` the key rather than setting `false`, keeping saved plans small.
- **Don't call the injected `updateFactory`** — it runs a full recalculation for a flag no calculation
  reads, and the warning is derived at render time so it updates instantly anyway. Persistence is
  covered by the store's 5-second compare-and-save and the flush on tab-hide (`app-store.ts:116-151`);
  emit `factoryUpdated` if you want it saved immediately without recalculating.

## 4. Satisfaction — the amber row

`satisfactionShading(part)` currently returns `border-green` / `border-red`, and the scoped SCSS only
gives `.border-red` a treatment (`background: var(--sf-problem-bg)`, red block borders). Extend it:

```ts
const satisfactionShading = (part, partId) => ({
  'border-green': part.satisfied && !isDepotStarved(factory, partId),
  'border-amber': part.satisfied && isDepotStarved(factory, partId),
  'border-red': !part.satisfied,   // red wins outright
})
```

Add the matching scoped rule beside `&.border-red`, using `--sf-warning-bg` / `--sf-warning-border`.
It must be applied to all four `<td>`s in the row, exactly as `border-red` already is.

Also add an amber chip next to the existing Product/Byproduct/Imported chips on a starved row —
depot icon + "Depot starved" — with a tooltip explaining *"Every unit of this item is used by exports
or internal production, so nothing reaches the Dimensional Depot."* That sentence is the whole point
of the feature; make sure it appears somewhere the user will actually read it.

## 5. Satisfaction — the section header

`PlannerFactorySatisfaction.vue` currently has **three** `<h2>` blocks toggled by `v-show`
(satisfied / unsatisfied / no-parts). Adding a fourth duplicated block for the amber state is the
wrong move — refactor to a single `<h2>` driven by a computed `{ icon, class }`:

| State | Icon | Class |
|---|---|---|
| Not satisfied | `fa-times` | `text-red` |
| Satisfied, depot starved | `fa-exclamation-triangle` | `text-amber` (→ `--sf-warning`) |
| Satisfied | `fa-check` | — |
| No parts | `fa-question` | — |

This is a small tidy-up of existing markup; keep it in the same PR but its own commit so it's easy to
read in review.

## 6. Factory card ring

`PlannerFactory.vue:390` `factoryClass()` — add `warning`, respecting precedence:

```ts
const factoryClass = (factory: Factory) => ({
  'factory-card': true,
  problem: factory.hasProblem,
  warning: !factory.hasProblem && hasFactoryWarnings(factory),
  needsSync: !factory.hasProblem && !hasFactoryWarnings(factory) && factory.inSync !== null ? !factory.inSync : false,
})
```

No new SCSS beyond the `.factory-card.warning` rule from section 2 — it mirrors `.factory-card.problem`
(2px amber border, tinted `.header`).

## 7. Sidebar entry + chip

`PlannerFactoryList.vue:241` uses the **same** `factory-card` class as the big card, so the amber ring
lands on the sidebar entry from the identical rule. Apply the same precedence as section 6.

For the chip under the title: the entry is currently a single `flex-nowrap` `v-row` — name on the
left, task-count and sync-state cells on the right. Turn the left-hand `<v-spacer class="d-flex
align-center text-body-1 pa-2">` into a **column**: the existing name line, then a conditional chips
line beneath it. The right-hand cells stay untouched and stretch to the new height, so nothing else
in that row needs to move.

```
┌──────────────────────────────────┬────┬────┐
│ ⣿ 🏭 Aluminium Plant             │ ☑3 │ ⟳  │
│    [🗄 Depot starved]            │    │    │
└──────────────────────────────────┴────┴────┘
```

Chip: `class="sf-chip x-small no-margin warning"` with the depot icon and the warning's `label`.
Render one chip per `FactoryWarning` — today that's only ever `depotStarved`, but the loop is what
makes the next warning type free. Clicking it should navigate to that factory's Satisfaction section — pass the section
anchor id as `navigateToFactory`'s second argument, following the existing task-count cell at
`PlannerFactoryList.vue:110`.

`StatisticsFactorySummary.vue:367` has the same `factoryClass` shape and should get the same amber
treatment for consistency — Matt didn't ask for it, but a factory reading amber in the sidebar and
plain in the summary is the kind of inconsistency that gets reported as a bug.

---

## 8. Statistics — aggregation helper

`web/src/utils/statistics.ts`, beside `calculateTotalParts`:

```ts
export interface DimensionalDepotEntry {
  partId: string
  totalAmount: number                                // sum of the surpluses
  factories: { factory: Factory, amount: number }[]  // amount === 0 → a starved contributor
  starved: boolean                                   // every contributor at 0 — nothing feeds it
}

export const calculateDimensionalDepot = (factories: Factory[]): DimensionalDepotEntry[]
```

Contribute `Math.max(0, part.amountRemaining)` for each truthy flag whose part still exists in
`factory.parts`. Keep zero-amount contributors — they are the point of the warning. Sort by
`getPartDisplayName`, matching every other helper in the file.

Two warning scopes, deliberately different and both needed:
- **Per factory** (section 2): *this* factory has flagged something it can't supply → amber card,
  sidebar chip, amber row.
- **Per item** (`starved` here): *no* factory anywhere is feeding this item → the item is dead in the
  statistics table even though several factories claim to fill it.

## 9. Statistics — the section

New `StatisticsDimensionalDepot.vue`, modelled on `StatisticsShardsSloops.vue`: same header /
summary-chip / hide-toggle skeleton, same `localStorage`-persisted visibility
(`statisticsDimensionalDepotHidden`, compared against the string `'true'` — `Boolean('false')` is
true, and that has bitten this codebase before), same `inject('navigateToFactory')` click-through.

| Column | Content |
|---|---|
| Item | `game-asset` (clickable) + display name |
| Input | `{{ formatNumber(totalAmount) }}/min` — amber when `starved` |
| Factories | One `sf-chip small factory` pill per contributor with its rate; contributors at 0 get the `warning` class and a tooltip saying their surplus is fully consumed |
| Warning | `starved` rows get an amber chip: *"Nothing is feeding this. Every factory flagged for this item has no surplus left."* |

Header summary chip: count of tracked items, plus an amber count of starved ones when any exist.
No footer total — the items don't sum to anything meaningful.

Empty state stays rendered, like its siblings: *"Nothing is being sent to the Dimensional Depot. Tick
the depot box on a surplus item under a factory's Satisfaction to track it here."* That message is the
feature's discovery path.

Mount in `Statistics.vue` (~80-89) after `statistics-items-difference`, before
`statistics-shards-sloops`, with the usual `<v-divider class="my-4 mx-n4" color="white"
thickness="5px" />`. No sidebar section change — the `openSection` jump-link targets the whole card.

**Don't touch `problems.ts` / `factory.hasProblem`.** A starved depot is not a broken factory; that
distinction is the entire reason for the amber tier.

---

## Verification

- **New** `web/src/utils/factory-management/warnings.spec.ts`: `isDepotStarved` true at exactly zero
  surplus, true when negative, false when positive, false when the part isn't flagged, false when the
  flag points at a part no longer in `factory.parts`; `getFactoryWarnings` returns one entry listing
  every starved part; `hasFactoryWarnings` false on a clean factory.
- **New** `web/src/utils/statistics.spec.ts` (doesn't exist yet) for `calculateDimensionalDepot`:
  single factory; two contributors to one item; one contributor at zero (row present, item **not**
  starved because the other still feeds it); all contributors zero → `starved`; stale flag excluded;
  **import-only factory with surplus → included** (the logistics-centre regression test for decision 1).
- `satisfaction.spec.ts`: `showDepotToggle` true on surplus, false on shortage, false on fluids, true
  when already flagged despite zero surplus; `toggleDimensionalDepot` sets and deletes.
- **Migration**: a plan without `dimensionalDepot` through `initFactories` gets `{}` and does **not**
  trigger a recalculation.
- Run: `cd web && pnpm exec vitest run statistics factory-management/warnings factory-management/satisfaction`
- **Browser** (`/verify` skill), the sequence that exercises the whole tier: flag a surplus → appears
  in the new section; export the whole surplus away so it lands at exactly 0 → part row goes amber,
  Satisfaction header goes amber, factory card ring goes amber, sidebar entry goes amber with a
  "Depot starved" chip beneath the name; break the factory outright → everything flips to red, no
  amber anywhere (precedence); fix it → back to amber; un-flag → all clear. Also park a `needsSync`
  factory next to a warning factory in the sidebar and confirm the two borders are tellable apart.
- `pnpm lint` and the `vue-tsc` pass in `pnpm build` clean.

## Delivery

One branch, one PR (`feat(web): dimensional depot tracking`), conventional commits — with the
Satisfaction header refactor and the warning tier as their own commits so review can follow them.
`CHANGELOG.md` entry under `[Unreleased]`. Safe for Beta v0.5: additive, opt-in, no calculation change.

## Convergence with the AWESOME Sink work

Two things carry forward. The Sink plan introduces `Factory.sinks[partId] = { mode: 'sink' | 'keep' }`
and names dimensional storage as a reason to *keep* a surplus — once it lands, sunk/kept/depoted are
three values on one axis and `dimensionalDepot` folds in as a third mode (a one-pass migration in its
phase 1). And the Sink plan's unallocated-byproduct warning (#119) was already specced as "a new soft
category — amber, not the red `hasProblem`": that tier now exists, so it becomes a second
`FactoryWarningType` and inherits the row, section, card and sidebar treatment for free.
