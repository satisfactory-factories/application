# Plan: Dimensional Depot tracking (issue #498)

Status: **ready to execute**, rebased onto `update6` on 2026-08-12. One branch/PR. No calculation-engine
changes.

> **Rebase note.** This plan originally carried its own amber warning tier. That tier was split out to
> issue #506, built as PR #508 (plus #510, #511) and is now on `main`. Roughly half of what this
> document used to describe is therefore already shipped — see *What #508 already gave us*. What
> survives is the depot feature itself plus **one registry entry**.

Related: `.claude/plans/506-factory-status-indicators.md` (built), and
`.claude/plans/awesome-sink-and-byproduct-routing.md` — same axis, converges later.

## Tasks

- Add the `dimensionalDepot` map to `Factory`, both interface copies, `newFactory` and `initFactories`.
- Add `isDepotStarved` and register a `depotStarved` warning in `status.ts`.
- Add the depot toggle button and purple "Depot" chip to the Satisfaction item rows.
- Give a starved satisfaction row the warning-tier row treatment.
- Add `calculateDimensionalDepot` to `utils/statistics.ts` and a `StatisticsDimensionalDepot.vue` section.
- Verify the fluid guard against the wiki before shipping the predicate.
- Correct the stale "Mining Update" name in `506-factory-status-indicators.md` and
  `update6-changelog-and-splash.md` (v0.6 shipped as **The Groundwork Update**).

## What we're building

1. A per-item opt-in "send this surplus to the Dimensional Depot" flag under Satisfaction, marked with
   a purple chip.
2. A Statistics section listing every flagged item, its input rate, and the factories feeding it.
3. A `depotStarved` warning raised when a flagged part has no surplus left — because if every last unit
   is spoken for by exports and internal use, the depot never receives anything and the player has no
   way to see that today.

## Decisions

1. **Eligibility is surplus-driven, never production-driven.** Offered wherever `amountRemaining > 0`,
   regardless of what created the surplus — production, byproduct or import. Nothing checks whether the
   factory makes the part. A logistics centre that imports everything and depots the overflow is a real
   build, and gating on local production would exclude the very factory whose surplus most needs a
   destination. *(Applies to the parked Sink work too — noted in that plan.)*
2. **The depot flag does not change the calculation.** `parts.ts` and `PartMetrics` untouched;
   `amountRemaining` still reads as surplus; nothing is consumed. Making a depoted surplus land at zero
   is the Sink plan's `amountRequiredSink` mechanism and a locked decision there.
3. **Toggling the flag must not trigger a recalculation.** No calculation reads it, and the status is
   derived at render time, so a toggle needs persistence but not a recalc.
4. **Named "Dimensional Depot"** in the UI, not the issue's "Dimension Storage" — the game's term, and
   the icons already shipped under that name (`web/public/assets/game/item/dimensional-depot_64.png`).

---

## What #508 already gave us

Everything in this list was in the original plan and is now on `main`. **Do not rebuild any of it.**

| Was planned here | Where it lives now |
|---|---|
| A `warnings.ts` module with a typed warning list | `utils/factory-management/status.ts` — a severity-tiered registry covering problems *and* warnings |
| The amber colour token | `sfColors.statusWarning` — **burnt orange, not amber** (see below) |
| Card ring precedence | `factoryStatusClass()`, bound in `PlannerFactory.vue:436` |
| Sidebar entry colour + chip under the title | `PlannerFactoryList.vue:241` + `FactoryStatusChips.vue` (`animated`) |
| Satisfaction section-header refactor to one computed `<h2>` | `PlannerFactorySatisfaction.vue:6` — driven by `highestSeverity(sectionStatuses)` |
| `StatisticsFactorySummary` consistency | `StatisticsFactorySummary.vue:375` |
| Red-outranks-amber precedence | `highestSeverity()`, one definition |

**Two divergences from the plan matter here:**

- **The warning tier is burnt orange, not amber.** The plan proposed a new amber and warned that amber
  beside the out-of-sync burnt orange was the one real visual risk. #508 resolved that by *merging*
  them: `outOfSync` became a warning status and the tier took its colour. So a starved depot will read
  the same orange as an out-of-sync factory. That is deliberate — one tier, one colour — but it is not
  the amber that was originally asked for. If it needs re-tuning, change `sfColors.statusWarning` once
  and every site follows; do not introduce a second warning colour.
- **There are two tiers, not three.** `FactoryStatusSeverity = 'problem' | 'warning'`. The `notice` tier
  was dropped and `outOfSync` folded into `warning` with a chip.

