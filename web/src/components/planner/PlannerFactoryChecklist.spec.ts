import vuetify from '@/plugins/vuetify'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick, reactive } from 'vue'
import PlannerFactoryChecklist from './PlannerFactoryChecklist.vue'
import { calculateFactory, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { useChecklistDisplay } from '@/composables/useChecklistDisplay'
import { useGameDataStore } from '@/stores/game-data-store'
import { Factory } from '@/interfaces/planner/FactoryInterface'

const gameData = useGameDataStore().getGameData()

describe('PlannerFactoryChecklist intermediates', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useChecklistDisplay().showIntermediates.value = true
    useChecklistDisplay().showPlanned.value = true
  })

  const mountChecklist = (factory: Factory) => mount(PlannerFactoryChecklist, {
    propsData: { factory },
    global: {
      plugins: [vuetify],
      provide: { findFactory: () => factory, navigateToFactory: () => {} },
    },
  })

  const rows = (wrapper: ReturnType<typeof mount>) =>
    wrapper.findAll('[data-testid="checklist-product-row"]').map(row =>
      `${row.attributes('data-depth')}:${row.find('.checklist-jump').text()}`)

  const plateFactory = () => {
    const factory = reactive(newFactory('Plates', 0, 1)) as Factory
    addProductToFactory(factory, { id: 'IronPlate', amount: 30, recipe: 'IronPlate' })
    addProductToFactory(factory, { id: 'IronIngot', amount: 45, recipe: 'IngotIron' })
    calculateFactory(factory, [factory], gameData)
    return factory
  }

  it('indents the intermediate under its consumer and shows each planned rate', () => {
    const wrapper = mountChecklist(plateFactory())

    expect(rows(wrapper)).toEqual(['0:Iron Plate', '1:Iron Ingot'])
    expect(wrapper.findAll('[data-testid="checklist-product-row"] .planned-col').map(cell => cell.text()))
      .toEqual(['30/min', '45/min'])
  })

  it('hides intermediates when the switch is off, and says how many', async () => {
    const wrapper = mountChecklist(plateFactory())

    useChecklistDisplay().showIntermediates.value = false
    await nextTick()

    expect(rows(wrapper)).toEqual(['0:Iron Plate'])
    expect(wrapper.text()).toContain('1 intermediate line hidden.')

    await wrapper.find('[data-testid="checklist-show-intermediates"]').trigger('click')

    expect(rows(wrapper)).toEqual(['0:Iron Plate', '1:Iron Ingot'])
    expect(useChecklistDisplay().showIntermediates.value).toBe(true)
  })

  it('offers no switch when the factory has no intermediates', () => {
    const factory = reactive(newFactory('Ingots', 0, 1)) as Factory
    addProductToFactory(factory, { id: 'IronIngot', amount: 30, recipe: 'IngotIron' })
    calculateFactory(factory, [factory], gameData)

    expect(mountChecklist(factory).find('[data-testid="checklist-intermediates-toggle"]').exists()).toBe(false)
  })

  it('hides the Planned column when the switch is off', async () => {
    const wrapper = mountChecklist(plateFactory())

    useChecklistDisplay().showPlanned.value = false
    await nextTick()

    expect(wrapper.findAll('.planned-col')).toHaveLength(0)
    expect(rows(wrapper)).toEqual(['0:Iron Plate', '1:Iron Ingot'])
  })
})
