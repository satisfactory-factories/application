import { Factory } from '@/interfaces/planner/FactoryInterface'
import {
  getPartDisplayName,
  hasMetricsForPart,
} from '@/utils/helpers'
import { getTotalSomersloops } from '@/utils/factory-management/building-groups/somersloops'
import { getTotalPowerShards } from '@/utils/factory-management/building-groups/common'
import {
  getDepotCount,
  getFactoryMercerSpheres,
  MERCER_SPHERES_PER_DEPOT,
} from '@/utils/factory-management/disposal'
import { DEFAULT_DEPOT_TIER, depotRateForTier } from '@/composables/useDepotResearch'
export interface BuildingTotal {
  name: string
  totalAmount: number
  // Where they are, in plan order. A plan-wide count says how many to build without saying
  // where any of them go.
  sources: FactoryContribution[]
}

// This function calculates the total number of buildings for each type
export const calculateTotalBuildingsByType = (factories: Factory[]): BuildingTotal[] => {
  const buildings: Record<string, BuildingTotal> = {}

  factories.forEach(factory => {
    Object.entries(factory.buildingRequirements).forEach(
      ([key, requirement]) => {
        // A requirement can sit at zero once its products are removed; it is not a building.
        if (requirement.amount <= 0) {
          return
        }

        const entry = buildings[key] ??= {
          name: requirement.name,
          totalAmount: 0,
          sources: [],
        }

        entry.totalAmount += requirement.amount
        entry.sources.push({
          id: factory.id,
          name: factory.name,
          icon: factory.icon,
          amount: requirement.amount,
        })
      }
    )
  })
  // Return sorted array of buildings
  return Object.values(buildings).sort((a, b) =>
    a.name.localeCompare(b.name)
  )
}

/**
 * What the plan takes out of the world, summed per resource.
 *
 * Read off the products a factory makes, not off `factory.rawResources`. That map is what the
 * planner filled in while it still ASSUMED raw supply — v0.6 removed the assumption, so it is
 * empty in any plan that mines properly, and this panel went blank for exactly the plans that
 * do the right thing. A raw resource reaching a plan now is a product like any other; it is the
 * part being raw, not the way it arrived, that makes it belong here.
 */
/**
 * One factory's share of a plan-wide figure, so a statistics row can say where a number came
 * from and be clicked through to it. A total on its own reports a problem without saying where
 * to go and fix it.
 */
export interface FactoryContribution {
  id: number
  name: string
  icon?: string
  amount: number
}

// Below this a figure is float noise from a reverse-solve rather than a real contribution.
const CONTRIBUTION_EPSILON = 0.001

export interface RawResourceTotal {
  id: string
  totalAmount: number
  // Who digs it up, in plan order. One resource routinely comes from several places — the demo
  // plan's water is pumped in one factory and its copper mined in another.
  sources: FactoryContribution[]
}

export const calculateTotalRawResources = (factories: Factory[]): RawResourceTotal[] => {
  const rawResources: Record<string, RawResourceTotal> = {}

  factories.forEach(factory => {
    factory.products.forEach(product => {
      // isRaw is decided by the game data during the parts pass, so an extractor, a resource
      // well and anything else that outputs a node resource all count without listing recipes.
      if (!factory.parts[product.id]?.isRaw) {
        return
      }

      const entry = rawResources[product.id] ??= { id: product.id, totalAmount: 0, sources: [] }
      entry.totalAmount += product.amount

      // A factory can hold more than one product of the same resource — two node purities split
      // across separate products, say — and it is still one place to go.
      const source = entry.sources.find(candidate => candidate.id === factory.id)
      if (source) {
        source.amount += product.amount
      } else {
        entry.sources.push({ id: factory.id, name: factory.name, icon: factory.icon, amount: product.amount })
      }
    })
  })

  // Convert the object to an array and sort it alphabetically by display name
  return Object.values(rawResources).sort((a, b) =>
    getPartDisplayName(a.id).localeCompare(getPartDisplayName(b.id))
  )
}