---

## 1. Data model

`factory.parts` is wiped and rebuilt on every calculation (`parts.ts` — `factory.parts = {}`), so a user
flag **cannot** live on `PartMetrics`. It gets its own map on `Factory`, the same shape as
`exportCalculator`:

```ts
// Parts the user has flagged as being uploaded to the Dimensional Depot. Purely a marker:
// the depot rate is derived from the part's surplus at read time.
dimensionalDepot: { [partId: string]: boolean };
```

**Flags are sticky by design** — never pruned when a part leaves the factory. Read-time filtering
against `factory.parts` makes a stale key inert, and if the part comes back the user's intent is still
there. It also means a flag survives its surplus drying up, which *is* the warning case.

Survives the clone-run-commit engine unchanged: `calculateFactories` `structuredClone`s the whole
factory and `applyDiff` preserves any key the engine didn't touch.

| File | Change |
|---|---|
| `web/src/interfaces/planner/FactoryInterface.ts` (beside `exportCalculator`, ~238) | Add the field |
| `backend/interfaces/FactoryInterface.ts` (~153) | Same field — hand-maintained duplicate |
| `web/src/utils/factory-management/factory.ts` (`newFactory`, ~96) | `dimensionalDepot: {}` |
| `web/src/stores/app-store.ts` (`initFactories`, patch block from ~420) | Backfill `{}` — **do not** set `needsCalculation`; an empty map changes no derived value, and a needless recalc blocks the main thread for seconds on big plans |

Backend needs nothing else — plans are stored as `Mixed` (`backend/models/FactoyDataSchema.ts`).

---

## 2. The `depotStarved` status

This is now **one entry** in `factoryStatusDefinitions` (`status.ts`) and a predicate. No new module, no
new component, no new SCSS — the card ring, sidebar chip, section header and summary row all pick it up
for free. That property is what #508 was for; don't special-case this type at any display site.

```ts
// A flagged part with nothing left over: every unit is taken by exports and internal consumption,
// so the depot receives nothing. Zero counts, not just negative — a part sitting at exactly 0
// surplus is fully spoken for, and that is invisible today because zero is otherwise healthy.
export const isDepotStarved = (factory: Factory, partId: string): boolean =>
  !!factory.dimensionalDepot?.[partId] && (factory.parts[partId]?.amountRemaining ?? 0) <= 0
```

The registry entry, placed with the other warnings:

```ts
{
  type: 'depotStarved',
  severity: 'warning',
  icon: 'fas fa-box-taped',
  chip: true,
  section: 'satisfaction',
  detail: 'Every unit of these parts is used by exports or internal production, so nothing reaches the Dimensional Depot.',
  detect: factory => nonEmpty(subjects(
    Object.keys(factory.dimensionalDepot ?? {}).filter(part => isDepotStarved(factory, part))
  )),
  label: list => count(list, 'Depot starved', 'depots starved'),
  detailLabel: list => count(list, 'Depot receiving nothing', 'depoted parts receiving nothing'),
}
```

Add `'depotStarved'` to the `FactoryStatusType` union. Subjects are part ids, so `FactoryStatusChips`
renders the starved items' own icons — better than a generic depot icon, and it means the `icon` field
is only ever the fallback.

**Two things to respect in `status.ts`:**

- **It must stay a leaf module.** `isDepotStarved` only touches `factory.parts` and the new map, so it
  can live in `status.ts` directly. If it ends up in `satisfaction.ts` instead, check that file doesn't
  reach `factory.ts` — that closes the cycle the header warns about.
- **`hasFactoryProblem` must not get slower.** It filters to `severity === 'problem'` and bails on the
  first hit, so a warning entry costs the engine nothing. Keep it that way.

**Tier check:** the module's rule is "red is arithmetic, amber is judgement". A starved depot is
arithmetic — but it is arithmetic about a *destination the user declared*, not about the plan failing to
balance. The factory works fine; the user's intent is being quietly ignored. That is judgement, so it is
a warning. Worth stating in the entry's comment, since it is the one entry where the rule needs an
argument.

### Colour token for the flag

One new token in `web/src/utils/colors.ts` — never a literal hex in a component. The muted purple of the
circuit boost reads nicely against the blue/cyan Product and Byproduct chips it sits with. That hex is
still a literal at `colors.ts:81`, so promote it into the palette and have both tokens draw from one
definition:

