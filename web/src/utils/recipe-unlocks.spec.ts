import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { RecipeUnlocks } from '@/interfaces/planner/FactoryInterface'
import type { WorldSnapshot } from '@/utils/game-save/world-snapshot'
import {
  isActiveBuildingLocked,
  isActiveRecipeLocked,
  isBuildingUnlocked,
  isRecipeOverridden,
  isRecipeUnlocked,
  rebaseRecipeUnlocks,
  saveFromWorld,
  setActiveRecipeUnlocks,
  toggleRecipe,
  unlockedRecipesFromWorld,
  unlocksForArrivingPlan,
  withSave,
} from '@/utils/recipe-unlocks'
import { fetchGameData } from '@/utils/gameDataService'

const progressed = JSON.parse(
  readFileSync(join(__dirname, '../../testing/fixtures/worlds/progressed.json'), 'utf-8')
) as WorldSnapshot

const gameData = await fetchGameData()
const recipeIds = gameData.recipes.map(recipe => recipe.id)
const alternateIds = new Set(gameData.recipes.filter(recipe => recipe.isAlternate).map(recipe => recipe.id))

const unlocks = (recipes: string[], overrides: Record<string, boolean> = {}, buildings: string[] = []): RecipeUnlocks => ({
  save: { name: 'Test', readAt: '2026-10-15T00:00:00.000Z', recipes, buildings, tiers: [] },
  overrides,
})

describe('unlockedRecipesFromWorld', () => {
  const unlocked = unlockedRecipesFromWorld(progressed, recipeIds)

  it('maps the save\'s prefixless alternate names onto the game data\'s recipe ids', () => {
    // 52 in the save, less Turbofuel (an `Alternate_` id the game data counts as standard), plus
    // Pure Aluminum Ingot below.
    expect(unlocked.filter(id => alternateIds.has(id))).toHaveLength(52)
    expect(unlocked).toContain('Alternate_SteelRod')
  })

  // Pure Aluminum Ingot is an alternate with no `Alternate_` prefix, so the save lists it with
  // the standard recipes. Trusting the prefix alone would read it as locked forever.
  it('finds an alternate the game names without the prefix', () => {
    expect(unlocked).toContain('PureAluminumIngot')
  })

  it('keeps the standard recipes the save has unlocked, and leaves out the ones it has not', () => {
    expect(unlocked).toContain('IronPlate')
    // The case this exists for: a plan built on Nitric Acid by a save that never bought it.
    expect(recipeIds).toContain('NitricAcid')
    expect(unlocked).not.toContain('NitricAcid')
  })

  it('never invents an id the game data does not have', () => {
    expect(unlocked.every(id => recipeIds.includes(id))).toBe(true)
  })
})

describe('saveFromWorld', () => {
  it('keeps the session name, when it was read, its buildings and its tiers', () => {
    const save = saveFromWorld({ ...progressed, saveName: 'My World' }, recipeIds)

    expect(save.name).toBe('My World')
    expect(save.readAt).toBe(progressed.readAt)
    expect(save.buildings).toEqual(progressed.buildings)
    expect(save.tiers).toEqual(progressed.progression.tiers)
  })
})

describe('isRecipeUnlocked', () => {
  it('counts every recipe as unlocked until a save is loaded', () => {
    expect(isRecipeUnlocked(undefined, 'Alternate_Screw')).toBe(true)
    expect(isRecipeUnlocked({ save: null, overrides: { Alternate_Screw: false } }, 'Alternate_Screw')).toBe(true)
  })

  it('reads the save once one is loaded', () => {
    expect(isRecipeUnlocked(unlocks(['Alternate_Screw']), 'Alternate_Screw')).toBe(true)
    expect(isRecipeUnlocked(unlocks(['Alternate_Screw']), 'NitricAcid')).toBe(false)
  })

  it('lets a mark made by hand win over the save', () => {
    expect(isRecipeUnlocked(unlocks([], { Alternate_Screw: true }), 'Alternate_Screw')).toBe(true)
    expect(isRecipeUnlocked(unlocks(['Alternate_Screw'], { Alternate_Screw: false }), 'Alternate_Screw')).toBe(false)
  })

  // Mining and pumping are the planner's own recipes, which no save lists: the building decides.
  it('never locks an extraction recipe', () => {
    expect(isRecipeUnlocked(unlocks([]), 'Extract_LiquidOil')).toBe(true)
  })

  // A save stored by an earlier build of this feature kept alternates only. Read as no save, not
  // as one that has unlocked nothing.
  it('reads a save of an older shape as no save', () => {
    const older = { save: { name: 'Old', readAt: '', alternates: [] }, overrides: {} } as unknown as RecipeUnlocks

    expect(isRecipeUnlocked(older, 'NitricAcid')).toBe(true)
  })
})

describe('isBuildingUnlocked', () => {
  it('counts every building as unlocked until a save is loaded', () => {
    expect(isBuildingUnlocked(undefined, 'blender')).toBe(true)
  })

  it('reads the save once one is loaded', () => {
    expect(isBuildingUnlocked(unlocks([], {}, ['blender']), 'blender')).toBe(true)
    expect(isBuildingUnlocked(unlocks([], {}, ['blender']), 'quantumencoder')).toBe(false)
  })
})