export interface PartTotal {
  id: string
  amountRequired: number
  amountSupplied: number
  amountRemaining: number
  satisfied: boolean
  isRaw: boolean
  // Where this part comes from, and who is short of it, in plan order.
  //
  // A factory appears if it PRODUCES the part — carrying what it makes — or if it is short of it,
  // carrying the shortfall. Keyed off production rather than off the balance alone, because a
  // factory making exactly what it ships has a balance of zero: listing only imbalances left
  // every item that adds up with nothing at all against it, which is most of a finished plan.
  sources: FactoryContribution[]
}

export const calculateTotalParts = (factories: Factory[]): PartTotal[] => {
  const parts: Record<string, PartTotal> = {}

  factories.forEach(factory => {
    Object.entries(factory.parts).forEach(([partId, partData]) => {
      if (!parts[partId]) {
        parts[partId] = {
          id: partId,
          amountRequired: 0,
          amountSupplied: 0,
          amountRemaining: 0,
          satisfied: true,
          isRaw: partData.isRaw,
          sources: [],
        }
      }

      // Aggregate metrics
      parts[partId].amountRequired += partData.amountRequired
      parts[partId].amountSupplied += partData.amountSuppliedViaProduction
      parts[partId].amountRemaining += partData.amountRemaining
      parts[partId].satisfied &&= partData.satisfied // Combine satisfaction status

      // What this factory has to say about the part: what it makes of it, or what it is short of.
      // A factory that only imports it and consumes the lot says neither, and listing those would
      // bury the ones that do.
      const produced = partData.amountSuppliedViaProduction
      const amount = produced > CONTRIBUTION_EPSILON
        ? produced
        : (partData.amountRemaining < -CONTRIBUTION_EPSILON ? partData.amountRemaining : 0)

      if (amount !== 0) {
        parts[partId].sources.push({
          id: factory.id,
          name: factory.name,
          icon: factory.icon,
          amount,
        })
      }
    })
  })

  // Convert to array and return sorted by part name
  return Object.values(parts).sort((a, b) => getPartDisplayName(a.id).localeCompare(getPartDisplayName(b.id)))
}

export const calculateTotalProducedItems = (factories: Factory[]) => {
  const products: Record<
    string,
    { id: string, name: string; totalAmount: number; totalDifference: number }
  > = {}

  factories.forEach(factory => {
    factory.products.forEach(product => {
      if (!products[product.id]) {
        products[product.id] = {
          id: product.id,
          name: getPartDisplayName(product.id) ?? product.id,
          totalAmount: 0,
          totalDifference: 0,
        }
      }

      // Accumulate the product amount
      products[product.id].totalAmount += product.amount

      // Add the difference if metrics exist
      if (hasMetricsForPart(factory, product.id)) {
        const difference =
          factory.dependencies.metrics[product.id]?.difference ?? 0
        products[product.id].totalDifference += difference
      }
    })
  })

  // Convert the object to an array and sort it alphabetically by display name
  return Object.values(products).sort((a, b) =>
    a.name.localeCompare(b.name)
  )
}

export const calculateProducedItemsDifference = (factories: Factory[]) => {
  const differences: Record<string, { id: string, name: string; totalDifference: number }> =
    {}

  factories.forEach(factory => {
    Object.entries(factory.dependencies.metrics).forEach(([partId, metric]) => {
      if (metric.difference !== 0) {
        if (!differences[partId]) {
          differences[partId] = {
            id: partId,
            name: getPartDisplayName(partId) ?? partId,
            totalDifference: 0,
          }
        }
        // Accumulate the difference
        differences[partId].totalDifference += metric.difference
      }
    })
  })

  return Object.values(differences).sort((a, b) =>
    a.name.localeCompare(b.name)
  )
}

// Total Power Shards a factory needs across all its building groups (products + power
// producers).
export const getFactoryPowerShards = (factory: Factory): number => {
  let total = 0
  for (const product of factory.products) {
    total += getTotalPowerShards(product.buildingGroups)
  }
  for (const producer of factory.powerProducers) {
    total += getTotalPowerShards(producer.buildingGroups)
  }
  return total
}

