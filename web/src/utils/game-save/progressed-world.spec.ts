import { describe, expect, it } from 'vitest'
import progressed from '../../../testing/fixtures/worlds/progressed.json'
import { WORLD_SNAPSHOT_VERSION } from '@/utils/game-save/world-snapshot'
import { gameData } from '@/utils/gameData'

/**
 * A real, played world. The save itself is ~10 MB and does not belong in the repo, so the
 * snapshot it produced is committed instead; scripts/generate-world-fixture.mjs regenerates it
 * through the same parser the app uses.
 *
 * What this guards is the point of the whole feature: the planner today assumes every recipe and
 * every building is available, and in this world most of the late-game ones are not.
 */
describe('a progressed world', () => {
  it('was written by the current snapshot format', () => {
    expect(progressed.version).toBe(WORLD_SNAPSHOT_VERSION)
  })

  it('reads the game phase and the milestones behind it', () => {
    expect(progressed.progression.gamePhase).toBe(3)
    expect(progressed.progression.tiers).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(progressed.progression.milestones).toContain('Schematic_4-2')
  })

  it('keeps MAM and sink-shop unlocks, which are not named Schematic_*', () => {
    // These are `Research_*` and `ResourceSink_*`. A pattern anchored on `Schematic_` drops them
    // silently, taking the entire MAM tree with it.
    const folders = Object.keys(progressed.progression.schematicsByFolder)

    expect(folders.some(f => f.startsWith('Research'))).toBe(true)
    expect(folders.some(f => f.startsWith('ResourceSink'))).toBe(true)
  })

  it('reads every available recipe and separates the alternates', () => {
    expect(progressed.recipes.standard).toHaveLength(359)
    expect(progressed.recipes.alternates).toHaveLength(52)
    // Alternates are stored without their prefix, so they read as recipe ids.
    expect(progressed.recipes.alternates.every(name => !name.startsWith('Alternate_'))).toBe(true)
  })

  describe('what this world cannot build', () => {
    // The reason the feature exists. A plan using any of these would balance perfectly today and
    // be unbuildable in the world it was planned for.
    it.each(['frackingsmasher', 'minermk3', 'converter', 'quantumencoder'])(
      'has not unlocked the %s',
      building => {
        expect(gameData.buildings).toHaveProperty(building)
        expect(progressed.buildings).not.toContain(building)
      },
    )

    it('has unlocked the blender', () => {
      expect(progressed.buildings).toContain('blender')
    })

    it('recovers the buildings the game and the game data name differently', () => {
      // Naive name matching reports these three as unbuildable, which is a false negative in the
      // dangerous direction: the planner would refuse something the player can actually build.
      expect(progressed.buildings).toContain('geothermalgenerator')
      expect(progressed.buildings).toContain('alienpoweraugmenter')
      expect(progressed.buildings).toContain('generatorbiomass')
    })
  })

  describe('extractors already placed', () => {
    const census = progressed.extractorCensus as Record<string, { total: number, onNode: number }>

    it('finds the miners and the node each sits on', () => {
      expect(census.Build_MinerMk2).toEqual({ total: 98, onNode: 98 })
      expect(census.Build_OilPump).toEqual({ total: 10, onNode: 10 })
    })

    it('leaves water pumps without a node, because they draw from open water', () => {
      expect(census.Build_WaterPump.total).toBe(160)
      expect(census.Build_WaterPump.onNode).toBe(0)
    })
  })

  it('counted a full map, so nothing above is an artefact of a short read', () => {
    expect(progressed.objectCounts).toEqual({
      BP_ResourceNode: 459,
      BP_FrackingSatellite: 118,
      BP_FrackingCore: 17,
      BP_ResourceNodeGeyser: 31,
    })
  })
})
