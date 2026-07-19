# The calculation engine

Everything below lives in `web/src/utils/factory-management/` with types in `web/src/interfaces/planner/FactoryInterface.ts`. The engine is plain TypeScript with no Vue dependencies (game data is passed in as a parameter), which is why it is so heavily unit-tested — each module has a co-located `.spec.ts`.

## The Factory object

```ts
interface Factory {
  id: number
  name: string
  inputs: FactoryInput[]              // imports from other factories: {factoryId, outputPart, amount}
  previousInputs: FactoryInput[]      // prior snapshot, used during recalculation
  products: FactoryItem[]             // recipes at chosen output rates
  byProducts: ByProductItem[]         // secondary recipe outputs
  powerProducers: FactoryPowerProducer[]
  parts: { [part: string]: PartMetrics }   // THE supply/demand ledger — the heart
  buildingRequirements: { [building: string]: BuildingRequirement }
  requirementsSatisfied: boolean      // every ledger entry satisfied?
  dependencies: FactoryDependency     // requests other factories make OF this one
  exportCalculator: {...}             // train/truck/drone transport math settings
  rawResources: {...}                 // raw parts assumed handled by the player
  power: FactoryPower                 // {consumed, produced, difference}
  hasProblem: boolean                 // aggregate flag the UI paints red
  inSync: boolean | null              // sync-with-game state (null = never synced)
  syncState / syncStatePower          // the per-product / per-generator snapshots
  hidden, displayOrder, tasks, notes, dataVersion
}
```

## The parts ledger (`PartMetrics`)

Every part a factory touches gets one entry. Satisfaction is decided here and nowhere else:

- Demand: `amountRequired` = `amountRequiredProduction` (internal recipe ingredients) + `amountRequiredExports` (other factories' requests) + `amountRequiredPower` (generator fuel).
- Supply: `amountSupplied` = `amountSuppliedViaInput` (imports) + `amountSuppliedViaProduction` (own products/byproducts, incl. generator waste) + `amountSuppliedViaRaw` (raw resources are treated as always available — the player handles miners themselves).
- Verdict: `amountRemaining = supplied − required`; `satisfied = amountRemaining >= 0`. `exportable` marks parts other factories may import.

## The recalculation pipeline

`calculateFactories(factories, gameData)` in `factory.ts` is the global entry point. It runs **every factory twice**: pass 1 (`loadMode`) populates part metrics so that pass 2 can judge dependency validity — you can't know whether an import is legitimate until the producer's ledger exists. In between, `calculateAllDependencies` rebuilds the dependency tree and drops invalid inputs. It ends by emitting `calculationsCompleted` on the event bus.

`calculateFactory(factory, allFactories, gameData, modes)` is the per-factory pipeline, and its **order is load-bearing**:

1. `flushInvalidRequests` — drop dependency requests/inputs whose other side no longer exists.
2. Reset `rawResources` and `parts` (the ledger is rebuilt from scratch every time).
3. `calculateProducts` — recipe math: ingredient demand and byproducts, scaled by `amount / recipe.products[0].perMin`.
4. `calculateSyncState` — detect drift from the in-game snapshot.
5. `calculatePowerProducers` — solve generators (see below).
6. `calculateFactoryBuildingsAndPower` — building counts and power draw.
7. `calculateFactoryDependencies` + `calculateDependencyMetrics` — register this factory's imports on the producers; aggregate request totals.
8. `calculateParts` — fill the ledger, set `requirementsSatisfied`.
9. `calculateDependencyMetricsSupply` — now that supply is known, finalize `isRequestSatisfied` / `difference` per requested part.
10. Building-group sync (`syncBuildingGroups`, `checkForItemUpdate`) then a second `calculatePowerProducers` + `calculateFinalBuildingsAndPower` (groups can change power).
11. `calculateHasProblem` for **all** factories, then emit `factoryUpdated`.

`modes` matters: `{ loadMode }` suppresses input-nuking during the first pass; `{ origin: 'buildingGroup' }` and `{ forceRebalance }` control building-group rebalancing (see [building-groups.md](./building-groups.md)).

## Inter-factory dependencies

The link is stored on **both** sides: the consumer holds a `FactoryInput {factoryId, outputPart, amount}`; `updateDependency` mirrors it into the producer's `dependencies.requests[consumerId]` as a `FactoryDependencyRequest`. Producer-side, requests become `amountRequiredExports` in the ledger; consumer-side, the same amounts become `amountSuppliedViaInput`. `dependencies.metrics[part]` records `{request, supply, difference, isRequestSatisfied}` — the cross-factory bottleneck signal.

`hasProblem` (problems.ts) is true when internal requirements aren't satisfied, any dependency request isn't satisfied, or any product's building groups have a problem.

Integrity helpers: `flushInvalidRequests`, `deleteRequestPair`, `deleteInputPair`, `removeFactoryDependants` (on factory deletion) — all recalculate both affected factories. Import discovery for the UI (`calculatePossibleImports`, `calculateImportCandidates`, `isImportRedundant`) lives in `inputs.ts`.

## Power producers

`FactoryPowerProducer` keeps both what the user asked for (`buildingAmount`, `powerAmount`, `fuelAmount`) and what was computed, plus `updated: 'building' | 'fuel' | 'power' | 'ingredient'` recording **which field the user last edited** — `calculatePowerProducers` (power.ts) picks the corresponding solver (`updateViaBuilding` / `updateViaFuel` / `updateViaPower` / `updateViaIngredient`) and derives the rest. Fuel consumption feeds `amountRequiredPower` in the ledger; byproducts (e.g. nuclear waste) feed supply.

## Sync state

`setSyncState(factory)` snapshots products (`{amount, recipe}`) and generators into `syncState`/`syncStatePower` and sets `inSync = true` — meaning "this is what I actually built in-game." `checkFactorySyncState` only ever flips `true → false` (it never re-syncs automatically): any change to product amount/recipe, generator building count/recipe/power/fuel, or item counts drops the factory out of sync. `inSync === null` means the factory has never been synced.

## Game data and formulas worth knowing

- Game data is loaded via `web/src/utils/gameDataService.ts` (dev: `http://localhost:3001/gameData.json`; prod: `/gameData_v{dataVersion}.json`) or the `game-data-store` Pinia store. Accessors like `getRecipe`/`getPowerRecipe` live in `common.ts`; `getPowerRecipe` deep-clones so calculations never mutate source data.
- Buildings needed for a product: `amount / recipe.perMin` (fractional; building groups make this concrete).
- Overclock power formula (consumers): `power × (clock/100)^1.321928` — the real game formula. Power **producers** scale linearly.
- Floating-point noise is routinely clamped with `formatNumberFully` / `Math.round(x*1000)/1000`.

## Validation and migration of saved data

- `validation.ts` (`validateFactories`) sanitizes loaded plans: clamps non-positive amounts, drops inputs/dependencies pointing at missing factories, backfills missing ledger entries, alerts the user if it fixed anything.
- `app-store.ts#initFactories` is the migration entry point: a series of issue-numbered patches (e.g. `#222` sync defaults, `#180` power producers, `#11` building groups + `ingredientAmount → fuelAmount` rename) that backfill fields on old saves and stamp `factory.dataVersion`. New migrations follow this same pattern: guard on missing field, patch, set `needsCalculation`.
