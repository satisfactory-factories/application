import { beforeAll, describe, expect, it } from 'vitest'
import { extractWorld } from '@/utils/game-save/extract-world'
import { loadSaveFixture } from '@/utils/game-save/fixtures'
import { parseSave } from '@/utils/game-save/save-parser'
import {
  bestAvailableMiner,
  isBuildingAvailable,
  isRecipeAvailable,
  resolveNodeCounts,
} from '@/utils/game-save/world-context'
import type { WorldSnapshot } from '@/utils/game-save/world-snapshot'
import { gameData } from '@/utils/gameData'
import progressed from '../../../testing/fixtures/worlds/progressed.json'

const buildingIds = Object.keys(gameData.buildings)
const played = progressed as unknown as WorldSnapshot

let vanilla: WorldSnapshot
let fossil: WorldSnapshot

beforeAll(async () => {
  vanilla = extractWorld(await parseSave(loadSaveFixture('vanilla')), { buildingIds })
  fossil = extractWorld(await parseSave(loadSaveFixture('fossil-fuel-rich')), { buildingIds })
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
