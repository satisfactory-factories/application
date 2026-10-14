// The Ignore checkbox under the "Will cause backlog" chip, and its twin under "No demand". The rules behind it (what counts as a
// backlog, what stops the factory turning amber) live in disposal.spec.ts; this covers what the
// row does with them: the chip's title and look, the checkbox beneath it, and that ticking it
// goes through updateFactory so the choice is a real edit.
import vuetify from '@/plugins/vuetify'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import PlannerFactorySatisfactionItems from './PlannerFactorySatisfactionItems.vue'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { useGameDataStore } from '@/stores/game-data-store'
import { usePlannerOptions } from '@/composables/usePlannerOptions'
import { isBacklogIgnored, isNoDemandIgnored } from '@/utils/factory-management/disposal'
import { Factory } from '@/interfaces/planner/FactoryInterface'

const gameData = useGameDataStore().getGameData()

const IGNORE_TICK = 'input[id$="-ignore-backlog"]'
const NO_DEMAND_TICK = 'input[id$="-ignore-no-demand"]'

describe('PlannerFactorySatisfactionItems backlog ignore', () => {
  let updateFactory: ReturnType<typeof vi.fn>

  // 100/min of plates that nothing consumes: the whole output is surplus, but zero demand is the
  // no-demand note's case, so a consumer taking part of it is what makes this a backlog.
  const buildBacklogFactory = () => {
    const producer = reactive(newFactory('Plates', 0, 1)) as Factory
    const consumer = reactive(newFactory('Reinforced', 0, 2)) as Factory
    addProductToFactory(producer, { id: 'IronPlate', amount: 100, recipe: 'IronPlate' })
    addProductToFactory(consumer, { id: 'IronPlateReinforced', amount: 10, recipe: 'IronPlateReinforced' })
    consumer.inputs.push({ factoryId: producer.id, outputPart: 'IronPlate', amount: 60 })
    calculateFactories([producer, consumer], gameData)
    return producer
  }

  const mountItems = (factory: Factory) => mount(PlannerFactorySatisfactionItems, {
    propsData: { factory },
    global: {
      plugins: [vuetify],
      provide: {
        updateFactory,
        findFactory: () => factory,
        navigateToFactory: () => {},
      },
    },
  })

  const plateRow = (wrapper: ReturnType<typeof mountItems>) =>
    wrapper.find('[id$="-satisfaction-item-IronPlate"]')

  beforeEach(() => {
    setActivePinia(createPinia())
    usePlannerOptions().value.showBacklogAdvisory = true
    updateFactory = vi.fn()
  })

  it('shows the warning with an unticked Ignore checkbox inside the chip, beneath its title', () => {
    const wrapper = mountItems(buildBacklogFactory())
    const row = plateRow(wrapper)

    expect(row.text()).toContain('Will cause backlog')
    expect(row.text()).not.toContain('Backlog ignored')
    expect(row.find('.status-warning').exists()).toBe(true)
    expect(row.find('.status-warning-ignored').exists()).toBe(false)

    const tick = row.find(IGNORE_TICK)
    expect(tick.exists()).toBe(true)
    expect((tick.element as HTMLInputElement).checked).toBe(false)
    // Part of the warning rather than beside it, so the chip itself is what holds it.
    expect(tick.element.closest('.v-chip')?.textContent).toContain('Will cause backlog')
  })

  it('ticking it records the choice, recalculates, and retitles the chip as ignored', async () => {
    const factory = buildBacklogFactory()
    const wrapper = mountItems(factory)

    await plateRow(wrapper).find(IGNORE_TICK).setValue(true)

    expect(isBacklogIgnored(factory, 'IronPlate')).toBe(true)
    expect(updateFactory).toHaveBeenCalledWith(factory)

    const row = plateRow(wrapper)
    expect(row.text()).toContain('Backlog ignored')
    expect(row.text()).not.toContain('Will cause backlog')
    // Stood down, not removed: the dashed no-fill chip, and the checkbox stays inside it to undo it.
    expect(row.find('.status-warning-ignored').exists()).toBe(true)
    expect(row.find('.status-warning-ignored').find(IGNORE_TICK).exists()).toBe(true)
    expect(row.find('.status-warning').exists()).toBe(false)
    expect((row.find(IGNORE_TICK).element as HTMLInputElement).checked).toBe(true)
  })

  it('unticking brings the warning back', async () => {
    const factory = buildBacklogFactory()
    const wrapper = mountItems(factory)

    await plateRow(wrapper).find(IGNORE_TICK).setValue(true)
    await plateRow(wrapper).find(IGNORE_TICK).setValue(false)

    expect(isBacklogIgnored(factory, 'IronPlate')).toBe(false)
    expect(plateRow(wrapper).text()).toContain('Will cause backlog')
    expect(updateFactory).toHaveBeenCalledTimes(2)
  })

  it('offers neither chip nor checkbox when the advisory option is off', () => {
    usePlannerOptions().value.showBacklogAdvisory = false
    const wrapper = mountItems(buildBacklogFactory())

    expect(plateRow(wrapper).text()).not.toContain('backlog')
    expect(plateRow(wrapper).find(IGNORE_TICK).exists()).toBe(false)
  })
})