// Total Somersloops a factory consumes across all its building groups, including
// build costs (e.g. 10 per Alien Power Augmenter).
export const getFactorySomersloops = (factory: Factory): number => {
  let total = 0
  for (const product of factory.products) {
    total += getTotalSomersloops(product.buildingGroups, product.buildingRequirements?.name)
  }
  for (const producer of factory.powerProducers) {
    total += getTotalSomersloops(producer.buildingGroups, producer.building)
  }
  return total
}

/**
 * One factory's contribution to a depoted item: how many Uploaders it has on the part, and how much
 * of the part it actually has spare to feed them.
 */
export interface DimensionalDepotSource extends FactoryContribution {
  containers: number
}

export interface DimensionalDepotEntry {
  id: string
  // Uploaders across the whole plan for this item.
  totalContainers: number
  // What the plan actually has spare to upload, items/min.
  totalAmount: number
  // What those Uploaders can carry between them at the plan's researched upload speed. Below
  // totalAmount means the depot cannot keep up and the remainder still backs up.
  uploadCapacity: number
  // Every factory has the flag set but none of them has anything spare, so nothing reaches the
  // depot at all. Worth its own field: each factory looks fine on its own, and the fact only
  // becomes visible once they are added up.
  starved: boolean
  sources: DimensionalDepotSource[]
}

/**
 * What the plan sends to the Dimensional Depot, per item.
 *
 * Reads the surplus rather than production, for the same reason the toggle is offered on surplus:
 * a logistics factory that imports everything and uploads the overflow is a real build, and asking
 * "does this factory make the part" would exclude exactly that case.
 *
 * A contributor with nothing spare is KEPT rather than filtered out. It is the whole point of the
 * starved warning — a row listing three factories, all at zero, is a user who has flagged an item
 * for the depot everywhere and is feeding it nowhere.
 */
export const calculateDimensionalDepot = (
  factories: Factory[],
  // Items/min one Uploader can move at the plan's MAM research level. Passed in rather than read
  // from the store so this stays a pure function of the plan, which is what its spec relies on.
  uploadRatePerMin: number = depotRateForTier(DEFAULT_DEPOT_TIER),
): DimensionalDepotEntry[] => {
  const items: Record<string, DimensionalDepotEntry> = {}

  factories.forEach(factory => {
    Object.keys(factory.partDisposal ?? {}).forEach(partId => {
      const containers = getDepotCount(factory, partId)
      if (containers <= 0) return

      // The disposal map is sticky, so it can name a part the factory no longer handles. A stale
      // key is inert rather than an error: the user's intent is preserved if the part comes back.
      const part = factory.parts[partId]
      if (!part) return

      const entry = items[partId] ??= {
        id: partId,
        totalContainers: 0,
        totalAmount: 0,
        uploadCapacity: 0,
        starved: false,
        sources: [],
      }

      // Sunk parts land at zero remaining, so the pre-sink figure is what the depot would see if
      // the sink were not there. Falls back to amountRemaining for a plan saved before the field.
      const spare = Math.max(0, part.amountRemainingPreSink ?? part.amountRemaining ?? 0)

      entry.totalContainers += containers
      entry.totalAmount += spare
      entry.sources.push({
        id: factory.id,
        name: factory.name,
        icon: factory.icon,
        amount: spare,
        containers,
      })
    })
  })

  return Object.values(items)
    .map(entry => ({
      ...entry,
      uploadCapacity: entry.totalContainers * uploadRatePerMin,
      starved: entry.totalAmount <= 0,
    }))
    .sort((a, b) => getPartDisplayName(a.id).localeCompare(getPartDisplayName(b.id)))
}

// Mercer Spheres the plan's Dimensional Depot Uploaders cost to build, one apiece. The MAM research
// is deliberately excluded — see DEPOT_RESEARCH_MERCER_SPHERES.
export const getFactoryMercerSpheresUsed = (factory: Factory): number => getFactoryMercerSpheres(factory)

