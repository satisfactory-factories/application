// The node counts in world-resources are map facts typed in by hand, so the first test here
// multiplies them back out against the game's own extractor rates and checks they reproduce the
// `limit` the parser reads out of Docs.json for every resource. A typo in a node count fails
// there rather than quietly reporting a plan as buildable when it isn't.

import { beforeEach, describe, expect, it } from 'vitest'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { fetchGameData } from '@/utils/gameDataService'
import {
  calculateResourceNodeUsage,
  calculateWorldResourceProblems,
  getConversionRecipes,
  getResourceCapacity,
  getResourceUtilisation,
  totalNodes,
  WORLD_RESOURCE_NODES,
} from '@/utils/world-resources'

describe('world-resources', async () => {
  const gameData = await fetchGameData()

  describe('capacity', () => {
    it('reproduces the game data extraction limit for every mapped resource', () => {
      Object.keys(WORLD_RESOURCE_NODES).forEach(part => {
        const capacity = getResourceCapacity(part)
        const limit = gameData.items.rawResources[part]?.limit

        if (capacity?.unlimited) {
          return
        }

        expect(capacity, `${part} has no capacity`).toBeDefined()
        expect(Math.round(capacity!.atMaxClock), `${part} max capacity`).toBe(limit)
      })
    })

    // The rate check above passes for any split reproducing the same limit, so on its own it let
    // Limestone sit here as 15/51/29 — a 95-node map. Object counts are the independent check:
    // three 1.2 saves (vanilla, node-randomised and fossil-fuel-rich) each hold exactly 459
    // BP_ResourceNode and 118 BP_FrackingSatellite actors, whatever the world was generated with.
    it('holds as many nodes and satellites as the map has objects', () => {
      const totals = Object.keys(WORLD_RESOURCE_NODES).reduce((sum, part) => {
        const capacity = getResourceCapacity(part)
        return capacity && !capacity.unlimited
          ? {
              nodes: sum.nodes + totalNodes(capacity.nodes),
              wells: sum.wells + totalNodes(capacity.wells),
            }
          : sum
      }, { nodes: 0, wells: 0 })

      expect(totals.nodes).toBe(459)
      // 63 of the map's 118 satellites; the other 55 are Water, which has no ceiling to track.
      expect(totals.wells).toBe(63)
    })

    it('reports crude oil across both nodes and wells', () => {
      const capacity = getResourceCapacity('LiquidOil')

      // 30 nodes at 60/120/240 plus 18 well satellites at 30/60/120.
      expect(capacity?.atStandardClock).toBe(5040)
      expect(capacity?.atMaxClock).toBe(12600)
      expect(capacity?.extractionPoints).toBe(48)
    })

    it('reports nitrogen gas from wells alone', () => {
      const capacity = getResourceCapacity('NitrogenGas')

      expect(capacity?.atStandardClock).toBe(4800)
      expect(capacity?.atMaxClock).toBe(12000)
    })

    it('marks water unlimited rather than capped', () => {
      expect(getResourceCapacity('Water')?.unlimited).toBe(true)
    })

    it('returns nothing for a resource with no nodes behind it', () => {
      expect(getResourceCapacity('Leaves')).toBeUndefined()
      expect(getResourceCapacity('IronIngot')).toBeUndefined()
    })
  })

  describe('utilisation', () => {
    it('is ok inside the unclocked ceiling', () => {
      const utilisation = getResourceUtilisation('LiquidOil', 2520)

      expect(utilisation?.status).toBe('ok')
      expect(utilisation?.ofStandardClock).toBe(0.5)
    })

    it('needs overclocking past the unclocked ceiling', () => {
      const utilisation = getResourceUtilisation('LiquidOil', 6000)

      expect(utilisation?.status).toBe('needsOverclock')
      expect(utilisation?.ofMaxClock).toBeLessThan(1)
    })

    it('is impossible past the 250% ceiling', () => {
      const utilisation = getResourceUtilisation('LiquidOil', 13000)

      expect(utilisation?.status).toBe('impossible')
      expect(utilisation?.ofStandardClock).toBeGreaterThan(2)
    })

    it('never flags water', () => {
      expect(getResourceUtilisation('Water', 100000)?.status).toBe('unlimited')
    })
  })

  describe('conversion routes', () => {
    it('finds the converter recipes that top a resource up', () => {
      expect(getConversionRecipes('OreUranium')).toContain('Uranium Ore (Convert: Bauxite)')
      expect(getConversionRecipes('OreBauxite').length).toBeGreaterThan(0)
    })

    // The two resources with no synthesis route: their map totals are final, which is exactly
    // what a plan over the limit needs to be told.
    it('finds none for crude oil or SAM', () => {
      expect(getConversionRecipes('LiquidOil')).toEqual([])
      expect(getConversionRecipes('SAM')).toEqual([])
    })
  })

  describe('plan problems', () => {
    // What the section headers count. Statistics is collapsed by choice on a returning visitor,
    // so this roll-up is the only thing standing between them and a plan that cannot be built.
    // Calculated first, because the raw-resource totals read `factory.parts` — the pass that
    // decides a part is raw — and the building groups are overridden afterwards so the count
    // under test survives the solver sizing them against the product amount.
    const mine = (part: string, amount: number, recipe: string, buildings: number) => {
      const factory = newFactory(`${part} Mine`)
      addProductToFactory(factory, { id: part, amount, recipe })
      calculateFactories([factory], gameData)
      factory.products[0].buildingGroups = [
        { ...factory.products[0].buildingGroups[0], buildingCount: buildings, purity: 'normal' },
      ]
      return factory
    }

    it('counts nothing for a plan inside the map', () => {
      const problems = calculateWorldResourceProblems([mine('OreIron', 480, 'Extract_OreIron', 4)])

      expect(problems.blockers).toBe(0)
      expect(problems.overCapacity).toEqual([])
      expect(problems.overNodes).toEqual([])
      expect(problems.needsOverclock).toEqual([])
    })

    it('separates a resource the map cannot supply from one with nowhere to stand', () => {
      const problems = calculateWorldResourceProblems([
        // 13,000/min against a 12,600/min world, on a handful of (impossibly fast) extractors.
        mine('LiquidOil', 13000, 'Extract_LiquidOil', 4),
        mine('OreUranium', 240, 'Extract_OreUranium', 7),
      ])

      expect(problems.overCapacity).toEqual(['LiquidOil'])
      expect(problems.overNodes).toEqual(['OreUranium'])
      expect(problems.blockers).toBe(2)
    })

    it('counts a resource failing both checks once', () => {
      const problems = calculateWorldResourceProblems([mine('SAM', 12000, 'Extract_SAM', 40)])

      expect(problems.overCapacity).toEqual(['SAM'])
      expect(problems.overNodes).toEqual(['SAM'])
      expect(problems.blockers).toBe(1)
    })

    it('reports the shard case without counting it as a blocker', () => {
      const problems = calculateWorldResourceProblems([mine('LiquidOil', 6000, 'Extract_LiquidOil', 20)])

      expect(problems.needsOverclock).toEqual(['LiquidOil'])
      expect(problems.overCapacity).toEqual([])
      expect(problems.blockers).toBe(0)
    })

    it('never counts water', () => {
      expect(calculateWorldResourceProblems([mine('Water', 60000, 'Extract_Water', 500)]).blockers).toBe(0)
    })
  })

  describe('node usage', () => {
    let factory: Factory

    beforeEach(() => {
      factory = newFactory('Mine')
    })

    it('counts miners against the nodes of the purity they sit on', () => {
      addProductToFactory(factory, { id: 'RawQuartz', amount: 240, recipe: 'Extract_RawQuartz' })
      factory.products[0].buildingGroups = [
        { ...factory.products[0].buildingGroups[0], buildingCount: 4, purity: 'pure', extractorBuilding: 'minermk2' },
      ]

      const usage = calculateResourceNodeUsage([factory])[0]

      expect(usage.nodesUsed.pure).toBe(4)
      expect(usage.nodesAvailable.pure).toBe(7)
      expect(usage.overcommitted).toBe(false)
      expect(usage.overcommittedPurities).toEqual([])
    })

    it('flags a purity the map does not have enough of', () => {
      addProductToFactory(factory, { id: 'OreUranium', amount: 240, recipe: 'Extract_OreUranium' })
      // The map has 2 normal Uranium nodes; a plan is free to describe 7 and balance perfectly.
      factory.products[0].buildingGroups = [
        { ...factory.products[0].buildingGroups[0], buildingCount: 7, purity: 'normal', extractorBuilding: 'minermk2' },
      ]

      const usage = calculateResourceNodeUsage([factory])[0]

      // 7 miners against 5 Uranium nodes in total: no purity shuffle rescues it.
      expect(usage.nodesUsed.normal).toBe(7)
      expect(usage.overcommitted).toBe(true)
      expect(usage.overcommittedPurities).toEqual([])
    })

    it('counts well satellites rather than pressurizers', () => {
      addProductToFactory(factory, { id: 'NitrogenGas', amount: 600, recipe: 'Extract_NitrogenGas_Well' })
      factory.products[0].buildingGroups = [
        {
          ...factory.products[0].buildingGroups[0],
          buildingCount: 2,
          satellites: { impure: 0, normal: 0, pure: 4 },
        },
      ]

      const usage = calculateResourceNodeUsage([factory])[0]

      // Two wells of four pure satellites each: eight micro-nodes, no nodes under the smashers.
      expect(usage.satellitesUsed.pure).toBe(8)
      expect(usage.nodesUsed.pure).toBe(0)
      expect(usage.overcommitted).toBe(false)
    })

    it('sums the same resource across factories', () => {
      const other = newFactory('Mine 2')
      ;[factory, other].forEach(mine => {
        addProductToFactory(mine, { id: 'SAM', amount: 120, recipe: 'Extract_SAM' })
        mine.products[0].buildingGroups = [
          { ...mine.products[0].buildingGroups[0], buildingCount: 6, purity: 'pure', extractorBuilding: 'minermk2' },
        ]
      })

      const usage = calculateResourceNodeUsage([factory, other])[0]

      // 12 miners against 19 SAM nodes: they fit on the map, just not all on the 3 pure ones,
      // which is the softer finding.
      expect(usage.nodesUsed.pure).toBe(12)
      expect(usage.overcommitted).toBe(false)
      expect(usage.overcommittedPurities).toEqual(['pure'])
    })

    it('reports too many satellites for a well separately from nodes', () => {
      addProductToFactory(factory, { id: 'NitrogenGas', amount: 600, recipe: 'Extract_NitrogenGas_Well' })
      // 50 satellites against the 45 micro-nodes the map's nitrogen wells hold between them.
      // Counted apart from solid nodes: a satellite extractor cannot be placed on one.
      factory.products[0].buildingGroups = [
        {
          ...factory.products[0].buildingGroups[0],
          buildingCount: 1,
          satellites: { impure: 0, normal: 0, pure: 50 },
        },
      ]

      expect(calculateResourceNodeUsage([factory])[0].overcommitted).toBe(true)
    })

    it('ignores water, which sits on no node', () => {
      addProductToFactory(factory, { id: 'Water', amount: 1200, recipe: 'Extract_Water' })

      expect(calculateResourceNodeUsage([factory])).toEqual([])
    })
  })
})
