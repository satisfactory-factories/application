import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount, VueWrapper } from '@vue/test-utils'
import vuetify from '@/plugins/vuetify'
import AddShortageDialog from './AddShortageDialog.vue'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { addProductToFactory } from '@/utils/factory-management/products'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { useAppStore } from '@/stores/app-store'
import { useGameDataStore } from '@/stores/game-data-store'
import eventBus from '@/utils/eventBus'

const gameData = useGameDataStore().getGameData()

/**
 * "Add this shortage to another factory" writes to two factories that both already exist: a
 * product on the target and an import on the one that was short. Neither is structural, and the
 * plural `calculateFactories` this path uses announces payload only — so without an explicit
 * declaration a rebase throws both away and the shortage comes back.
 */
describe('Component: AddShortageDialog sync intent', () => {
  let shortage: Factory
  let target: Factory
  let emit: ReturnType<typeof vi.spyOn>

  const mountSubject = () =>
    mount(AddShortageDialog, {
      props: { modelValue: true, factory: shortage, partId: 'IronIngot' },
      global: {
        plugins: [vuetify],
        stubs: { AppDialog: { template: '<div><slot /><slot name="actions" /></div>' } },
        provide: { navigateToFactory: () => {} },
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
    .map(([, factory]) => factory.id)

  beforeEach(() => {
    localStorage.removeItem('factoryTabs')
    setActivePinia(createPinia())

    shortage = newFactory('Assembly', 0, 1)
    target = newFactory('Smelting', 1, 2)
    addProductToFactory(shortage, { id: 'IronPlate', amount: 60, recipe: 'IronPlate' })
    calculateFactories([shortage, target], gameData)

    const appStore = useAppStore()
    appStore.getCurrentTab().factories = [shortage, target]
    appStore.getFactories()

    emit = vi.spyOn(eventBus, 'emit')
  })

  it('declares both factories it changed', async () => {
    const subject = mountSubject()

    await clickAdd(subject, 'Smelting')

    expect(target.products.some(product => product.id === 'IronIngot')).toBe(true)
    expect(shortage.inputs.some(input => input.outputPart === 'IronIngot')).toBe(true)
    expect(edited()).toEqual(expect.arrayContaining([target.id, shortage.id]))
  })
})
