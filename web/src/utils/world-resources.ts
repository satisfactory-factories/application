/**
 * What the map itself can supply, and how close a plan is to taking all of it.
 *
 * A plan can balance perfectly and still be unbuildable: the satisfaction maths only ever asks
 * whether a factory's inputs add up, never whether the ground holds enough of the resource to
 * begin with. Ask a mine for 9,000 Crude Oil a minute and the planner will happily solve it,
 * because nothing in the calculation engine knows the world has 5,040.
 *
 * Two ceilings matter, and they say different things:
 *   - every node worked by the best extractor at 100% — what a plan costs in nodes alone
 *   - the same at the 250% clock cap — the hard wall, past which the resource does not exist
 *
 * Node counts are map facts and cannot be derived from the game data, so they are held here.
 * Everything else — extractor marks, rates, purity multipliers, well satellite rates — comes
 * from the parsed game data, so a game update moves the numbers without touching this file.
 */

import { NodePurity } from '@/interfaces/Recipes'
import { BuildingGroup, Factory } from '@/interfaces/planner/FactoryInterface'
import {
  getExtraction,
  getExtractionRecipeForPart,
  getGroupPurity,
  getGroupSatellites,
  isWellRecipe,
  PURITY_MULTIPLIERS,
} from '@/utils/factory-management/building-groups/extraction'
import { MAX_CLOCK_PERCENT } from '@/utils/factory-management/building-groups/common'
import { calculateTotalRawResources } from '@/utils/statistics'
import { fetchGameData } from '@/utils/gameDataService'

const gameData = await fetchGameData()

export interface NodeCounts { impure: number, normal: number, pure: number }

export interface WorldResourceNodes {
  // Nodes an extractor is placed directly on.
  nodes?: NodeCounts
  // Satellite micro-nodes inside resource wells, each taking one (unpowered) satellite extractor.
  wells?: NodeCounts
  // Drawn from any body of water rather than from nodes, so nothing on the map limits it.
  unlimited?: boolean
}

/**
 * Every node on the vanilla 1.0+ map, by purity.
 *
 * These are counts of the physical nodes, NOT rates: multiplying them by the game data's own
 * extractor rates reproduces the `limit` the parser reads out of the game for each resource,
 * which the spec asserts. Anything randomised or multiplied by Advanced Game Settings is a
 * different world and out of scope — the warning is a floor, not a promise.
 *
 * The limit is only half a constraint, though: several splits of a resource reproduce the same
 * rate, so the spec also asserts the node totals, which are counted objects in a save file rather
 * than a published figure (459 solid and oil nodes, 118 well satellites). That is what caught
 * Limestone: it was entered here as 15/51/29, which reproduced the parser's stated limit but put
 * 95 nodes on a map that holds 94. The limit was the wrong one — the parser had 69,900 for a
 * resource the game extracts 69,300 of — so both were corrected rather than either trusted.
 */
export const WORLD_RESOURCE_NODES: Record<string, WorldResourceNodes> = {
  OreIron: { nodes: { impure: 39, normal: 42, pure: 46 } },
  OreCopper: { nodes: { impure: 13, normal: 29, pure: 13 } },
  Stone: { nodes: { impure: 15, normal: 50, pure: 29 } },
  OreGold: { nodes: { impure: 0, normal: 9, pure: 8 } },
  Coal: { nodes: { impure: 15, normal: 31, pure: 16 } },
  RawQuartz: { nodes: { impure: 3, normal: 7, pure: 7 } },
  Sulfur: { nodes: { impure: 6, normal: 5, pure: 5 } },
  OreUranium: { nodes: { impure: 3, normal: 2, pure: 0 } },
  OreBauxite: { nodes: { impure: 5, normal: 6, pure: 6 } },
  SAM: { nodes: { impure: 10, normal: 6, pure: 3 } },
  LiquidOil: {
    nodes: { impure: 10, normal: 12, pure: 8 },
    wells: { impure: 8, normal: 6, pure: 4 },
  },
  NitrogenGas: { wells: { impure: 2, normal: 7, pure: 36 } },
  Water: { unlimited: true },
}

const PURITIES: NodePurity[] = ['impure', 'normal', 'pure']

export const emptyNodeCounts = (): NodeCounts => ({ impure: 0, normal: 0, pure: 0 })

export const totalNodes = (counts?: NodeCounts): number =>
  counts ? counts.impure + counts.normal + counts.pure : 0

// The fastest extractor the game offers for a resource. Capacity is quoted against it because
// that is the ceiling the map has; a plan still on Mk.2 miners is reading a target, not a lie.
// Named as well as measured, since "12,600/min at 250%" says nothing without the machine it
// assumes — the same nodes worked by a Mk.1 come to a quarter of it.
const bestExtractor = (part: string): { building: string, ratePerMin: number } | undefined => {
  const extraction = getExtraction(getExtractionRecipeForPart(part))
  if (!extraction) {
    return undefined
  }
  return extraction.extractors.reduce(
    (best, extractor) => extractor.ratePerMin > (best?.ratePerMin ?? 0) ? extractor : best,
    extraction.extractors[0],
  )
}