export const calculateTotalMercerSpheres = (factories: Factory[]): number =>
  factories.reduce((total, factory) => total + getFactoryMercerSpheres(factory), 0)

// Re-exported so components reference one definition rather than restating "one per uploader".
export { MERCER_SPHERES_PER_DEPOT }

// Per-factory usage list for the statistics summary — only factories actually using any.
export const calculateFactoriesUsing = (
  factories: Factory[],
  getAmount: (factory: Factory) => number,
) => factories
  .map(factory => ({ factory, amount: getAmount(factory) }))
  .filter(entry => entry.amount > 0)

// Sums the per-factory power figures (which are derived from the building groups, so they
// account for overclocking and somersloops). Peak differs from consumed only when
// variable-power buildings (Particle Accelerator etc.) are present. The circuit boost
// (Alien Power Augmenters) is part of total generation, matching the in-game power graph.
export interface FactoryPower {
  factory: Factory
  produced: number
  consumed: number
  difference: number
}

/**
 * Power per factory, heaviest net drain first.
 *
 * Deliberately ordered by cost rather than by the plan's own display order: the factory worth
 * looking at is the one costing the most, and display order buries it wherever it happens to sit.
 */
export const calculateFactoryPower = (factories: Factory[]): FactoryPower[] =>
  factories
    .map(factory => {
      const totals = calculateTotalPower([factory])
      return {
        factory,
        produced: totals.totalPowerProduced,
        consumed: totals.totalPowerConsumed,
        difference: totals.totalPowerDifference,
      }
    })
    .sort((a, b) => a.difference - b.difference || a.factory.name.localeCompare(b.factory.name))

export const calculateTotalPower = (factories: Factory[]) => {
  let totalPowerConsumed = 0
  let totalPowerConsumedMin = 0
  let totalPowerConsumedMax = 0
  let totalBasePower = 0
  let totalBasePowerMin = 0
  let totalBasePowerMax = 0
  let totalPowerBoost = 0
  let totalBoostPercent = 0
  let totalBoostFueled = 0
  let totalBoostUnfueled = 0

  factories.forEach(factory => {
    const consumed = factory.power?.consumed ?? 0
    const produced = factory.power?.produced ?? 0
    totalPowerConsumed += consumed
    totalPowerConsumedMin += factory.power?.consumedMin ?? consumed
    totalPowerConsumedMax += factory.power?.consumedMax ?? consumed
    totalBasePower += produced
    totalBasePowerMin += factory.power?.producedMin ?? produced
    totalBasePowerMax += factory.power?.producedMax ?? produced
    totalPowerBoost += factory.power?.boostMw ?? 0
    totalBoostPercent += factory.power?.boostPercent ?? 0
    totalBoostFueled += factory.power?.boostFueledBuildings ?? 0
    totalBoostUnfueled += factory.power?.boostUnfueledBuildings ?? 0
  })

  // The circuit boost is a percentage of whatever the grid is generating, so it swings
  // with the variable generators.
  const totalPowerBoostMin = totalBoostPercent * totalBasePowerMin
  const totalPowerBoostMax = totalBoostPercent * totalBasePowerMax

  const totalPowerProduced = totalBasePower + totalPowerBoost
  const totalPowerProducedMin = totalBasePowerMin + totalPowerBoostMin
  const totalPowerProducedMax = totalBasePowerMax + totalPowerBoostMax
  const totalPowerDifference = totalPowerProduced - totalPowerConsumed

  return {
    totalPowerConsumed,
    totalPowerConsumedMin,
    totalPowerConsumedMax,
    totalBasePower,
    totalBasePowerMin,
    totalBasePowerMax,
    totalPowerBoost,
    totalPowerBoostMin,
    totalPowerBoostMax,
    totalBoostPercent,
    totalBoostFueled,
    totalBoostUnfueled,
    totalPowerProduced,
    totalPowerProducedMin,
    totalPowerProducedMax,
    totalPowerDifference,
  }
}
