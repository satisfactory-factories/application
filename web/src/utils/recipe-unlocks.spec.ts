import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { RecipeUnlocks } from '@/interfaces/planner/FactoryInterface'
import type { WorldSnapshot } from '@/utils/game-save/world-snapshot'
import {
  isActiveRecipeLocked,
  isAlternateOverridden,
  isAlternateUnlocked,
  saveFromWorld,
  setActiveRecipeUnlocks,
  toggleAlternate,
  unlockedAlternatesFromWorld,
  withSave,
} from '@/utils/recipe-unlocks'
import { fetchGameData } from '@/utils/gameDataService'

const progressed = JSON.parse(
  readFileSync(join(__dirname, '../../testing/fixtures/worlds/progressed.json'), 'utf-8')
) as WorldSnapshot

const alternateIds = (await fetchGameData()).recipes.filter(recipe => recipe.isAlternate).map(recipe => recipe.id)

const unlocks = (alternates: string[], overrides: Record<string, boolean> = {}): RecipeUnlocks => ({
  save: { name: 'Test', readAt: '2026-10-15T00:00:00.000Z', alternates },
  overrides,
})

describe('unlockedAlternatesFromWorld', () => {
  it('maps the save\'s prefixless names onto the game data\'s recipe ids', () => {
    const unlocked = unlockedAlternatesFromWorld(progressed, alternateIds)

    // 52 in the save, less Turbofuel (an `Alternate_` id the game data counts as standard),
    // plus Pure Aluminum Ingot below.
    expect(unlocked).toHaveLength(52)
    expect(unlocked).toContain('Alternate_SteelRod')
    expect(unlocked).toContain('Alternate_Screw_2')
  })

  // Pure Aluminum Ingot is an alternate with no `Alternate_` prefix, so the save lists it with
  // the standard recipes. Trusting the prefix alone would read it as locked forever.
  it('finds an alternate the game names without the prefix', () => {
    expect(unlockedAlternatesFromWorld(progressed, alternateIds)).toContain('PureAluminumIngot')
  })

  it('keeps only alternates, never the standard recipes the save also lists', () => {
    const unlocked = unlockedAlternatesFromWorld(progressed, alternateIds)

    expect(unlocked).not.toContain('IronPlate')
    expect(unlocked.every(id => alternateIds.includes(id))).toBe(true)
  })
})

describe('saveFromWorld', () => {
  it('keeps the session name and when it was read', () => {
    const save = saveFromWorld({ ...progressed, saveName: 'My World' }, alternateIds)

    expect(save.name).toBe('My World')
    expect(save.readAt).toBe(progressed.readAt)
  })
})

describe('isAlternateUnlocked', () => {
  it('counts every recipe as unlocked until a save is loaded', () => {
    expect(isAlternateUnlocked(undefined, 'Alternate_Screw')).toBe(true)
    expect(isAlternateUnlocked({ save: null, overrides: { Alternate_Screw: false } }, 'Alternate_Screw')).toBe(true)
  })

  it('reads the save once one is loaded', () => {
    expect(isAlternateUnlocked(unlocks(['Alternate_Screw']), 'Alternate_Screw')).toBe(true)
    expect(isAlternateUnlocked(unlocks(['Alternate_Screw']), 'Alternate_Wire_1')).toBe(false)
  })

  it('lets a mark made by hand win over the save', () => {
    expect(isAlternateUnlocked(unlocks([], { Alternate_Screw: true }), 'Alternate_Screw')).toBe(true)
    expect(isAlternateUnlocked(unlocks(['Alternate_Screw'], { Alternate_Screw: false }), 'Alternate_Screw')).toBe(false)
  })
})

describe('toggleAlternate', () => {
  it('marks a locked alternate unlocked by hand', () => {
    const next = toggleAlternate(unlocks([]), 'Alternate_Screw')

    expect(isAlternateUnlocked(next, 'Alternate_Screw')).toBe(true)
    expect(isAlternateOverridden(next, 'Alternate_Screw')).toBe(true)
  })

  // Otherwise the mark outlives its reason and the next save can never decide the recipe again.
  it('drops the mark when toggling back to what the save says', () => {
    const next = toggleAlternate(toggleAlternate(unlocks([]), 'Alternate_Screw'), 'Alternate_Screw')

    expect(next.overrides).toEqual({})
    expect(isAlternateUnlocked(next, 'Alternate_Screw')).toBe(false)
  })

  it('can lock an alternate the save has unlocked', () => {
    const next = toggleAlternate(unlocks(['Alternate_Screw']), 'Alternate_Screw')

    expect(next.overrides).toEqual({ Alternate_Screw: false })
  })

  it('leaves the original untouched', () => {
    const original = unlocks([])
    toggleAlternate(original, 'Alternate_Screw')

    expect(original.overrides).toEqual({})
  })
})

describe('withSave', () => {
  it('keeps the marks made by hand when a newer save is loaded', () => {
    const next = withSave(unlocks([], { Alternate_Screw: true }), unlocks(['Alternate_Wire_1']).save!)

    expect(next.save?.alternates).toEqual(['Alternate_Wire_1'])
    expect(next.overrides).toEqual({ Alternate_Screw: true })
  })

  it('starts with no marks on a plan that had no save', () => {
    expect(withSave(undefined, unlocks([]).save!).overrides).toEqual({})
  })
})

describe('isActiveRecipeLocked', () => {
  const alternates = new Set(['Alternate_Screw', 'Alternate_Wire_1'])

  afterEach(() => setActiveRecipeUnlocks(undefined, alternates))

  it('locks nothing while the plan on screen has no save', () => {
    setActiveRecipeUnlocks(undefined, alternates)

    expect(isActiveRecipeLocked('Alternate_Screw')).toBe(false)
  })

  it('locks the alternates the save has not unlocked', () => {
    setActiveRecipeUnlocks(unlocks(['Alternate_Screw']), alternates)

    expect(isActiveRecipeLocked('Alternate_Screw')).toBe(false)
    expect(isActiveRecipeLocked('Alternate_Wire_1')).toBe(true)
  })

  it('never locks a standard recipe', () => {
    setActiveRecipeUnlocks(unlocks([]), alternates)

    expect(isActiveRecipeLocked('Screw')).toBe(false)
  })
})
