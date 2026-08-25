// Regression coverage for #592/#593: a checklist tick has to (a) update itself the moment it's
// clicked, and (b) stay in sync with the other place the same tick is drawn — the per-item
// checkbox on the Products/Imports/Satisfaction row, and the summary checkbox in the top-of-card
// Checklist panel (PlannerFactoryChecklist.vue) — in both directions.
//
// A `@click.prevent`-controlled native checkbox can lose a race against the browser's own
// "revert to pre-click state" step (part of canceling a checkbox's default action), leaving the
// tick visually stuck even though the underlying state did flip. Every checklist checkbox in this
// codebase now keys its `<input>` on the checked value itself, forcing Vue to mount a fresh
// element at the new value instead of patching a possibly-just-reverted one; see the comment
// beside each `:key` for the mechanism.
//
// jsdom's own checkbox click-then-revert timing does not reliably match a real browser's (verified
// separately against real Chromium via Puppeteer), so these tests drive the click through Vue's
// handler with `trigger('click')` — which exercises the click handler and the resulting reactive
// re-render, the part that IS meaningfully testable here — rather than asserting on the exact
// native revert race, which isn't.
import vuetify from '@/plugins/vuetify'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import Product from './products/Product.vue'
import Imports from './imports/Imports.vue'
import PlannerFactorySatisfactionItems from './PlannerFactorySatisfactionItems.vue'
import PlannerFactoryChecklist from './PlannerFactoryChecklist.vue'
import { calculateFactories, calculateFactory, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { addInputToFactory } from '@/utils/factory-management/inputs'
import { useGameDataStore } from '@/stores/game-data-store'
import { Factory } from '@/interfaces/planner/FactoryInterface'

const gameData = useGameDataStore().getGameData()

// Fresh query every time on purpose: a checked-value-keyed checkbox is swapped for a new DOM
// node on toggle, so a wrapper reference captured before the click can go stale and silently
// keep pointing at the discarded node. A real viewer only ever sees the current DOM, so tests
// have to re-find the element after every state change too.
const findTick = (wrapper: ReturnType<typeof mount>) => wrapper.find('input.checklist-tick')

// PlannerFactoryChecklist.vue renders one `.checklist-group` per item type (Products, Power
// Producers, Imports, Exports) — a factory under test can easily have more than one (an export
// chip needs a product to export in the first place), so picking "the first checklist-group" is
// not safe. Find the one titled `groupTitle` and return its tick.
const findTickInGroup = (wrapper: ReturnType<typeof mount>, groupTitle: string) => {
  const group = wrapper.findAll('.checklist-group')
    .find(g => g.find('.checklist-group-title').text() === groupTitle)
  if (!group) {
    throw new Error(`No "${groupTitle}" checklist-group found. Groups present: ${
      wrapper.findAll('.checklist-group-title').map(t => t.text()).join(', ')}`)
  }
  return group.find('input.checklist-tick')
}

const isChecked = (tick: ReturnType<typeof findTick>) => (tick.element as HTMLInputElement).checked

describe('checklist checkbox reactivity', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('Products', () => {
    const mountBoth = (factory: Factory) => {
      const global = {
        plugins: [vuetify],
        provide: {
          getBuildingDisplayName: (x: any) => x,
          updateFactory: () => { calculateFactory(factory, [factory], gameData) },
          findFactory: () => factory,
          navigateToFactory: () => {},
        },
      }
      const product = mount(Product, { propsData: { factory }, global })
      const checklist = mount(PlannerFactoryChecklist, { propsData: { factory }, global })
      return { product, checklist }
    }

    const buildFactory = () => {
      const factory = reactive(newFactory('Product test', 0, 1)) as Factory
      addProductToFactory(factory, { id: 'IronIngot', amount: 30, recipe: 'IngotIron' })
      calculateFactory(factory, [factory], gameData)
      factory.checklistEnabled = true
      return factory
    }

    it('ticking the product row updates its own checkbox', async () => {
      const factory = buildFactory()
      const { product } = mountBoth(factory)

      expect(isChecked(findTick(product))).toBe(false)
      await findTick(product).trigger('click')

      expect(factory.products[0].completed).toBe(true)
      expect(isChecked(findTick(product))).toBe(true)
    })

    it('ticking the product row syncs to the Checklist panel', async () => {
      const factory = buildFactory()
      const { product, checklist } = mountBoth(factory)

      await findTick(product).trigger('click')
      await checklist.vm.$nextTick()

      expect(isChecked(findTickInGroup(checklist, 'Products'))).toBe(true)
    })

    it('ticking the Checklist panel syncs to the product row', async () => {
      const factory = buildFactory()
      const { product, checklist } = mountBoth(factory)

      await findTickInGroup(checklist, 'Products').trigger('click')
      await product.vm.$nextTick()

      expect(factory.products[0].completed).toBe(true)
      expect(isChecked(findTick(product))).toBe(true)
    })

    it('un-ticking round-trips cleanly in both directions', async () => {
      const factory = buildFactory()
      const { product, checklist } = mountBoth(factory)

      await findTick(product).trigger('click') // check
      await findTick(product).trigger('click') // uncheck
      await checklist.vm.$nextTick()

      expect(factory.products[0].completed).toBe(false)
      expect(isChecked(findTick(product))).toBe(false)
      expect(isChecked(findTickInGroup(checklist, 'Products'))).toBe(false)
    })
  })

  describe('Imports', () => {
    const mountBoth = (factory: Factory) => {
      const global = {
        plugins: [vuetify],
        provide: {
          updateFactory: () => { calculateFactory(factory, [factory], gameData) },
          findFactory: () => factory,
          navigateToFactory: () => {},
        },
      }
      const imports = mount(Imports, { propsData: { factory }, global })
      const checklist = mount(PlannerFactoryChecklist, { propsData: { factory }, global })
      return { imports, checklist }
    }

    const buildFactory = () => {
      const factory = reactive(newFactory('Imports test', 0, 1)) as Factory
      // A dangling input (no real supplying factory) gets pruned by calculateFactories'
      // flushInvalidRequests pass, so the import needs a genuine producer to resolve against.
      const producer = reactive(newFactory('Iron Ingots', 0, 2)) as Factory
      addProductToFactory(producer, { id: 'IronIngot', amount: 1000, recipe: 'IngotIron' })
      addProductToFactory(factory, { id: 'IronPlate', amount: 100, recipe: 'IronPlate' })
      addInputToFactory(factory, { factoryId: producer.id, outputPart: 'IronIngot', amount: 200 })
      calculateFactories([producer, factory], gameData)
      factory.checklistEnabled = true
      return factory
    }

    it('ticking the import row updates its own checkbox', async () => {
      const factory = buildFactory()
      const { imports } = mountBoth(factory)

      expect(isChecked(findTick(imports))).toBe(false)
      await findTick(imports).trigger('click')

      expect(factory.inputs[0].completed).toBe(true)
      expect(isChecked(findTick(imports))).toBe(true)
    })

    it('ticking the import row syncs to the Checklist panel', async () => {
      const factory = buildFactory()
      const { imports, checklist } = mountBoth(factory)

      await findTick(imports).trigger('click')
      await checklist.vm.$nextTick()

      expect(isChecked(findTickInGroup(checklist, 'Imports'))).toBe(true)
    })

    it('ticking the Checklist panel syncs to the import row', async () => {
      const factory = buildFactory()
      const { imports, checklist } = mountBoth(factory)

      await findTickInGroup(checklist, 'Imports').trigger('click')
      await imports.vm.$nextTick()

      expect(factory.inputs[0].completed).toBe(true)
      expect(isChecked(findTick(imports))).toBe(true)
    })
  })

  describe('Exports', () => {
    const mountBoth = (producer: Factory, consumer: Factory) => {
      const factories = [producer, consumer]
      const global = {
        plugins: [vuetify],
        provide: {
          updateFactory: () => {},
          findFactory: (id: string | number) => factories.find(f => f.id === Number(id)) as Factory,
          navigateToFactory: () => {},
        },
      }
      const satisfaction = mount(PlannerFactorySatisfactionItems, { propsData: { factory: producer }, global })
      const checklist = mount(PlannerFactoryChecklist, { propsData: { factory: producer }, global })
      return { satisfaction, checklist }
    }

    const buildFactories = () => {
      const producer = reactive(newFactory('Iron Ingots', 0, 1)) as Factory
      const consumer = reactive(newFactory('Iron Plates', 0, 2)) as Factory
      addProductToFactory(producer, { id: 'IronIngot', amount: 1000, recipe: 'IngotIron' })
      addProductToFactory(consumer, { id: 'IronPlate', amount: 500, recipe: 'IronPlate' })
      addInputToFactory(consumer, { factoryId: producer.id, outputPart: 'IronIngot', amount: 500 })
      calculateFactories([producer, consumer], gameData)
      producer.checklistEnabled = true
      return { producer, consumer }
    }

    it('ticking the export chip checkbox updates its own checkbox', async () => {
      const { producer, consumer } = buildFactories()
      const { satisfaction } = mountBoth(producer, consumer)

      expect(isChecked(findTick(satisfaction))).toBe(false)
      await findTick(satisfaction).trigger('click')

      expect(producer.checklistExports['2:IronIngot']).toBe(true)
      expect(isChecked(findTick(satisfaction))).toBe(true)
    })

    it('ticking the export chip checkbox syncs to the Checklist panel', async () => {
      const { producer, consumer } = buildFactories()
      const { satisfaction, checklist } = mountBoth(producer, consumer)

      await findTick(satisfaction).trigger('click')
      await checklist.vm.$nextTick()

      expect(isChecked(findTickInGroup(checklist, 'Exports'))).toBe(true)
    })

    it('ticking the Checklist panel syncs to the export chip checkbox', async () => {
      const { producer, consumer } = buildFactories()
      const { satisfaction, checklist } = mountBoth(producer, consumer)

      await findTickInGroup(checklist, 'Exports').trigger('click')
      await satisfaction.vm.$nextTick()

      expect(producer.checklistExports['2:IronIngot']).toBe(true)
      expect(isChecked(findTick(satisfaction))).toBe(true)
    })

    it('clicking the export chip checkbox does not also open the Export Calculator', async () => {
      // #592: the checkbox used to live inside the chip's own clickable area, so a click meant
      // for the tick could also fire the chip's own @click (which opens the calculator tray).
      const { producer, consumer } = buildFactories()
      const { satisfaction } = mountBoth(producer, consumer)

      await findTick(satisfaction).trigger('click')

      expect(satisfaction.find('.calculator-row').exists()).toBe(false)
    })
  })
})