describe('toggleRecipe', () => {
  it('marks a locked recipe unlocked by hand', () => {
    const next = toggleRecipe(unlocks([]), 'NitricAcid')

    expect(isRecipeUnlocked(next, 'NitricAcid')).toBe(true)
    expect(isRecipeOverridden(next, 'NitricAcid')).toBe(true)
  })

  // Otherwise the mark outlives its reason and the next save can never decide the recipe again.
  it('drops the mark when toggling back to what the save says', () => {
    const next = toggleRecipe(toggleRecipe(unlocks([]), 'Alternate_Screw'), 'Alternate_Screw')

    expect(next.overrides).toEqual({})
    expect(isRecipeUnlocked(next, 'Alternate_Screw')).toBe(false)
  })

  it('can lock a recipe the save has unlocked', () => {
    expect(toggleRecipe(unlocks(['Alternate_Screw']), 'Alternate_Screw').overrides).toEqual({ Alternate_Screw: false })
  })

  it('leaves the original untouched', () => {
    const original = unlocks([])
    toggleRecipe(original, 'Alternate_Screw')

    expect(original.overrides).toEqual({})
  })
})

describe('withSave', () => {
  it('keeps the marks made by hand when a newer save is loaded', () => {
    const next = withSave(unlocks([], { Alternate_Screw: true }), unlocks(['Alternate_Wire_1']).save!)

    expect(next.save?.recipes).toEqual(['Alternate_Wire_1'])
    expect(next.overrides).toEqual({ Alternate_Screw: true })
  })

  it('starts with no marks on a plan that had no save', () => {
    expect(withSave(undefined, unlocks([]).save!).overrides).toEqual({})
  })
})

describe('the plan on screen', () => {
  const recipes = new Set(['Alternate_Screw', 'NitricAcid'])
  const buildings = new Set(['blender', 'assemblermk1'])

  afterEach(() => setActiveRecipeUnlocks(undefined, recipes, buildings))

  it('locks nothing while it has no save', () => {
    setActiveRecipeUnlocks(undefined, recipes, buildings)

    expect(isActiveRecipeLocked('NitricAcid')).toBe(false)
    expect(isActiveBuildingLocked('blender')).toBe(false)
  })

  it('locks the recipes and buildings the save has not unlocked', () => {
    setActiveRecipeUnlocks(unlocks(['Alternate_Screw'], {}, ['assemblermk1']), recipes, buildings)

    expect(isActiveRecipeLocked('Alternate_Screw')).toBe(false)
    expect(isActiveRecipeLocked('NitricAcid')).toBe(true)
    expect(isActiveBuildingLocked('assemblermk1')).toBe(false)
    expect(isActiveBuildingLocked('blender')).toBe(true)
  })

  it('never locks an id the game data does not know', () => {
    setActiveRecipeUnlocks(unlocks([]), recipes, buildings)

    expect(isActiveRecipeLocked('SomethingNew')).toBe(false)
    expect(isActiveBuildingLocked('somethingnew')).toBe(false)
  })
})

describe('unlocksForArrivingPlan', () => {
  it('takes the arriving plan\'s list when it has one', () => {
    expect(unlocksForArrivingPlan(unlocks(['Alternate_Screw']), unlocks([]))).toEqual(unlocks(['Alternate_Screw']))
  })

  it('states the save as forgotten when a plan without one replaces a plan with one', () => {
    expect(unlocksForArrivingPlan(undefined, unlocks(['Alternate_Screw']))).toEqual({ save: null, overrides: {} })
  })

  it('adds nothing when neither plan had a save', () => {
    expect(unlocksForArrivingPlan(undefined, undefined)).toBeUndefined()
  })
})

describe('rebaseRecipeUnlocks', () => {
  const base = unlocks(['Alternate_Screw'])

  it('lays this client\'s padlock over a peer\'s', () => {
    const merged = rebaseRecipeUnlocks(base, unlocks(['Alternate_Screw'], { A: true }), unlocks(['Alternate_Screw'], { B: false }))

    expect(merged.overrides).toEqual({ A: true, B: false })
  })

  it('keeps the server\'s save unless this client loaded one', () => {
    expect(rebaseRecipeUnlocks(base, unlocks(['Alternate_Screw'], { A: true }), unlocks(['Newer'])).save?.recipes).toEqual(['Newer'])
    expect(rebaseRecipeUnlocks(base, unlocks(['Mine']), unlocks(['Newer'])).save?.recipes).toEqual(['Mine'])
  })

  it('carries a padlock this client took back', () => {
    const merged = rebaseRecipeUnlocks(unlocks([], { A: true }), unlocks([]), unlocks([], { A: true, B: true }))

    expect(merged.overrides).toEqual({ B: true })
  })

  it('lets the local list win whole when the baseline is unknown', () => {
    const local = unlocks(['Mine'], { A: true })

    expect(rebaseRecipeUnlocks(null, local, unlocks(['Newer']))).toBe(local)
  })
})
