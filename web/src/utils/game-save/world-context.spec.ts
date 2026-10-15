import { beforeAll, describe, expect, it } from 'vitest'
import { extractWorld } from '@/utils/game-save/extract-world'
import { loadSaveFixture } from '@/utils/game-save/fixtures'
import { parseSave } from '@/utils/game-save/save-parser'
import {
  bestAvailableMiner,
  isBuildingAvailable,
  isRecipeAvailable,
  resolveGeysers,
  resolveNodeCounts,
} from '@/utils/game-save/world-context'
import type { WorldSnapshot } from '@/utils/game-save/world-snapshot'
import { gameData } from '@/utils/gameData'
import progressed from '../../../testing/fixtures/worlds/progressed.json'

const buildingIds = Object.keys(gameData.buildings)
const played = progressed as unknown as WorldSnapshot

let vanilla: WorldSnapshot
let fossil: WorldSnapshot
let allPure: WorldSnapshot

beforeAll(async () => {
  vanilla = extractWorld(await parseSave(loadSaveFixture('vanilla')), { buildingIds })
  fossil = extractWorld(await parseSave(loadSaveFixture('fossil-fuel-rich')), { buildingIds })
  allPure = extractWorld(await parseSave(loadSaveFixture('vanilla-all-pure')), { buildingIds })
})

describe('no world attached', () => {
  // A plan with no save must behave exactly as it did before the feature existed, or shipping
  // this turns working plans red for people who never opted in.
  it('allows every building', () => {
    expect(isBuildingAvailable(undefined, 'quantumencoder')).toBe(true)
  })

  it('allows every recipe', () => {
    expect(isRecipeAvailable(undefined, 'Alternate_PureIronIngot')).toBe(true)
  })

  it('keeps assuming a Miner Mk.3, which is what the 250% ceilings already assume', () => {
    expect(bestAvailableMiner(undefined)).toBe('minermk3')
  })

  it('returns the baseline node counts untouched', () => {
    const baseline = { nodes: { impure: 15, normal: 28, pure: 19 } }

    expect(resolveNodeCounts(undefined, 'Coal', baseline).nodes).toEqual(baseline.nodes)
    expect(resolveNodeCounts(undefined, 'Coal', baseline).fromWorld).toBe(false)
  })
})

describe('a vanilla world', () => {
  it('carries no overrides, so the baseline table still stands', () => {
    // The trap: a vanilla save says nothing about nodes. Reading that silence as zero would
    // tell the user the map holds no coal at all.
    const baseline = { nodes: { impure: 15, normal: 28, pure: 19 } }
    const resolved = resolveNodeCounts(vanilla, 'Coal', baseline)

    expect(resolved.nodes).toEqual(baseline.nodes)
    expect(resolved.fromWorld).toBe(false)
  })

  it('reports a brand new world cannot build a Miner Mk.2 yet', () => {
    expect(bestAvailableMiner(vanilla)).toBe('minermk1')
  })
})

describe('a fossil-fuel-rich world', () => {
  it('replaces the baseline coal count with what the save states', () => {
    const baseline = { nodes: { impure: 15, normal: 28, pure: 19 } }
    const resolved = resolveNodeCounts(fossil, 'Coal', baseline)

    expect(resolved.fromWorld).toBe(true)
    const { impure, normal, pure } = resolved.nodes
    expect(impure + normal + pure).toBe(101)
  })

  it('keeps the baseline proportions when the save gave a count but no purity split', () => {
    // The fossil preset rewrites resources without touching solid-node purity, so the split has
    // to come from somewhere. Stretching the vanilla proportions is a stated assumption; whatever
    // it does, it must not lose or invent nodes.
    const baseline = { nodes: { impure: 0, normal: 62, pure: 0 } }
    const resolved = resolveNodeCounts(fossil, 'Coal', baseline)

    expect(resolved.nodes).toEqual({ impure: 0, normal: 101, pure: 0 })
  })

  it('uses the save outright where it did give the split', () => {
    const wells = resolveNodeCounts(fossil, 'NitrogenGas', { wells: { impure: 1, normal: 1, pure: 1 } }).wells
    const total = wells.impure + wells.normal + wells.pure

    expect(total).toBe(41)
    expect(wells).toEqual(fossil.nodes['NitrogenGas'].wells.purity)
  })

  it('leaves a resource the save never mentioned on its baseline', () => {
    const baseline = { nodes: { impure: 4, normal: 4, pure: 4 } }

    expect(resolveNodeCounts(fossil, 'NotAResource', baseline).nodes).toEqual(baseline.nodes)
  })
})

