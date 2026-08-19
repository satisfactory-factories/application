/**
 * disposal.ts — where a part's surplus goes.
 *
 * A surplus has exactly three destinations, and until now the planner could only draw one of them:
 *
 * 1. **Another factory.** Exports, which the dependency pass has always modelled.
 * 2. **The Dimensional Depot.** Finite storage. It fills up, and then it backs up like any other
 *    container — so it defers a backlog rather than preventing one, and it deliberately changes no
 *    number in the ledger.
 * 3. **An AWESOME Sink.** Genuine disposal. Whatever is left goes in and does not come back, which
 *    is why this is the only destination that lands a surplus at zero.
 *
 * Both are counts of buildings rather than booleans, because both are things the player has to go
 * and build: the depot count is what the Mercer Sphere total is derived from, and the sink count is
 * what its 30 MW apiece is derived from.
 *
 * This module must stay a LEAF — `parts.ts` and `status.ts` both read it, and `status.ts` is
 * reached from `factory.ts` via `problems.ts`. It imports the interface and nothing else.
 */
import { Factory, FactoryPartDisposal } from '@/interfaces/planner/FactoryInterface'

/**
 * Mercer Spheres per Dimensional Depot Uploader.
 *
 * Read off the game's own build recipe rather than a wiki page: `Recipe_CentralStorage_C` in
 * Docs.json costs 1 Mercer Sphere (`Desc_WAT2`), 10 SAM Fluctuator, 10 Modular Frame and 100 Wire.
 * Only the sphere is tracked here — the other three are ordinary parts a plan can produce, and
 * counting them as plan demand would be a different feature.
 */
export const MERCER_SPHERES_PER_DEPOT = 1

/**
 * What one Uploader can actually push into the Depot, items/min, with every upload-speed research
 * bought. It starts at 15/min and doubles four times (15 → 30 → 60 → 120 → 240).
 *
 * Not used to cap anything in the ledger — the depot deliberately changes no number, because it is
 * finite storage and a rate cap would imply the surplus is handled. It is here so the statistics
 * table can say whether the containers the user has placed could keep up if they were.
 *
 * Source: https://satisfactory.wiki.gg/wiki/Dimensional_Depot_Uploader
 */
export const DEPOT_UPLOAD_RATE_PER_MIN = 240

/**
 * Mercer Spheres the whole depot chain in the MAM costs, once, for the save: 1 Mercer Sphere
 * Analysis + 1 Dimensional Depot + 3 Manual Depot Uploader + 46 across the four upload-speed
 * upgrades + 46 across the four depot expansions.
 *
 * The figure a PLAN depends on is smaller and depends on its tier — see `mercerSpheresForTier`,
 * which counts the two unlocks and the upload upgrades and nothing else, because the planner
 * models neither depot storage nor manual uploads. This constant is the ceiling, for the caption
 * that tells a user what finishing the chain costs.
 */
export const DEPOT_RESEARCH_MERCER_SPHERES = 97

// `Build_ResourceSink_C.mPowerConsumption` in Docs.json. Flat: the sink has no clock, so this does
// not scale or swing the way a production building's draw does.
export const SINK_POWER_MW = 30

const NONE: FactoryPartDisposal = { sinks: 0, depots: 0 }

// Always returns a record, so callers never branch on the map being absent on an older plan.
// Frozen-by-convention: callers must go through setSinkCount/setDepotCount to write.
export const getDisposal = (factory: Factory, partId: string): FactoryPartDisposal =>
  factory.partDisposal?.[partId] ?? NONE

export const getSinkCount = (factory: Factory, partId: string): number =>
  getDisposal(factory, partId).sinks

export const getDepotCount = (factory: Factory, partId: string): number =>
  getDisposal(factory, partId).depots

// Whether the surplus of this part is being sunk at all. Says nothing about whether the sink would
// actually take it — that is `PartMetrics.isSinkable`, and the engine tests both.
export const isSunk = (factory: Factory, partId: string): boolean =>
  getSinkCount(factory, partId) > 0

export const isDepoted = (factory: Factory, partId: string): boolean =>
  getDepotCount(factory, partId) > 0

// Negative and non-finite counts are floored to zero rather than rejected: every control that
// writes these can emit null (a cleared field) or a negative (a spinner stepped past its minimum),
// and a NaN reaching the ledger would make the sink bucket NaN and the part unsatisfiable.
const clean = (count: unknown): number => {
  const value = Number(count)
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.floor(value)
}

const write = (factory: Factory, partId: string, field: keyof FactoryPartDisposal, count: unknown): void => {
  if (!partId) return

  const value = clean(count)
  const existing = factory.partDisposal?.[partId]

  if (!existing) {
    if (value === 0) return // Nothing set and nothing to set: don't create an empty record.
    factory.partDisposal ??= {}
    factory.partDisposal[partId] = { ...NONE, [field]: value }
    return
  }

  existing[field] = value

  // Drop the record once it says nothing, so a plan that has had counts set and cleared saves the
  // same as one that never had them.
  if (existing.sinks === 0 && existing.depots === 0) {
    delete factory.partDisposal?.[partId]
  }
}

export const setSinkCount = (factory: Factory, partId: string, count: unknown): void =>
  write(factory, partId, 'sinks', count)

export const setDepotCount = (factory: Factory, partId: string, count: unknown): void =>
  write(factory, partId, 'depots', count)

// Only counts entries whose part is still in the factory. The map is sticky on purpose, so a plan
// that has been reworked can carry counts for parts it no longer makes; charging the user Mercer
// Spheres or megawatts for those would be wrong.
const totalFor = (factory: Factory, field: keyof FactoryPartDisposal): number => {
  let total = 0
  for (const [partId, disposal] of Object.entries(factory.partDisposal ?? {})) {
    if (!factory.parts?.[partId]) continue
    total += disposal[field] ?? 0
  }
  return total
}

export const getFactorySinks = (factory: Factory): number => totalFor(factory, 'sinks')

export const getFactoryDepots = (factory: Factory): number => totalFor(factory, 'depots')

export const getFactoryMercerSpheres = (factory: Factory): number =>
  getFactoryDepots(factory) * MERCER_SPHERES_PER_DEPOT

// What the sinks in this factory draw from the grid.
export const getFactorySinkPower = (factory: Factory): number =>
  getFactorySinks(factory) * SINK_POWER_MW