```ts
// palette
mutedPurple: '#9f6d9f',

// sfColors
circuitBoost: { color: palette.mutedPurple, border: palette.mutedPurple },   // unchanged value
dimensionalDepot: { color: palette.mutedPurple, border: palette.mutedPurple },
```

A **separate token** rather than reusing `circuitBoost`: unrelated concepts that happen to share a shade
today, and a semantic name means either can be re-tuned without dragging the other along. Distinct from
`somersloop`'s `#bd67ff`, which is far more saturated — check the two aren't confusable on a plan showing
both. Add `.sf-chip.dimensional-depot` in `global.scss` alongside the other item/flow chip colours (the
`&.boost, &.circuit-boost` block ~276 is the model).

---

## 3. Satisfaction — the toggle

`PlannerFactorySatisfactionItems.vue`, in the Item cell's right-hand action stack — empty on healthy
rows, so the control is visible without crowding the chips.

- Outlined toggle button carrying `<game-asset subject="dimensional-depot" type="item_id" />` plus
  "Depot". A `v-checkbox-btn` is the literal reading of the issue, but every other control in that stack
  is a small outlined `v-btn` — match it. Give it an id of the form `<factoryId>-depot-toggle-<partId>`
  for browser tests.
- **When checked, the row gains a purple "Depot" chip** in the name cell alongside
  Product/Byproduct/Imported. Follow the `showRawShortageChip` pattern already in that cell (~line 68):
  `class="sf-chip dimensional-depot x-small mr-2"` with the depot icon. That chip, not the button state,
  is what makes a depoted item scannable down a long satisfaction table. Colour the toggle button to
  match so the control and the chip are obviously the same concept.
- **Predicate**, new export in `satisfaction.ts` beside the other `show*` helpers:

  ```ts
  export const showDepotToggle = (factory, partId, gameData) => {
    if (gameData.items.parts[partId]?.isFluid) return false // Depots take conveyor input only
    if (factory.dimensionalDepot?.[partId]) return true     // Stay visible once flagged, so a
    return (factory.parts[partId]?.amountRemaining ?? 0) > 0 // dried-up surplus can be seen and undone
  }
  ```

  **Verify the fluid guard against the wiki before shipping it** — it is a game-rules claim, not
  something the codebase asserts. Raw resources are a live question the guard does *not* cover:
  `parts[partId].isRaw` now exists, and a mine with spare ore will offer a depot toggle. That is correct
  (ore can be uploaded), but confirm it reads sensibly next to the extraction UI.
- `toggleDimensionalDepot(factory, partId)` also in `satisfaction.ts` so it is unit-testable. `delete`
  the key rather than setting `false`, keeping saved plans small.
- **Don't call the injected `updateFactory`** — it runs a full recalculation for a flag no calculation
  reads, and the status is derived at render time so it updates instantly anyway. Persistence is covered
  by the store's compare-and-save and the flush on tab-hide; emit `factoryUpdated` if you want it saved
  immediately without recalculating.

## 4. Satisfaction — the starved row

`satisfactionShading(part)` is still green/red only (`PlannerFactorySatisfactionItems.vue:474`), and the
scoped SCSS still gives a treatment to `.border-red` alone (~line 699). Extend both. The function needs
the part id, which its four call sites (lines 21, 186, 316, 347) already have to hand:

```ts
const satisfactionShading = (part: PartMetrics, partId: string) => ({
  'border-green': part.satisfied && !isDepotStarved(factory, partId),
  'border-warning': part.satisfied && isDepotStarved(factory, partId),
  'border-red': !part.satisfied,   // red wins outright
})
```

Add the matching scoped rule beside `&.border-red`, using `--sf-status-warning-bg` /
`--sf-status-warning-border`. It must be applied to all four `<td>`s, exactly as `border-red` already is.

Name it `border-warning`, not `border-amber` — the tier is orange now, and a class named for a colour it
isn't will mislead the next reader.

No separate warning chip is needed on the row: the section header above it already renders the
`depotStarved` chip via `FactoryStatusChips` with the starved part's icon, and the tooltip on that chip
carries the explanatory sentence. Adding a second chip in the row would say the same thing twice.

---

## 5. Statistics — aggregation helper

`web/src/utils/statistics.ts`, beside `calculateTotalParts` (~71):

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

- **Per factory** (the `depotStarved` status): *this* factory flagged something it can't supply.
- **Per item** (`starved` here): *no* factory anywhere is feeding this item, so it is dead in the
  statistics table even though several factories claim to fill it.

