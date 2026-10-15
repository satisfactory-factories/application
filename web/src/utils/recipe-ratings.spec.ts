import { describe, expect, it } from 'vitest'
import { useGameDataStore } from '@/stores/game-data-store'
import { getRecipeRating, TIER_ORDER } from '@/utils/recipe-ratings'

const gameData = useGameDataStore().getGameData()
const alternates = gameData.recipes.filter(recipe => recipe.displayName.startsWith('Alternate'))

describe('recipe ratings', () => {
  it('rates only alternate recipes that exist in the game data', () => {
    const rated = gameData.recipes.filter(recipe => getRecipeRating(recipe.id))
    expect(rated.every(recipe => recipe.displayName.startsWith('Alternate'))).toBe(true)
    // The post ranks 103 alternates; a regenerated data set that renames one shows up here.
    expect(rated).toHaveLength(103)
  })

  it('maps the post\'s names onto the right recipes', () => {
    const tierOf = (name: string) =>
      getRecipeRating(alternates.find(recipe => recipe.displayName === `Alternate: ${name}`)!.id)

    expect(tierOf('Heavy Encased Frame')).toBe('S')
    expect(tierOf('Steel Screws')).toBe('A')
    expect(tierOf('Cast Screws')).toBe('B')
    expect(tierOf('Iron Wire')).toBe('C')
    expect(tierOf('Iron Pipe')).toBe('D')
    expect(tierOf('Tempered Copper Ingot')).toBe('F')
  })

  it('leaves alternates the post does not rank unrated', () => {
    expect(getRecipeRating('Alternate_Coal_1')).toBeUndefined()
    expect(getRecipeRating('IngotIron')).toBeUndefined()
  })

  it('orders tiers best first', () => {
    expect(TIER_ORDER).toEqual(['S', 'A', 'B', 'C', 'D', 'F'])
  })
})
