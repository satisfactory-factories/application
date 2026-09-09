import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount, VueWrapper } from '@vue/test-utils'
import vuetify from '@/plugins/vuetify'
import AddToPlannerDialog from './AddToPlannerDialog.vue'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { Recipe } from '@/interfaces/Recipes'
import { newFactory } from '@/utils/factory-management/factory'
import { useAppStore } from '@/stores/app-store'
import { useGameDataStore } from '@/stores/game-data-store'
import eventBus from '@/utils/eventBus'

const gameData = useGameDataStore().getGameData()

/**
 * Adding a recipe from Parts & Recipes to a factory that already exists is a product change on a
 * record both sides already hold, so nothing structural announces it and the plural
 * `calculateFactories` this path uses carries payload only. Undeclared, a rebase drops it.
 */
describe('Component: AddToPlannerDialog sync intent', () => {
  let factory: Factory
  let recipe: Recipe
  let emit: ReturnType<typeof vi.spyOn>

  const mountSubject = () =>
    mount(AddToPlannerDialog, {
      props: { modelValue: true, recipe },
      global: {
        plugins: [vuetify],
        stubs: { AppDialog: { template: '<div><slot /><slot name="actions" /></div>' } },
      },
    })

  const clickAdd = async (subject: VueWrapper, name: string) => {
    const button = subject.findAll('button').find(entry => entry.attributes('title') === `Add to ${name}`)
    if (!button) throw new Error(`no "Add to ${name}" button`)
    await button.trigger('click')
    // The handler yields a frame before the recalculation so the spinner can paint.
    await new Promise(resolve => setTimeout(resolve, 80))
  }

  // mitt's emit is overloaded on the event name, so the recorded calls need widening
  // before they can be read back as a plain list of pairs.
  const edited = () => (emit.mock.calls as unknown as [string, Factory][])
    .filter(([event]) => event === 'factoryEdited')
    .map(([, edit]) => edit.id)

  beforeEach(() => {
    localStorage.removeItem('factoryTabs')
    setActivePinia(createPinia())

    factory = newFactory('Smelting', 0, 1)
    recipe = gameData.recipes.find(entry => entry.id === 'IngotIron') as Recipe

    const appStore = useAppStore()
    appStore.getCurrentTab().factories = [factory]
    appStore.getFactories()

    emit = vi.spyOn(eventBus, 'emit')
  })

  it('declares the factory it added the recipe to', async () => {
    const subject = mountSubject()

    await clickAdd(subject, 'Smelting')

    expect(factory.products.some(product => product.recipe === 'IngotIron')).toBe(true)
    expect(edited()).toContain(factory.id)
  })
})