## 6. Statistics — the section

New `StatisticsDimensionalDepot.vue`, modelled on `StatisticsShardsSloops.vue`: same header /
summary-chip / hide-toggle skeleton, same `localStorage`-persisted visibility
(`statisticsDimensionalDepotHidden`, compared against the string `'true'` — `Boolean('false')` is true,
and that has bitten this codebase before), same `inject('navigateToFactory')` click-through.

| Column | Content |
|---|---|
| Item | `game-asset` (clickable) + display name |
| Input | `{{ formatNumber(totalAmount) }}/min` — warning-coloured when `starved` |
| Factories | One `sf-chip small factory` pill per contributor with its rate; contributors at 0 get the `status-warning` class and a tooltip saying their surplus is fully consumed |
| Warning | `starved` rows get a `status-warning` chip: *"Nothing is feeding this. Every factory flagged for this item has no surplus left."* |

Header summary chip: count of tracked items, plus a warning-coloured count of starved ones when any
exist. No footer total — the items don't sum to anything meaningful.

Empty state stays rendered, like its siblings: *"Nothing is being sent to the Dimensional Depot. Tick the
depot box on a surplus item under a factory's Satisfaction to track it here."* That message is the
feature's discovery path.

Mount in `Statistics.vue` after `statistics-items-difference` (~85), before `statistics-shards-sloops`,
with the usual `<v-divider class="my-4 mx-n4" color="white" thickness="5px" />`.

**Don't touch `problems.ts` / `factory.hasProblem`.** A starved depot is not a broken factory; that
distinction is the entire reason the warning tier exists.

---

## Verification

- **`status.spec.ts`** (exists): `isDepotStarved` true at exactly zero surplus, true when negative, false
  when positive, false when the part isn't flagged, false when the flag points at a part no longer in
  `factory.parts`. `getFactoryStatuses` returns one `depotStarved` entry listing every starved part.
  Add a `status-fixtures.ts` case if the existing fixtures don't cover a flagged factory.
- **`status-regression.spec.ts`** (exists): confirm adding a warning entry leaves `hasProblem` unchanged
  on the fixture plans — that file exists precisely to catch a registry change altering saved-plan colour.
- **New** `web/src/utils/statistics.spec.ts` for `calculateDimensionalDepot`: single factory; two
  contributors to one item; one contributor at zero (row present, item **not** starved because the other
  still feeds it); all contributors zero → `starved`; stale flag excluded; **import-only factory with
  surplus → included** (the logistics-centre regression test for decision 1).
- `satisfaction.spec.ts`: `showDepotToggle` true on surplus, false on shortage, false on fluids, true when
  already flagged despite zero surplus; `toggleDimensionalDepot` sets and deletes.
- **Migration**: a plan without `dimensionalDepot` through `initFactories` gets `{}` and does **not**
  trigger a recalculation.
- Run: `cd web && pnpm exec vitest run statistics factory-management/status factory-management/satisfaction`
- **Browser** (`/verify` skill): flag a surplus → appears in the new section; export the whole surplus
  away so it lands at exactly 0 → part row goes orange, Satisfaction header gains the chip, factory card
  ring and sidebar entry go orange with a "Depot starved" chip; break the factory outright → everything
  flips to red (precedence); fix it → back to orange; un-flag → all clear. Also confirm a depot-starved
  factory and an out-of-sync factory are tellable apart in the sidebar — they now share a colour, so the
  chip is the only disambiguator.
- `pnpm lint` and the `vue-tsc` pass in `pnpm build` clean.

## Delivery

One branch off `update6` (or `main` once `update6` merges — check first), one PR
(`feat(web): dimensional depot tracking`), conventional commits. `CHANGELOG.md` entry under
`[Unreleased]`. Additive, opt-in, no calculation change, and no manual steps on deploy.

**Sequencing:** `update6` is the release branch and is 75 commits ahead of `main` with the v0.6 splash and
changelog already written. Unless this is meant to land *in* v0.6, branch after that merges rather than
adding to the release surface.

## Convergence with the AWESOME Sink work

The Sink plan introduces `Factory.sinks[partId] = { mode: 'sink' | 'keep' }` and names dimensional storage
as a reason to *keep* a surplus — once it lands, sunk/kept/depoted are three values on one axis and
`dimensionalDepot` folds in as a third mode (a one-pass migration in its phase 1). Its
unallocated-byproduct warning (#119) is now simply another `factoryStatusDefinitions` entry.