describe('PlannerFactorySatisfactionItems no demand ignore', () => {
  let updateFactory: ReturnType<typeof vi.fn>

  // 100/min of plates that nothing asks for at all: the no demand note's case.
  const buildNoDemandFactory = () => {
    const factory = reactive(newFactory('Plates', 0, 1)) as Factory
    addProductToFactory(factory, { id: 'IronPlate', amount: 100, recipe: 'IronPlate' })
    calculateFactories([factory], gameData)
    return factory
  }

  const mountItems = (factory: Factory) => mount(PlannerFactorySatisfactionItems, {
    propsData: { factory },
    global: {
      plugins: [vuetify],
      provide: {
        updateFactory,
        findFactory: () => factory,
        navigateToFactory: () => {},
      },
    },
  })

  const plateRow = (wrapper: ReturnType<typeof mountItems>) =>
    wrapper.find('[id$="-satisfaction-item-IronPlate"]')

  beforeEach(() => {
    setActivePinia(createPinia())
    updateFactory = vi.fn()
  })

  it('shows the note with an unticked Ignore checkbox inside the chip', () => {
    const row = plateRow(mountItems(buildNoDemandFactory()))

    expect(row.text()).toContain('No demand')
    expect(row.text()).not.toContain('No demand ignored')
    expect(row.find('.status-note-ignored').exists()).toBe(false)

    const tick = row.find(NO_DEMAND_TICK)
    expect((tick.element as HTMLInputElement).checked).toBe(false)
    expect(tick.element.closest('.v-chip')?.classList.contains('status-note')).toBe(true)
  })

  it('ticking it records the choice, recalculates, and stands the chip down; unticking undoes it', async () => {
    const factory = buildNoDemandFactory()
    const wrapper = mountItems(factory)

    await plateRow(wrapper).find(NO_DEMAND_TICK).setValue(true)

    expect(isNoDemandIgnored(factory, 'IronPlate')).toBe(true)
    expect(updateFactory).toHaveBeenCalledWith(factory)
    expect(plateRow(wrapper).text()).toContain('No demand ignored')
    expect(plateRow(wrapper).find('.status-note-ignored').find(NO_DEMAND_TICK).exists()).toBe(true)

    await plateRow(wrapper).find(NO_DEMAND_TICK).setValue(false)

    expect(isNoDemandIgnored(factory, 'IronPlate')).toBe(false)
    expect(plateRow(wrapper).text()).not.toContain('No demand ignored')
    expect(updateFactory).toHaveBeenCalledTimes(2)
  })
})