/**
 * The vanilla map's own figures, confirmed against the community map. Held here rather than
 * asserted from a save because no save contains them: the game writes purity only where it
 * differs from the level default, and geysers it never writes at all.
 *
 * The totals are the part a save can referee, and they do: 55 + 45 + 18 = 118 satellites and
 * 31 geysers are exactly what every 1.2 save reports.
 */
const VANILLA_WATER_WELLS = { impure: 7, normal: 12, pure: 36 }
const VANILLA_NITROGEN_WELLS = { impure: 2, normal: 7, pure: 36 }
const VANILLA_OIL_WELLS = { impure: 8, normal: 6, pure: 4 }
const VANILLA_GEYSERS = { impure: 9, normal: 13, pure: 9 }

const total = (c: { impure: number, normal: number, pure: number }) => c.impure + c.normal + c.pure

describe('the vanilla baseline agrees with what every save counts', () => {
  it('accounts for all 118 well satellites', () => {
    expect(total(VANILLA_WATER_WELLS) + total(VANILLA_NITROGEN_WELLS) + total(VANILLA_OIL_WELLS)).toBe(118)
  })

  it('accounts for all 31 geysers', () => {
    expect(total(VANILLA_GEYSERS)).toBe(31)
  })

  it('matches the satellite and geyser census a real vanilla save reports', () => {
    expect(vanilla.objectCounts['BP_FrackingSatellite']).toBe(118)
    expect(vanilla.geysers.total).toBe(31)
  })
})

describe('geysers', () => {
  it('always come from the baseline, because no save records their purity', () => {
    const resolved = resolveGeysers(vanilla, VANILLA_GEYSERS)

    expect(resolved.nodes).toEqual(VANILLA_GEYSERS)
    expect(resolved.total).toBe(31)
    expect(resolved.fromWorld).toBe(false)
  })

  it('keeps the baseline even on a world that forced every other node pure', () => {
    // NPS_AllPure does not touch geysers, so treating its silence as "all pure" would be wrong.
    expect(resolveGeysers(allPure, VANILLA_GEYSERS).nodes).toEqual(VANILLA_GEYSERS)
  })

  it('falls back to the baseline total with no world attached', () => {
    expect(resolveGeysers(undefined, VANILLA_GEYSERS).total).toBe(31)
  })
})

describe('water wells', () => {
  it('stand on the baseline in a vanilla world, which records none of them', () => {
    const resolved = resolveNodeCounts(vanilla, 'Water', { wells: VANILLA_WATER_WELLS })

    expect(resolved.wells).toEqual(VANILLA_WATER_WELLS)
    expect(resolved.fromWorld).toBe(false)
  })

  it('are replaced outright by a world that redistributed them', () => {
    // The fossil preset moves satellites between resources, so its own figure wins.
    const resolved = resolveNodeCounts(fossil, 'Water', { wells: VANILLA_WATER_WELLS })

    expect(resolved.fromWorld).toBe(true)
    expect(total(resolved.wells)).toBe(58)
  })
})

describe('a progressed world', () => {
  it('refuses the buildings it has not unlocked', () => {
    expect(isBuildingAvailable(played, 'quantumencoder')).toBe(false)
    expect(isBuildingAvailable(played, 'minermk3')).toBe(false)
  })

  it('allows the ones it has', () => {
    expect(isBuildingAvailable(played, 'blender')).toBe(true)
  })

  it('caps the best miner at Mk.2, halving every 250% ceiling the planner shows', () => {
    expect(bestAvailableMiner(played)).toBe('minermk2')
  })

  it('knows an unlocked alternate from one the player has never seen', () => {
    const known = played.recipes.alternates[0]

    expect(isRecipeAvailable(played, known)).toBe(true)
    expect(isRecipeAvailable(played, 'Alternate_NotARealRecipe')).toBe(false)
  })
})