const wellRecipeForPart = (part: string): string | undefined =>
  gameData.recipes.find(recipe => recipe.extraction?.well && recipe.products[0]?.part === part)?.id

const wellSatelliteRates = (part: string) =>
  getExtraction(wellRecipeForPart(part))?.well?.satelliteRates

export interface ResourceCapacity {
  id: string
  // Water — nothing on the map caps it, so utilisation is meaningless rather than zero.
  unlimited: boolean
  // Extraction points: one miner per node, one satellite extractor per well micro-node.
  nodes: NodeCounts
  wells: NodeCounts
  extractionPoints: number
  // The building the two figures below assume: the fastest extractor the game offers for this
  // resource, or the well satellite extractor where the resource only comes out of wells.
  extractor: string
  // Every node worked by that extractor, no power shards.
  atStandardClock: number
  // The same at the game's 250% clock cap. Nothing can exceed this.
  atMaxClock: number
}

/**
 * What the world holds of one resource.
 *
 * Returns undefined for anything with no nodes behind it — collectables, alien remains, power
 * slugs — which belong in a plan but are not extracted from the ground.
 */
export const getResourceCapacity = (part: string): ResourceCapacity | undefined => {
  const world = WORLD_RESOURCE_NODES[part]
  if (!world) {
    return undefined
  }

  const nodes = world.nodes ?? emptyNodeCounts()
  const wells = world.wells ?? emptyNodeCounts()

  const extractor = bestExtractor(part)
  const nodeRate = extractor?.ratePerMin ?? 0
  const satelliteRates = wellSatelliteRates(part)
  const wellExtraction = getExtraction(wellRecipeForPart(part))

  const fromNodes = PURITIES.reduce(
    (total, purity) => total + (nodes[purity] * nodeRate * PURITY_MULTIPLIERS[purity]),
    0,
  )
  const fromWells = satelliteRates
    ? PURITIES.reduce((total, purity) => total + (wells[purity] * satelliteRates[purity]), 0)
    : 0

  const atStandardClock = fromNodes + fromWells

  return {
    id: part,
    unlimited: world.unlimited === true,
    nodes,
    wells,
    extractionPoints: totalNodes(nodes) + totalNodes(wells),
    // Nitrogen Gas has no nodes of its own, so the machine to name is the satellite extractor.
    extractor: extractor?.building ?? wellExtraction?.well?.satelliteBuilding ?? '',
    atStandardClock,
    atMaxClock: atStandardClock * (MAX_CLOCK_PERCENT / 100),
  }
}

/**
 * `ok`             — inside what the nodes give at 100%.
 * `needsOverclock` — buildable, but only with power shards on the extractors.
 * `impossible`     — past the 250% cap: the resource is not on the map in that quantity.
 * `unlimited`      — Water. Not strictly unlimited: an extractor still needs a patch of water
 *                    to stand on, so a big enough plan runs out of map. There is no node count
 *                    to measure that against, and no plan comes close, so it is not policed.
 */
export type ResourceUtilisationStatus = 'unlimited' | 'ok' | 'needsOverclock' | 'impossible'

export interface ResourceUtilisation {
  id: string
  amount: number
  capacity: ResourceCapacity
  // Fractions of the two ceilings. 1.81 means 181% — deliberately not clamped, because how far
  // past the wall a plan sits is the whole point of showing it.
  ofStandardClock: number
  ofMaxClock: number
  status: ResourceUtilisationStatus
  // Converter recipes that make this resource out of another one. Empty means there is no
  // synthesis route at all and the map's total is final — true of Crude Oil and SAM.
  conversionRecipes: string[]
}

// Converter recipes are the only way to obtain a resource without a node under it. Read from the
// game data rather than listed, so unlocking the conversion recipes in a future update needs no
// change here.
export const getConversionRecipes = (part: string): string[] =>
  gameData.recipes
    .filter(recipe => recipe.building.name === 'converter' && recipe.products[0]?.part === part)
    .map(recipe => recipe.displayName)

export const getResourceUtilisation = (part: string, amount: number): ResourceUtilisation | undefined => {
  const capacity = getResourceCapacity(part)
  if (!capacity) {
    return undefined
  }

  const ofStandardClock = capacity.atStandardClock > 0 ? amount / capacity.atStandardClock : 0
  const ofMaxClock = capacity.atMaxClock > 0 ? amount / capacity.atMaxClock : 0

  let status: ResourceUtilisationStatus = 'ok'
  if (capacity.unlimited) {
    status = 'unlimited'
  } else if (ofMaxClock > 1) {
    status = 'impossible'
  } else if (ofStandardClock > 1) {
    status = 'needsOverclock'
  }

  return {
    id: part,
    amount,
    capacity,
    ofStandardClock,
    ofMaxClock,
    status,
    conversionRecipes: getConversionRecipes(part),
  }
}

