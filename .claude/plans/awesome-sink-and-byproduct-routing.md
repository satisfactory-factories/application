# Proposal: First-party AWESOME Sink support + byproduct routing

Status: **direction approved 2026-07-21 — targeted at Beta v0.6. Do NOT implement during Beta v0.5** (that's the performance release; this is too big a change to piggyback and must be properly communicated in its own release).
Related: issue #7 (sinking consumer options), #119 (byproduct blockage warnings), #46 (storage/logistics discussion, "allocated surplus"), abandoned draft PR #254 (sink-as-building approach, closed).

## Context

Users playing the aluminium chain (and any multi-output recipe) hit two related gaps:

1. **Byproducts have no declared destination — and worse, the planner forces one.** Water from Aluminum Scrap can be recycled into Alumina Solution, diverted into a sibling product (Wet Concrete), exported, or sunk — but the planner gives no way to *state* which, and no warning when a byproduct is left dangling (which in-game means a clogged factory, issue #119). Direct user feedback (2026-07-21):

   > "Can I make the water NOT recycle? I'm looking at my AL factory — practically, I find recycling causes bottlenecks — and it's better instead in a separate system to dump into wet concrete (limestone + water in a refinery) and sink the concrete. Now it feels like I HAVE to recycle. I'm not sure we can solve recycling unless we can specifically say 'this input goes here and this output goes here'."

   The single-pool ledger auto-nets byproduct water against internal water demand, so the planner silently assumes recycling — reduced raw-water requirement, "Recycled" chip — even when the player has physically separated the streams. Opting out of recycling must therefore be a real engine control, not just a display concern.
2. **Surplus goes nowhere.** Plans are left with dangling surplus; the standing assumption ("it is assumed you are sinking all these products") is buried in help text. The real in-game pattern is a **priority splitter**: exports get fed first, overflow goes to an AWESOME Sink, so the factory never backs up and always produces. The planner should model that explicitly: mark surplus as sunk, and show plan-wide what's being sunk.

### Why PR #254 failed, and what we learned

PR #254 modelled the Sink as a *building with a count* per factory (for power draw). The thread concluded that a per-building demand obscures "what's available to export at a glance," and the effort died on UI complexity. The design below deliberately avoids sink-as-building: **the sink is a per-part disposition on the surplus**, not a producer/consumer entity. Sink count is immaterial (the user said as much) — we derive rates, not buildings.

### What the engine already gives us (key findings)

- Every part nets through a single `PartMetrics` ledger (`web/src/utils/factory-management/parts.ts:5-18`): demand = `amountRequiredProduction + amountRequiredExports + amountRequiredPower`, supply = `amountSuppliedViaInput + amountSuppliedViaRaw + amountSuppliedViaProduction`, verdict = `amountRemaining`.
- **Byproduct → internal netting is automatic and unconditional.** Water byproduct supply (`parts.ts:149-152`) and any internal water demand (`parts.ts:76`) offset in the shared bucket, and `showRecycledChip` (`satisfaction.ts:167-180`, issue #243) badges it. That's convenient when the player *is* recycling — and wrong when they aren't (see the feedback above): the ledger has no way to say "this byproduct does not feed that consumer." Routing therefore needs a supply-partition in the engine, plus the affordance (one click to add a consuming product) and the visibility (an allocation breakdown).
- Surplus is never a problem today: `calculateHasProblem` (`problems.ts`) only fires on deficits. `shouldShowFix` (`products.ts:178-215`) returns `'surplus'` → offers "Trim" only.
- No sink concept exists anywhere in engine, UI, or backend.
- gameData parts carry `isFluid` (critical: fluids can't be sunk) but **no sink point values** — those would need a parser change (`parsing/src/parts.ts`, `ParserPart`) plus a `dataVersion` bump.
- Statistics is a composable stack (`web/src/components/planner/Statistics.vue` + `Statistics*.vue` siblings, backed by `web/src/utils/statistics.ts`) — a new sink card slots in cleanly.
- The natural home for a per-part sink control is the satisfaction table (`PlannerFactorySatisfactionItems.vue`), which already has per-part chips, action buttons, and the surplus/shortage chip.

## Design

### 1. Auto-sink by default, per-part opt-out, priority-splitter semantics

The planner's standing assumption ("it is assumed you are sinking all these products") becomes an explicit, visible default rather than help text. Two persisted fields:

```ts
// Plan-level, on FactoryTab (same optional-with-default pattern as powerTarget):
autoSink?: boolean          // default true — every sinkable surplus is treated as sunk

// Per-part override, on Factory:
sinks: { [partId: string]: { mode: 'sink' | 'keep' } }
```

Effective disposition per part: `factory.sinks[partId]?.mode ?? (autoSink ? 'sink' : 'keep')`. So with auto-sink on (the norm), the only per-part interaction is **opting out** — "keep this as a legitimate surplus" — for parts deliberately not sunk (dimensional storage, buffers, whatever; we don't model *where* a kept surplus goes, on purpose). With auto-sink off, the same map opts individual parts *in*. One mechanism, both philosophies. The map-of-objects shape still leaves room for a future `mode: 'fixed', amount: n` without migration.

`autoSink` is surfaced as a toggle at the top of the plan (next to the power target — reuse the `usePowerTarget` composable pattern), and threads into the engine as a settings arg on `calculateFactories`/`calculateFactory` (default `{ autoSink: true }`).

**The display rule that makes auto-sink safe:** a sunk part's satisfaction chip must never hide the number. It reads **`0/min surplus (180/min sunk)`** — zero surplus, sunk amount in brackets — so plans don't degenerate into "no factory has any surplus anywhere" with the information gone. Kept parts show today's green surplus chip unchanged, and "Trim" is only offered on kept parts (sunk parts are deliberately overproducing — that's the point).

The sink itself is **"sink all surplus"** — dynamic, recomputed every recalc:

New `PartMetrics` fields, computed at the end of `calculatePartMetrics` (`parts.ts`):

```ts
amountRequiredSink: number   // = disposition==='sink' ? max(0, supplied − (production + exports + power)) : 0
```

`amountRequiredSink` joins the `amountRequired` sum, so a fully-sunk part lands at `amountRemaining === 0`, `satisfied: true`. This *is* the priority splitter: exports and internal consumption are real demand and always win; the sink only ever takes the leftover. Add an export request later and the sunk amount shrinks automatically. No iteration needed — it's a single deterministic max() after the other buckets are summed.

Consequences that fall out for free:
- `shouldShowFix` no longer reports `'surplus'` for sunk parts (remaining is 0) → no more "Trim" nagging on deliberately-overproducing factories. Exactly the "factory always running, always creating demand" pattern. Kept parts still get today's surplus/Trim treatment.
- `StatisticsItemsDifference.vue` (surplus/deficit chips) stops listing sunk parts — they're allocated now.
- End products (space elevator parts etc.) read as "fully allocated" automatically under auto-sink instead of dangling.

Guards (verified against Docs.json + wiki, 2026-07-21 — see appendix):
- **Fluids cannot be sunk *directly*** (the sink has no pipe input). Disable the toggle when `gameData.items.parts[partId].isFluid` — but the tooltip should say "Fluids can't be sunk directly — package them first", because **12 of 15 fluids have a sinkable Packaged variant**. The §3 "Divert to…" recipe picker covers this with zero special-casing: packaging recipes consume the fluid, so "Packaged Water" appears in the picker naturally, and the resulting packaged product (solid, positive sink points) takes the normal sink toggle. Note the packager chain creates real canister demand — sinking a packaged fluid *destroys* the canister (refunds only happen on unpackaging), so the ledger's ingredient demand for Empty Canisters/Fluid Tanks is correct, not an artifact.
- **Radioactive items cannot be sunk** (Uranium Waste and everything derived from it, except Plutonium Fuel Rods). Until phase 4 lands, hardcode the exclusion list in an engine constant (`NuclearWaste`, `PlutoniumWaste`, `NonFissibleUranium`, `PlutoniumPellet`, `PlutoniumCell`, `Ficsonium`, `FicsoniumFuelRod`); phase 4 replaces it with the data-derived rule `sinkable = !isFluid && sinkPoints > 0`, which Docs.json confirms encodes the radioactive exclusions *and* the Plutonium/Uranium Fuel Rod exceptions exactly.
- Raw-supplied parts (`isRaw`) — sinking raw inputs is nonsense; hide the toggle.

Persistence/migration: backfill `sinks: {}` per factory and leave `autoSink` absent (absent ⇒ true) in `app-store.ts#initFactories`, following the existing issue-numbered patch pattern; also backfill in `validation.ts`. Recommendation: **auto-sink defaults on for existing plans too** — it matches the long-standing "assumed you are sinking" help text, the bracket display means no information is lost, and opting out is one click; flagged as an open question. Plans sync as opaque JSON so the backend needs nothing.

### 2. Per-part UI: the "Sunk" affordance

In `PlannerFactorySatisfactionItems.vue`:
- On rows with a positive pre-sink surplus (and sinkable per the guards): a **disposition toggle** in the actions area — under auto-sink it reads "Keep surplus" (opt out: dimensional storage, buffers, deliberate reserve — destination not modelled); with auto-sink off it reads "Sink surplus" (opt in). Same control, same `factory.sinks` override; predicates live in `satisfaction.ts` — add `showSinkToggle`/`getPartDisposition`.
- Sunk rows: an amber/gold **"Sunk" chip** (AWESOME Sink is gold-themed; pick the semantic colour from `utils/colors.ts` — no new literal hexes) next to the existing Product/Byproduct/Recycled chips, a "Sunk: n/min" line in the satisfaction breakdown alongside Internal Consumption/Exports, and the satisfaction chip reading **`0/min surplus (n/min sunk)`** — the number is always visible.
- Kept rows: today's green surplus chip, unchanged.

On the collapsed factory card (`PlannerFactory.vue`), the per-product `(+n/min)` surplus annotation gains a sunk variant so collapsed view reads correctly.

### 3. Byproduct routing: opt out of recycling, declare the destination

Per-byproduct routing, persisted on `Factory`:

```ts
byProductRouting: {
  [byproductPartId: string]: {
    mode: 'recycle' | 'divert'                          // 'recycle' = today's behaviour (default)
    target?: 'sink' | 'export' | { productId: string }  // where a diverted byproduct goes
  }
}
```

**`mode: 'recycle'` (default)** — exactly today's netting; zero behaviour change for existing plans.

**`mode: 'divert'`** — the byproduct's supply is *excluded* from satisfying this factory's internal production/power demand for that part. Consequences in the ledger (`calculateParts`):

- Internal consumers (e.g. Alumina Solution's water) must be fed by raw/imports. For raw-backed parts like water, `amountSuppliedViaRaw` grows to cover the full internal demand — the planner now reports the *true* fresh-water requirement instead of the netted one. For non-raw parts, internal demand goes unsatisfied unless imported — which is correct: the player physically separated the streams.
- The diverted amount is attributed to its `target`: a sibling product's demand (Wet Concrete), exports, or the sink (which composes with §1's sink bucket). Any remainder is **unallocated** → warning.
- `showRecycledChip` only fires when `mode === 'recycle'` (and consumption exists, as today).

Worked example (the AL factory from the feedback): Scrap produces 120/min water byproduct; Alumina Solution consumes 180/min water. Today the planner nets: raw water 60/min, "Recycled" chip, no way out. With `divert → Wet Concrete (120/min water)`: raw water requirement reads 180/min (what the player actually pipes in), the byproduct line reads "→ Wet Concrete 120/min", and the concrete's surplus is auto-sunk by §1 (or kept, if the player opts out). Totals still balance; the *plan now matches the build*.

Implementation note: this is a supply-partition, not a second ledger. Suggested shape: a new `amountSuppliedViaProductionDiverted` (or equivalent) split out of `amountSuppliedViaProduction`, with the satisfaction check for internal demand using only non-diverted supply, and the diverted pool consumed in target → export → sink order. All in `parts.ts` + spec; the double-pass calc and dependency resolution are untouched (diverted-to-export parts stay `exportable` as today).

UI on the byproduct row in the satisfaction table — an **allocation breakdown** plus a routing control (compact `v-select` or chip-menu: Recycle / Divert to… / Sink / Export):

```
Water (byproduct)   120/min       [Diverted]
  → Wet Concrete        120/min
  → Unallocated           0/min
```

- **"Divert to sibling product" quick action** — issue #7's exact request: the "Divert to…" picker lists recipes that consume the part (filter `gameData.recipes` by ingredient via `game-data-store`). If no product using that recipe exists yet, selecting one adds it, sized to consume the byproduct (mirror `addShortageToFactory` in `satisfaction.ts`, which does the inverse). Fuel byproducts already have the +Generator path — keep both.
- **Unallocated byproduct warning (issue #119)**: when a byproduct ends with unallocated amount (diverted-with-remainder, or recycle-mode with surplus and no sink), flag a *warning* (new soft category — amber, not the red `hasProblem`): fluids get "will block your factory — divert, package, or export it"; solids get "sink it or it will back up". Suggested shape: `factory.hasWarnings` + per-part `warning` computed in `problems.ts`, painted in the satisfaction table and (later) the graph view.
- **Scope guard**: full arbitrary "this input goes here, this output goes there" pinning (a flow graph *inside* a factory) is out of scope — per-byproduct destination routing covers the AL case and every case raised in #7/#119 without turning the factory card into a graph editor. If a genuine need for input-side pinning emerges, it's a separate proposal.

### 4. Statistics: "Sunk products" section

New `StatisticsSinks.vue` card in the `Statistics.vue` stack (after Items Difference):
- Aggregate per part across all factories: part icon, name, total sunk/min, and which factories sink it (chips linking to the factory, same pattern as the Exports chips on factory cards).
- Header chip: total items/min sunk.
- Aggregation helper `calculateTotalSunk(factories)` in `utils/statistics.ts` beside `calculateTotalParts`.

**Sink points (deferred, phase 4):** points/min and "tickets/hr" need per-item `sinkPoints` in gameData — a parser change (`parsing/src/parts.ts` reads `mResourceSinkPoints` from Docs.json; hardcoded exception parts need manual values; parser must stay ~100% coverage), a new `gameData_v*.json`, and a `dataVersion` bump in `web/src/config/config.ts`. Worth doing, but it's a release-coupled data change — keep it out of the first PRs.

## Phasing (one branch/PR per phase — per our scope-per-session rule)

| Phase | Scope | Key files |
| --- | --- | --- |
| **1. Engine + auto-sink** | `FactoryTab.autoSink` + plan-header toggle, `Factory.sinks` overrides, `amountRequiredSink` in `PartMetrics`, settings arg through `calculateFactories`, migration patch, sinkable guards, keep/sink toggle, Sunk chip + `0 (n sunk)` display, `shouldShowFix` interaction, specs | `parts.ts` (+spec), `FactoryInterface.ts`, `factory.ts` (`newFactory`), `app-store.ts`, `validation.ts`, `satisfaction.ts` (+spec), `PlannerFactorySatisfactionItems.vue`, plan-header component (per `usePowerTarget` pattern) |
| **2. Statistics** | `StatisticsSinks.vue`, `calculateTotalSunk`, collapsed-card sunk annotation | `Statistics.vue`, `utils/statistics.ts` (+spec), `PlannerFactory.vue` |
| **3. Byproduct routing** | `Factory.byProductRouting` + migration, supply-partition in `calculateParts` (recycle opt-out), allocation breakdown + routing control on byproduct rows, "Divert to…" recipe picker, unallocated-byproduct warnings (#119) | `parts.ts` (+spec), `FactoryInterface.ts`, `app-store.ts`, `validation.ts`, `satisfaction.ts`, `problems.ts` (+spec), `PlannerFactorySatisfactionItems.vue`, new picker dialog component |
| **4. Sink points (optional)** | Parser `sinkPoints`, new gameData version, points/min in stats | `parsing/src/parts.ts` (+tests), `ParserPart.ts`, `config.ts`, `StatisticsSinks.vue` |

## Decisions (locked 2026-07-21)

- **Release target: Beta v0.6.** Not v0.5 — this is a massive behaviour change and needs its own properly-communicated release.
- **Auto-sink applies to existing plans too.** All plans load with `autoSink` on; users who don't want a part sunk uncheck it themselves ("that's their business"). The bracket display + the rollout banner below make this safe.

## Rollout & communication (Beta v0.6)

When this ships, a **dismissible banner** appears at the top of the planner:

> **Action needed** — Sinking is now possible in the planner. It has been assumed that you want to sink all surplus. Please review your plan and uncheck any surpluses that you don't want sunk, to show a legitimate surplus.

- Dismissal persisted (localStorage, per the `statisticsHidden` pattern) so it shows until acknowledged, once per user.
- Also gets a splash slide + `CHANGELOG.md` entry, per the Beta v0.5 release convention (see the v0.5 splash/changelog commit for the pattern).
- The banner ships in phase 1 alongside the default-on behaviour — they must land in the same release.

## Open questions

1. **Fixed-amount sinking?** Phase 1 is surplus-only ("sink whatever's left"). Issue #46's thread floated entering explicit quantities ("allocated surplus"). The `{ mode }` shape leaves room; recommend deferring until someone asks.
2. **Single divert target or multi-split?** §3 gives a diverted byproduct one target, with the remainder overflowing to export → sink → unallocated automatically. A multi-way split UI ("60 to concrete, 60 to export") is expressible later by widening `target` to an array, but the single-target + overflow model covers the AL case; recommend starting there.
3. **Partial recycling?** `mode` is binary. A player recycling *some* water and diverting the rest would need `divert` + a sibling Alumina product… which is really the multi-split question again. Same answer: defer, shape allows it.
4. **Wording** — "Sunk" vs "Allocated/Stored" for end products going to space elevator/storage? #254's thread leaned "sunk covers it"; dimensional storage users may quibble. Single word "Sunk" recommended; tooltip can say "sunk or otherwise consumed".

## Appendix: fluid sinkability (verified 2026-07-21)

Sources: `parsing/game-docs.json` (`mResourceSinkPoints`, `mForm`), packaging recipes in `gameData_v1.2-04.json`, cross-checked against the [AWESOME Sink wiki page](https://satisfactory.wiki.gg/wiki/AWESOME_Sink) (point values match Docs.json exactly; only radioactive items are excluded, not packaged fluids). Caveat: sinkability of packaged fluids is wiki-verified, not tested in-game by us.

| Fluid | Packaged variant | Sink pts | Container consumed |
| --- | --- | --- | --- |
| Water | Packaged Water | 130 | Empty Canister (60 pts) |
| Crude Oil | Packaged Oil | 180 | Empty Canister |
| Heavy Oil Residue | Packaged Heavy Oil Residue | 180 | Empty Canister |
| Fuel | Packaged Fuel | 270 | Empty Canister |
| Liquid Biofuel | Packaged Liquid Biofuel | 370 | Empty Canister |
| Turbofuel | Packaged Turbofuel | 570 | Empty Canister |
| Alumina Solution | Packaged Alumina Solution | 160 | Empty Canister |
| Sulfuric Acid | Packaged Sulfuric Acid | 152 | Empty Canister |
| Nitric Acid | Packaged Nitric Acid | 412 | Empty Canister |
| Nitrogen Gas | Packaged Nitrogen Gas | 312 | Empty Fluid Tank (170 pts) |
| Rocket Fuel | Packaged Rocket Fuel | 1,028 | Empty Fluid Tank |
| Ionized Fuel | Packaged Ionized Fuel | 5,246 | Empty Fluid Tank |
| Dissolved Silica | — none | n/a | cannot be packaged or sunk |
| Excited Photonic Matter | — none | n/a | cannot be packaged or sunk |
| Dark Matter Residue | — none | n/a | cannot be packaged or sunk |

Radioactive exclusions (0 sink points in Docs.json — unsinkable): Uranium Waste, Plutonium Waste, Non-Fissile Uranium, Plutonium Pellet, Encased Plutonium Cell, Ficsonium, Ficsonium Fuel Rod. Sinkable exceptions with positive points: Uranium (35), Encased Uranium Cell (147), Uranium Fuel Rod (43,468), Plutonium Fuel Rod (153,184).

## Verification

- Engine: co-located Vitest specs — `parts.spec.ts` (sink bucket math: surplus fully sunk → remaining 0/satisfied; export added → sunk shrinks; fluid/raw guards; divert mode: raw requirement grows to full internal demand, non-raw internal demand unsatisfied without imports, diverted pool consumed target → export → sink), `problems.spec.ts` (warning states), `satisfaction.spec.ts` (chip predicates incl. Recycled only in recycle mode). The existing water-recycling fixture `243-water-recycling.spec.ts` must pass unchanged in default mode and is the natural base for divert-mode cases. Run `cd web && pnpm exec vitest run factory-management`.
- Real-plan regression: `maels-big-boi-plan.ts` fixture through `calculateFactories` — no behaviour change with `sinks: {}` empty.
- Browser: `/verify` skill — build the AL factory from the feedback: Scrap → water byproduct, set routing to "Divert to… Wet Concrete", confirm raw water shows the full un-netted requirement and the Recycled chip is gone, sink the concrete surplus, confirm Sunk chip + statistics card and that Trim no longer appears. Check migration by loading a pre-change localStorage plan (routing defaults to recycle, behaviour identical).
- `pnpm lint` + `vue-tsc` via build.
