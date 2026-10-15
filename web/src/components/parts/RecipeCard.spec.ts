import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import vuetify from '@/plugins/vuetify'
import RecipeCard from './RecipeCard.vue'
import { Recipe } from '@/interfaces/Recipes'
import { useGameDataStore } from '@/stores/game-data-store'

const gameData = useGameDataStore().getGameData()
const recipeById = (id: string) => gameData.recipes.find(entry => entry.id === id) as Recipe

const mountCard = (id: string) => mount(RecipeCard, {
  props: { recipe: recipeById(id) },
  global: {
    plugins: [vuetify],
    stubs: { AddToPlannerDialog: true, GameAsset: true },
  },
})

describe('Component: RecipeCard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('drops the "Alternate: " prefix, leaving the stored name alone', () => {
    const card = mountCard('Alternate_SloppyAlumina')

    expect(card.find('[data-testid="recipe-card-name"]').text()).toBe('Sloppy Alumina')
    expect(card.text()).toContain('Alternate')
    expect(recipeById('Alternate_SloppyAlumina').displayName).toBe('Alternate: Sloppy Alumina')
  })

  it('shows the tier from the alternate recipe ranking', () => {
    expect(mountCard('Alternate_SloppyAlumina').find('[data-testid="recipe-card-tier-S"]').text()).toContain('S tier')
    expect(mountCard('Alternate_AILimiter_Plastic').find('[data-testid="recipe-card-tier-A"]').exists()).toBe(true)
  })

  it('shows no tier on a standard recipe', () => {
    const card = mountCard('IngotIron')

    expect(card.find('[data-testid="recipe-card-name"]').text()).toBe('Iron Ingot')
    expect(card.find('[data-testid^="recipe-card-tier-"]').exists()).toBe(false)
  })
})