export interface ResourceNodeUsage {
  id: string
  // Extractors the plan places, against what the map has, per purity. One miner occupies one
  // node, so these are directly comparable.
  nodesUsed: NodeCounts
  nodesAvailable: NodeCounts
  satellitesUsed: NodeCounts
  satellitesAvailable: NodeCounts
  // More extractors than the resource has nodes at all. Unambiguous: 24 miners on 17 Raw Quartz
  // nodes cannot be built however slowly they are clocked, or however the purities are shuffled.
  overcommitted: boolean
  // Purities holding more extractors than the map has nodes of, while the totals still fit. A
  // softer thing entirely — a new group defaults to a normal node, so a plan that never set its
  // purities lands here without being wrong about anything except which nodes it will end up on.
  overcommittedPurities: NodePurity[]
}

const addGroupNodes = (
  used: NodeCounts,
  satellites: NodeCounts,
  group: BuildingGroup,
  recipeId: string,
): void => {
  const buildings = Math.max(0, group.buildingCount)

  if (isWellRecipe(recipeId)) {
    // The pressurizer is not on a node; its satellites are, one per micro-node, and the group's
    // count multiplies the whole well.
    const groupSatellites = getGroupSatellites(group)
    PURITIES.forEach(purity => {
      satellites[purity] += groupSatellites[purity] * buildings
    })
    return
  }

  used[getGroupPurity(group, recipeId)] += buildings
}

/**
 * How many nodes of each purity a plan occupies, per resource.
 *
 * Counts extractors rather than rates, which is the check the rate ceiling cannot make: purity
 * is chosen per building group, so a plan can quietly describe more pure nodes than exist while
 * every total still balances.
 */
export const calculateResourceNodeUsage = (factories: Factory[]): ResourceNodeUsage[] => {
  const usage: Record<string, ResourceNodeUsage> = {}

  factories.forEach(factory => {
    factory.products.forEach(product => {
      const world = WORLD_RESOURCE_NODES[product.id]
      // Unlimited resources have no nodes to overcommit — a Water Extractor sits on open water,
      // and the map is not counting how much of that is left.
      if (!world || world.unlimited) {
        return
      }

      const entry = usage[product.id] ??= {
        id: product.id,
        nodesUsed: emptyNodeCounts(),
        nodesAvailable: world.nodes ?? emptyNodeCounts(),
        satellitesUsed: emptyNodeCounts(),
        satellitesAvailable: world.wells ?? emptyNodeCounts(),
        overcommitted: false,
        overcommittedPurities: [],
      }

      product.buildingGroups?.forEach(group => {
        addGroupNodes(entry.nodesUsed, entry.satellitesUsed, group, product.recipe)
      })
    })
  })

  return Object.values(usage).map(entry => {
    // Nodes and well satellites are counted apart: a miner cannot be placed on a well's
    // micro-node, so a surplus of one never covers a shortage of the other.
    const overcommitted =
      totalNodes(entry.nodesUsed) > totalNodes(entry.nodesAvailable) ||
      totalNodes(entry.satellitesUsed) > totalNodes(entry.satellitesAvailable)

    return {
      ...entry,
      overcommitted,
      overcommittedPurities: overcommitted
        // Already reported as the harder fact; naming purities as well would only bury it.
        ? []
        : PURITIES.filter(purity =>
            entry.nodesUsed[purity] > entry.nodesAvailable[purity] ||
          entry.satellitesUsed[purity] > entry.satellitesAvailable[purity]
          ),
    }
  })
}

export interface WorldResourceProblems {
  // Resources the map cannot supply at all, and resources with more extractors placed than there
  // are nodes to stand on. Both are blockers; they are kept apart because the fix differs.
  overCapacity: string[]
  overNodes: string[]
  // Buildable, but only with power shards on the extractors. Not a blocker, so not counted.
  needsOverclock: string[]
  // Distinct resources carrying a blocker — what a header chip counts.
  blockers: number
}

/**
 * The plan's world-resource problems in one pass, for the headers above the table.
 *
 * A section the user has collapsed (Statistics defaults to it on a returning visitor) has to be
 * able to say something is wrong inside it, or the warning only reaches whoever was already
 * scrolling through the table that carries it.
 */
export const calculateWorldResourceProblems = (factories: Factory[]): WorldResourceProblems => {
  const nodeUsage = calculateResourceNodeUsage(factories)
  const overCapacity: string[] = []
  const overNodes: string[] = []
  const needsOverclock: string[] = []

  calculateTotalRawResources(factories).forEach(resource => {
    const utilisation = getResourceUtilisation(resource.id, resource.totalAmount)
    if (!utilisation || utilisation.status === 'unlimited') {
      return
    }

    if (utilisation.status === 'impossible') {
      overCapacity.push(resource.id)
    } else if (utilisation.status === 'needsOverclock') {
      needsOverclock.push(resource.id)
    }

    if (nodeUsage.find(entry => entry.id === resource.id)?.overcommitted) {
      overNodes.push(resource.id)
    }
  })

  return {
    overCapacity,
    overNodes,
    needsOverclock,
    blockers: new Set([...overCapacity, ...overNodes]).size,
  }
}
