import { beforeAll, describe, expect, it } from 'vitest'
import { extractWorld, toBuildingId } from '@/utils/game-save/extract-world'
import { loadSaveFixture, SaveFixture } from '@/utils/game-save/fixtures'
import { parseSave } from '@/utils/game-save/save-parser'
import { isPurityComplete, WORLD_SNAPSHOT_VERSION, WorldSnapshot } from '@/utils/game-save/world-snapshot'
import { gameData } from '@/utils/gameData'

const buildingIds = Object.keys(gameData.buildings)

const worlds = {} as Record<SaveFixture, WorldSnapshot>

const read = async (name: SaveFixture) =>
  extractWorld(await parseSave(loadSaveFixture(name)), { saveName: name, buildingIds })

beforeAll(async () => {
  for (const name of ['vanilla', 'vanilla-all-pure', 'fossil-fuel-rich', 'advanced-rich', 'node-randomised'] as const) {
    worlds[name] = await read(name)
  }
})

const totalNodes = (world: WorldSnapshot, resource: string) => {
  const counts = world.nodes[resource]
  return counts ? counts.nodes.total + counts.wells.total : 0
}

describe('extractWorld', () => {
  it('stamps the current snapshot version', () => {
    expect(worlds.vanilla.version).toBe(WORLD_SNAPSHOT_VERSION)
  })

  describe('a vanilla world writes nothing at all', () => {
    // The trap this whole folder is built around. A default world differs from the level in no
    // way, so the game writes no settings and no overrides. Reading that as "no nodes" would
    // erase the map, so it must read as "the baseline table stands".
    it('has no generation settings', () => {
      expect(worlds.vanilla.generation).toEqual({ randomisation: null, purity: null, seed: null })
    })

    it('has no node overrides, and says so explicitly', () => {
      expect(worlds.vanilla.nodes).toEqual({})
      expect(worlds.vanilla.hasNodeOverrides).toBe(false)
    })

    it('still parsed a full map, so the empty overrides are a fact rather than a failure', () => {
      expect(worlds.vanilla.objectCounts['BP_ResourceNode']).toBe(459)
      expect(worlds.vanilla.objectCounts['BP_FrackingSatellite']).toBe(118)
    })
  })

  describe('the two override axes move independently', () => {
    it('patches purity only when the world is all-pure', () => {
      const world = worlds['vanilla-all-pure']

      expect(world.generation.purity).toBe('NPS_AllPure')
      expect(world.generation.randomisation).toBeNull()
      // Purity was rewritten for all 577 nodes, but no resource was: which resource each node
      // holds is still a baseline fact, so nothing lands in `nodes`.
      expect(world.hasNodeOverrides).toBe(true)
      expect(world.nodes).toEqual({})
    })

    it('patches resources on a fossil-fuel-rich world', () => {
      const world = worlds['fossil-fuel-rich']

      expect(world.generation.randomisation).toBe('NRM_FossilFuelRich')
      expect(world.hasNodeOverrides).toBe(true)
      expect(totalNodes(world, 'Coal')).toBe(101)
      expect(totalNodes(world, 'LiquidOil')).toBe(87)
      expect(totalNodes(world, 'OreIron')).toBe(86)
    })

    it('redistributes differently on an advanced-rich world', () => {
      const world = worlds['advanced-rich']

      expect(world.generation.randomisation).toBe('NRM_AdvancedRich')
      expect(totalNodes(world, 'OreUranium')).toBe(39)
      expect(totalNodes(world, 'Coal')).toBe(29)
    })

    it('leaves solid-node purity alone when only the resources were rewritten', () => {
      // The fossil preset writes 577 resource overrides but only 118 purity ones, because the
      // solid nodes kept their default purity. Counting the silent ones as normal would invent
      // a purity split the world does not have.
      const world = worlds['fossil-fuel-rich']
      const solid = world.nodes['Coal'].nodes

      expect(solid.total).toBe(101)
      expect(solid.purity).toEqual({ impure: 0, normal: 0, pure: 0 })
      expect(isPurityComplete(solid)).toBe(false)
    })

    it('records purity on well satellites, which the fossil preset does rewrite', () => {
      const wells = worlds['fossil-fuel-rich'].nodes['NitrogenGas'].wells

      expect(wells.total).toBe(41)
      expect(isPurityComplete(wells)).toBe(true)
    })
  })

  describe('a node-randomised world', () => {
    it('reads its generation settings and seed', () => {
      expect(worlds['node-randomised'].generation).toEqual({
        randomisation: 'NRM_Strict',
        purity: 'NPS_AllRandom',
        seed: 162272096,
      })
    })

    it('spreads purity across all three grades', () => {
      const world = worlds['node-randomised']
      const totals = { impure: 0, normal: 0, pure: 0 }

      for (const counts of Object.values(world.nodes)) {
        for (const grade of ['impure', 'normal', 'pure'] as const) {
          totals[grade] += counts.nodes.purity[grade] + counts.wells.purity[grade]
        }
      }

      expect(totals.impure + totals.normal + totals.pure).toBe(577)
      for (const grade of ['impure', 'normal', 'pure'] as const) {
        expect(totals[grade]).toBeGreaterThan(100)
      }
    })
  })

  describe('progression', () => {
    it('reads nothing but the starting recipes on a brand new world', () => {
      const world = worlds.vanilla

      expect(world.progression.milestones).toEqual([])
      expect(world.progression.tiers).toEqual([])
      expect(world.recipes.alternates).toEqual([])
      expect(world.recipes.standard.length).toBeGreaterThan(0)
    })

    it('reads the game phase', () => {
      expect(worlds.vanilla.progression.gamePhase).toBe(0)
    })
  })

  describe('buildings', () => {
    it('only ever reports buildings the planner knows', () => {
      for (const world of Object.values(worlds)) {
        for (const building of world.buildings) {
          expect(buildingIds).toContain(building)
        }
      }
    })

    it('does not mistake a production recipe for a building', () => {
      // Every recipe name normalises to something; only the ones naming a real building count.
      expect(worlds.vanilla.recipes.standard).toContain('IngotIron')
      expect(worlds.vanilla.buildings).not.toContain('ingotiron')
    })

    it('maps the building names the game spells differently from the game data', () => {
      // Lifted from parsing/src/buildings.ts, which produced those ids. If a game update renames
      // one of these, this fails rather than the building silently reading as unbuildable.
      expect(toBuildingId('GeneratorGeoThermal')).toBe('geothermalgenerator')
      expect(toBuildingId('AlienPowerBuilding')).toBe('alienpoweraugmenter')
      expect(toBuildingId('GeneratorBiomass_Automated')).toBe('generatorbiomass')
      expect(toBuildingId('MinerMk3')).toBe('minermk3')
      expect(toBuildingId('FrackingSmasher')).toBe('frackingsmasher')
    })
  })

  describe('geysers', () => {
    // 31 on every map, and the count is directly observable in every save regardless of how the
    // world was generated.
    it.each(['vanilla', 'vanilla-all-pure', 'fossil-fuel-rich', 'advanced-rich', 'node-randomised'] as const)(
      'counts 31 in the %s save',
      name => {
        expect(worlds[name].geysers.total).toBe(31)
      },
    )

    it('never carries a purity, not even in a world that forced every node pure', () => {
      // NPS_AllPure rewrites all 459 nodes and all 118 satellites and still leaves geysers alone,
      // so geyser purity can only ever come from the baseline table.
      expect(worlds['vanilla-all-pure'].nodes).toEqual({})
      expect(worlds['vanilla-all-pure'].geysers.purity).toEqual({ impure: 0, normal: 0, pure: 0 })
      expect(worlds['vanilla-all-pure'].geysers.total).toBe(31)
    })

    it('is not double-counted as a solid node', () => {
      // BP_ResourceNodeGeyser starts with BP_ResourceNode, so a prefix match reads 490 nodes.
      expect(worlds.vanilla.objectCounts['BP_ResourceNode']).toBe(459)
      expect(worlds.vanilla.objectCounts['BP_ResourceNodeGeyser']).toBe(31)
    })
  })

  describe('well satellites are redistributed by every randomisation preset', () => {
    // This is why a randomised save cannot referee the vanilla well split: the vanilla map has
    // Water 55 / Nitrogen 45 / Oil 18, and NRM_Strict preserves all eleven solid node counts
    // exactly while still moving three satellites off Nitrogen.
    const wells = (world: WorldSnapshot, resource: string) => world.nodes[resource]?.wells.total ?? 0

    it.each([
      ['node-randomised', 55, 42, 21],
      ['fossil-fuel-rich', 58, 41, 19],
      ['advanced-rich', 54, 44, 20],
    ] as const)('%s splits its 118 satellites its own way', (name, water, nitrogen, oil) => {
      const world = worlds[name]

      expect(wells(world, 'Water')).toBe(water)
      expect(wells(world, 'NitrogenGas')).toBe(nitrogen)
      expect(wells(world, 'LiquidOil')).toBe(oil)
      expect(water + nitrogen + oil).toBe(118)
    })
  })

  describe('extractors', () => {
    it('finds none on a world where nothing has been built', () => {
      expect(worlds.vanilla.extractors).toEqual([])
    })
  })
})
