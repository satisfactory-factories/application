# Plan: Dimensional Depot tracking (issue #498)

Status: **ready to execute**. Single feature, single branch/PR. No engine changes.
Related: `.claude/plans/awesome-sink-and-byproduct-routing.md` (Beta v0.6) — same axis, see "Convergence" below.

## What the issue asks for

Per-item opt-in flag under Satisfaction; a new Statistics section listing every flagged item with its
input rate, the factories feeding it, and a warning when nothing is actually feeding it.

## Decisions taken

1. **Eligibility is surplus-driven, never production-driven.** A logistics centre that imports
   everything and ships nothing on has a legitimate surplus to depot — the same is true of sinking.
   So the flag is offered wherever `amountRemaining > 0`, regardless of where that surplus came from
   (production, byproduct or import), and the depot rate is `max(0, amountRemaining)`. There is no
   check for "does this factory produce the part". *(This point applies to the parked Sink work too —
   noted in that plan.)*
2. **Display-only. No calculation change.** The flag does not consume the surplus: `parts.ts` and
   `PartMetrics` are untouched, `amountRemaining` still reads as surplus, `hasProblem` is unaffected.
   Reasons: it keeps the hot path and the double-pass recalc out of scope entirely, and "surplus is
   consumed by a declared destination" is a locked v0.6 design decision belonging to the Sink work —
   shipping half of it here would pre-empt it. *(Reversible: if you want the depot to zero the surplus,
   that is the Sink plan's `amountRequiredSink` mechanism with a second bucket, and should land there.)*
3. **Called "Dimensional Depot" in the UI**, not "Dimension Storage". It is the game's own term, and
   the icon assets already shipped under that name (`web/public/assets/game/item/dimensional-depot_64.png`,
   `_256.png`). Issue wording differs; the issue is ours to reword.

## Data model

`factory.parts` is rebuilt from scratch on every calculation (`parts.ts:34` — `factory.parts = {}`),
so a user flag **cannot** live on `PartMetrics`. It goes in its own map on `Factory`, the same shape
as `exportCalculator`:

```ts
// web/src/interfaces/planner/FactoryInterface.ts — on Factory
// Parts the user has flagged as being uploaded to the Dimensional Depot. Purely a marker:
// the depot rate is derived from the part's surplus at read time.
dimensionalDepot: { [partId: string]: boolean };
```

**Flags are sticky by design.** They are never pruned when a part leaves the factory — the statistics
helper filters at read time against `factory.parts`, so a stale key is inert, and if the part comes
back the user's intent is still there. That also means a flagged part whose surplus drops to zero
keeps its flag, which is precisely the starvation case the issue wants warned about.

Survives the clone-run-commit engine unchanged: `calculateFactories` `structuredClone`s the whole
factory (`factory.ts:268`) and `applyDiff` (`commit.ts`) preserves any key the engine didn't touch.

### Files that must move together

| File | Change |
| --- | --- |
| `web/src/interfaces/planner/FactoryInterface.ts` (`Factory`, ~line 197) | Add the field |
| `backend/interfaces/FactoryInterface.ts` (`Factory`, ~line 134) | Same field — this file is a hand-maintained duplicate ("Duplicated by backend") |
| `web/src/utils/factory-management/factory.ts` (`newFactory`, line 60) | `dimensionalDepot: {}` |
| `web/src/stores/app-store.ts` (`initFactories`, the per-factory patch block from line 331) | `if (factory.dimensionalDepot === undefined) factory.dimensionalDepot = {}` — **do not** set `needsCalculation`; backfilling an empty map changes no derived value, and a needless recalc blocks the main thread for seconds on big plans (see the comment at line 505) |

Backend needs nothing else — plans are stored as `mongoose.Schema.Types.Mixed` (`backend/models/FactoyDataSchema.ts`), so save/load/share carry the new key opaquely.

## 1. Satisfaction UI — the toggle

`web/src/components/planner/PlannerFactorySatisfactionItems.vue`, in the Item cell's right-hand action
stack (the `<div class="align-self-center text-right">` block, ~line 70) — it sits empty on healthy
rows, so the control is visible without crowding the chips.

- Render an outlined toggle button carrying the depot icon:
  `<game-asset subject="dimensional-depot" type="item_id" height="20" width="20" />` plus the word
  "Depot". Active state = `variant="flat"`; inactive = `variant="outlined"`. A `v-checkbox-btn` is the
  literal reading of the issue, but the surrounding action stack is entirely small outlined `v-btn`s —
  match it. Add `:id="`${factory.id}-depot-toggle-${partId}`"` for the browser tests.
- **Visibility predicate** — new export in `web/src/utils/factory-management/satisfaction.ts`, beside
  the other `show*` helpers:

  ```ts
  // Offered on any surplus, whatever produced it — a logistics factory that imports everything
  // still has surplus worth depoting. Stays visible once flagged so a surplus that dries up can
  // still be seen (and un-flagged) rather than silently vanishing from the statistics.
  export const showDepotToggle = (factory: Factory, partId: string, gameData: DataInterface) => {
    if (gameData.items.parts[partId]?.isFluid) return false // Depots take conveyor input only
    if (factory.dimensionalDepot?.[partId]) return true
    return (factory.parts[partId]?.amountRemaining ?? 0) > 0
  }
  ```

  *Verify the fluid guard against the wiki before merging — it is from game knowledge, not the data.
  If wrong, delete the first line; nothing else depends on it.*
- **Toggle handler** — also in `satisfaction.ts` so it is unit-testable:
  `toggleDimensionalDepot(factory, partId)` sets or `delete`s the key (delete rather than `= false`,
  to keep saved plans small and the map's key set meaningful).
- Component wiring: mutate the factory directly and **do not** call the injected `updateFactory` — that
  runs a full recalculation for a flag no calculation reads. Persistence still happens: the store's
  5-second compare-and-save plus the flush on tab-hide/close covers direct mutations
  (`app-store.ts:116-151`). If you want it saved immediately, emit `factoryUpdated` on the event bus,
  which is debounced into a save without recalculating.
- Add a `<v-tooltip>`: *"Track this surplus as going into your Dimensional Depot. Shows up under
  Statistics → Dimensional Depot."*

## 2. Statistics — aggregation helper

`web/src/utils/statistics.ts`, beside `calculateTotalParts`:

```ts
export interface DimensionalDepotEntry {
  partId: string
  totalAmount: number                                       // sum of the surpluses
  factories: { factory: Factory, amount: number }[]         // amount === 0 means a starved contributor
  starved: boolean                                          // every contributor at 0 — nothing is feeding it
}

export const calculateDimensionalDepot = (factories: Factory[]): DimensionalDepotEntry[]
```

- For each factory, for each key in `factory.dimensionalDepot` that is truthy **and** still present in
  `factory.parts` (the read-time filter for stale flags), contribute `Math.max(0, part.amountRemaining)`.
- Include zero-amount contributors in `factories` — they are the point of the warning.
- `starved = totalAmount === 0` (guard on `<= 0` for float dust).
- Sort by `getPartDisplayName`, matching every other helper in the file.

## 3. Statistics — the section

New `web/src/components/planner/StatisticsDimensionalDepot.vue`. Model it on
`StatisticsShardsSloops.vue` — same header/summary-chip/hide-toggle skeleton, same
`localStorage`-persisted visibility (`statisticsDimensionalDepotHidden`, compared against the string
`'true'` — `Boolean('false')` is true, and that bug has bitten this codebase before), same
`inject('navigateToFactory')` for click-through. Auto-imported; no registration needed.

Table, one row per flagged item:

| Column | Content |
| --- | --- |
| Item | `<game-asset clickable type="item">` + display name |
| Input | `{{ formatNumber(totalAmount) }}/min` — red when `starved` |
| Factories | One `sf-chip small factory` pill per contributor: `<i class="fas fa-industry" />` + name + `{{ formatNumber(amount) }}/min`. Contributors at 0 get the `red` class and a "starved" tooltip. Clicking navigates to the factory. |
| Warning | For `starved` rows: an amber/red chip — *"Nothing is feeding this. Every factory flagged for this item is producing no surplus."* |

Header summary chip: count of tracked items, plus a red count of starved ones when any exist.
Footer total row is unnecessary here (the items don't sum to anything meaningful) — drop it.

Empty state (no flags anywhere in the plan): keep the section rendered, like its siblings, with
*"Nothing is being sent to the Dimensional Depot. Tick the depot box on a surplus item under a
factory's Satisfaction to track it here."* — that message is the feature's discovery path.

Mount it in `web/src/components/planner/Statistics.vue` in the `v-card-text` stack (~line 80-89),
after `statistics-items-difference` and before `statistics-shards-sloops`, with the usual
`<v-divider class="my-4 mx-n4" color="white" thickness="5px" />` between. No sidebar change — the
`openSection` jump-link targets the whole Statistics card.

**Warnings stay soft.** Do not touch `problems.ts` / `factory.hasProblem` — a starved depot is not a
broken factory, and the Sink plan already reserves a separate warning category for exactly this class
of thing. Confine it to the statistics table.

## 4. Colour

Use a semantic token, never a literal hex (`web/src/utils/colors.ts` is the single source of truth).
Either reuse `sfColors.product` for the depot chip, or add a `dimensionalDepot` token plus a matching
`&.dimensional-depot` rule in the `.sf-chip` block of `web/src/assets/styles/global.scss`
(~line 172 onwards). The depot's in-game livery is purple-ish, which collides with `somersloop` —
if you add a token, pick something clearly distinct from it.

## Verification

- **Unit** — new `web/src/utils/statistics.spec.ts` (the file doesn't exist yet) for
  `calculateDimensionalDepot`: single factory with surplus; two factories contributing to one item;
  a contributor at zero surplus (row present, amount 0, not starved because the other still feeds it);
  every contributor at zero → `starved: true`; a flag whose part no longer exists in `factory.parts`
  → excluded; **an import-only factory with surplus → included** (this is the logistics-centre case
  and is the regression test for decision 1).
- **Unit** — `satisfaction.spec.ts`: `showDepotToggle` true on surplus, false on shortage, false on
  fluids, true when already flagged despite zero surplus; `toggleDimensionalDepot` sets and deletes.
- **Migration** — a plan object without `dimensionalDepot` through `initFactories` gets `{}` and does
  **not** trigger a recalculation.
- Run: `cd web && pnpm exec vitest run statistics factory-management/satisfaction`
- **Browser** (`/verify` skill): flag a surplus in one factory, confirm it appears in the new section
  with the right rate; add a second factory feeding the same item and confirm both pills; trim the
  producing factory until surplus is 0 and confirm the starved warning; reload and confirm the flag
  persisted; check an imported surplus can be flagged.
- `pnpm lint` and the `vue-tsc` pass in `pnpm build` must both be clean.

## Delivery

One branch, one PR (`feat(web): dimensional depot tracking`), conventional commits. Add a
`CHANGELOG.md` entry under `[Unreleased]`. Safe for Beta v0.5 — it is additive, opt-in, and touches
no calculation.

## Convergence with the AWESOME Sink work

The Sink plan (Beta v0.6) introduces `Factory.sinks[partId] = { mode: 'sink' | 'keep' }` and names
dimensional storage as a reason to *keep* a surplus. Once it lands, "sunk", "kept" and "depoted" are
three values on one axis — where does this surplus go — and `dimensionalDepot` should fold into that
map as a third mode. That is a one-pass migration over saved plans (`dimensionalDepot` keys become
`sinks[partId].mode = 'depot'`) and belongs in the Sink work's phase 1, not here. Keeping the field
separate now costs one migration later and buys complete independence from a v0.6 design that is not
built yet.
