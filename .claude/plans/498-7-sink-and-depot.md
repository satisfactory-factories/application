# Plan: AWESOME Sink + Dimensional Depot on one axis (issues #498, #7)

Status: **executing**. One branch (`claude/dimensional-storage-awesome-sync-swp2fw`), one PR.

Supersedes the parts of `.claude/plans/498-dimensional-depot-tracking.md` and
`.claude/plans/awesome-sink-and-byproduct-routing.md` phases 1–2 that this delivers. The byproduct
*routing* half of the sink plan (phase 3: `byProductRouting`, recycle opt-out, "Divert to…" picker)
is **not** in scope here and that plan still owns it.

## The merge

The two features are one control, not two. A surplus has exactly three destinations:

1. **Another factory** — exports, already modelled.
2. **The Dimensional Depot** — finite storage. Defers a backlog; does not prevent one.
3. **An AWESOME Sink** — genuine disposal. The surplus is gone.

So both live in one new **Storage** column on the satisfaction table, left of Satisfaction, each a
plain number spinner: how many AWESOME Sinks, how many Dimensional Depot Uploaders.

## Decisions

1. **A sink count above zero sinks the WHOLE surplus.** The sink takes whatever the belt brings it,
   so the count is about what to build and what it draws, not a rate cap. Priority-splitter
   semantics: production, power and exports are real demand and always win; the sink only takes
   what is left, recomputed every calculation.
2. **A depot count does NOT change the ledger.** The depot is a container with a finite capacity.
   It fills, then it backs up. Modelling it as demand would tell the user their surplus is handled
   when it is only postponed.
3. **Only a sink clears the backlog advisory.** Follows from 2. Confirmed with the user 2026-08-19.
4. **AWESOME Sinks draw power: 30 MW each** (`Build_ResourceSink_C.mPowerConsumption`, Docs.json).
   The Dimensional Depot Uploader draws 0 MW. Confirmed with the user 2026-08-19.
5. **Named "Dimensional Depot"**, the game's term — matching the shipped icons and the earlier
   plan's locked decision, not issue #498's "Dimension Storage". Confirmed with the user.
6. **One Mercer Sphere per Dimensional Depot Uploader.** Read off the game's own build recipe
   (`Recipe_CentralStorage_C`: 1 Mercer Sphere, 10 SAM Fluctuator, 10 Modular Frame, 100 Wire),
   not off a wiki page.
7. **The advisory uses the existing `note` tier.** #508 already shipped a third severity that gets
   a chip and is left out of the colour rollup entirely — exactly "advisory, does not turn the
   factory red or amber". No new tier.

## Data model

```ts
export interface FactoryPartDisposal { sinks: number; depots: number }
// on Factory, beside exportCalculator:
partDisposal?: { [partId: string]: FactoryPartDisposal }
```

Its own map rather than a field on `PartMetrics`, because `parts.ts` wipes and rebuilds
`factory.parts` every calculation. Sticky by design: never pruned when a part leaves the factory,
so bringing the part back restores the user's intent. Optional so old plans and existing spec
fixtures load unchanged; `newFactory` and `initFactories` still set `{}`.

Two new derived `PartMetrics` fields, both optional (derived every calculation, like `isSinkable`):

- `amountRequiredSink` — what the sinks take.
- `amountRemainingPreSink` — the surplus the part would carry if it were not being sunk. Exists so
  the display can show the number sinking removed.

## Engine

`parts.ts`, in `calculatePartMetrics`, **after** `calculatePartRaw` — sinking an ore surplus must
not pull more ore out of the world:

```
amountRemainingPreSink = amountSupplied - amountRequired
amountRequiredSink     = isSinkable && sinks > 0 ? max(0, amountRemainingPreSink) : 0
amountRequired        += amountRequiredSink
amountRemaining        = amountSupplied - amountRequired      // 0 for a fully sunk part
```

Falls out for free: `shouldShowFix` stops offering Trim on a deliberately-overproducing factory,
and `StatisticsItemsDifference` stops listing sunk parts as loose surplus.

`buildings.ts`, in `calculateFinalBuildingsAndPower`: `sinks × 30 MW` added to `consumed`,
`consumedMin` and `consumedMax` alike (the sink has no clock, so it does not swing).

## Status

New `willBacklog` note, plus three existing entries that stop being true once sinking is real:

- `potentialBlockage` and `noDemand` tooltips said "support for sinking is coming in a future
  update". It is here; both are rewritten to point at the Storage column.
- The `End product` chip said the planner "assumes you deliver it to the Space Elevator, or sink
  it". It no longer assumes — the user says so.

`willBacklog` fires on a significant surplus that no sink is taking. It does not need to test the
sink itself: a sunk part lands at `amountRemaining === 0`, so the surplus test already excludes it.
Suppressed where `potentialBlockage` or `noDemand` already says the same thing about the same part.

On by default, switchable off in Options (`showBacklogAdvisory`) — it is the kind of advice that
becomes nagging on a big plan.

## Statistics

- **New top-level `DimensionalDepot.vue` section**, its own card beside Statistics rather than
  inside it, purple header. One row per item: rate into the depot, container count, and a factory
  pill per contributor carrying that factory's own container count. Rendered only when the plan
  actually uses the depot.
- **`StatisticsShardsSloops.vue` gains a third column**, Mercer Spheres, at one per uploader.

## Verification

- `parts.spec.ts` — sink bucket math, export shrinks the sunk amount, fluid/radioactive guards,
  raw supply unaffected.
- `status.spec.ts` — `willBacklog` on/off, suppression, tier.
- `statistics.spec.ts` — depot aggregation, Mercer Sphere totals.
- `satisfaction.spec.ts` / `disposal.spec.ts` — predicates and setters.
- `status-regression.spec.ts` must stay green: a note entry cannot change saved-plan colour.
- `pnpm lint` and the `vue-tsc` pass in `pnpm build`.
