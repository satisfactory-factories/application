import vuetify from '@/plugins/vuetify'
import { createPinia, setActivePinia } from 'pinia'
import { mount, VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import PlannerFactory from './PlannerFactory.vue'
import { Factory, FactoryPowerChangeType } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { addPowerProducerToFactory } from '@/utils/factory-management/power'
import { gameData } from '@/utils/gameData'

// The collapsed card is the only view of a factory the planner offers when it is hidden, so
// anything it leaves out is invisible. Power generators were left out entirely: the Producing row
// was built from products alone, and a factory made of nothing but generators called itself empty.
describe('Component: PlannerFactory (collapsed view)', () => {
  let factory: Factory

  const addCoalGenerator = (powerAmount = 75) => addPowerProducerToFactory(factory, {
    building: 'generatorcoal',
    powerAmount,
    recipe: 'GeneratorCoal_Coal',
    updated: FactoryPowerChangeType.Power,
  })

  const mountSubject = (): VueWrapper => {
    calculateFactories([factory], gameData)
    return mount(PlannerFactory, {
      propsData: { factory, helpText: false, totalFactories: 1 },
      global: {
        plugins: [vuetify],
        provide: {
          findFactory: () => factory,
          copyFactory: () => {},
          deleteFactory: () => {},
          moveFactory: () => {},
          navigateToFactory: () => {},
          updateFactory: () => {},
        },
      },
    })
  }

  // The collapsed card is three sibling rows sharing one class, told apart by their label. Reaching
  // for the row by name is what makes "the chip is under Producing" a real assertion rather than
  // "the string appears somewhere on the card".
  const sectionLabelled = (subject: VueWrapper, label: string): Element | undefined =>
    [...subject.element.querySelectorAll('.collapsed-section')]
      .find(section => section.querySelector('.section-label')?.textContent?.trim() === label)

  const producingSection = (subject: VueWrapper): Element => {
    const section = sectionLabelled(subject, 'Producing:')
    if (!section) throw new Error('No Producing section on the collapsed card')
    return section
  }

  // Generators are the green chips; products are blue. Selecting on the colour is deliberate — it
  // is how the row tells power apart from production at a glance.
  const generatorChips = (subject: VueWrapper): Element[] =>
    [...producingSection(subject).querySelectorAll('.sf-chip.green')]

  const chipText = (chip: Element): string => chip.textContent?.replace(/\s+/g, ' ').trim() ?? ''

  beforeEach(() => {
    setActivePinia(createPinia())
    factory = newFactory('Test')
    factory.hidden = true
  })

  describe('the empty-factory message', () => {
    it('is shown for a factory with neither products nor generators', () => {
      expect(mountSubject().text()).toContain('Empty factory!')
    })

    it('is not shown for a factory holding only power generators', () => {
      addCoalGenerator()

      expect(mountSubject().text()).not.toContain('Empty factory!')
    })

    it('gives a power-only factory a real Producing row rather than the message', () => {
      addCoalGenerator()
      const subject = mountSubject()

      expect(sectionLabelled(subject, 'Producing:')).toBeTruthy()
      expect(generatorChips(subject)).toHaveLength(1)
    })
  })

  describe('the generator chip', () => {
    it('names the generator, counts its buildings and states its output', () => {
      addCoalGenerator(75)

      // 75 MW is one Coal-Powered Generator exactly, so the count is checkable rather than rounded.
      expect(chipText(generatorChips(mountSubject())[0])).toBe('Coal-Powered Generator: 1x (+75 MW)')
    })

    it('counts the buildings a larger generator bank needs', () => {
      addCoalGenerator(600)

      expect(chipText(generatorChips(mountSubject())[0])).toBe('Coal-Powered Generator: 8x (+600 MW)')
    })

    it('carries the building icon', () => {
      addCoalGenerator()
      const asset = generatorChips(mountSubject())[0].querySelector('[aria-label="generatorcoal"]')

      expect(asset).toBeTruthy()
    })

    // A building icon on its own reads as a product, as though the factory were manufacturing
    // generators. The bolt-plus in front is what says "power", and it has to lead to do that.
    it('leads with a bolt and a plus, ahead of the building icon', () => {
      addCoalGenerator()
      const chip = generatorChips(mountSubject())[0]

      const bolt = chip.querySelector('.fa-bolt')
      const plus = chip.querySelector('.fa-plus')
      const asset = chip.querySelector('.game-asset-content')

      expect(bolt).toBeTruthy()
      expect(plus).toBeTruthy()
      expect(asset).toBeTruthy()
      // DOCUMENT_POSITION_FOLLOWING: the argument comes later in the document than the subject.
      expect(bolt!.compareDocumentPosition(plus!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(plus!.compareDocumentPosition(asset!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('gives every generator in the factory its own chip', () => {
      addCoalGenerator(75)
      addPowerProducerToFactory(factory, {
        building: 'generatorfuel',
        powerAmount: 750,
        recipe: 'GeneratorFuel_LiquidFuel',
        updated: FactoryPowerChangeType.Power,
      })

      expect(generatorChips(mountSubject()).map(chipText)).toEqual([
        'Coal-Powered Generator: 1x (+75 MW)',
        'Fuel-Powered Generator: 3x (+750 MW)',
      ])
    })

    // Adding a generator creates the row before a building is picked, so the half-filled state is
    // on screen for as long as it takes to use the dropdown.
    it('falls back to a generic name before a building is picked', () => {
      addPowerProducerToFactory(factory, { recipe: '', updated: FactoryPowerChangeType.Power })
      const chip = generatorChips(mountSubject())[0]

      expect(chipText(chip)).toContain('Power Generator')
      expect(chipText(chip)).not.toContain('UNKNOWN BUILDING')
    })
  })

  describe('alongside products', () => {
    it('lists generators after the products, each in its own colour', () => {
      addProductToFactory(factory, { id: 'IronIngot', amount: 100, recipe: 'IngotIron' })
      addCoalGenerator()
      const section = producingSection(mountSubject())

      expect([...section.querySelectorAll('.sf-chip.product')].map(chipText))
        .toEqual([expect.stringContaining('Iron Ingot')])
      expect([...section.querySelectorAll('.sf-chip.green')].map(chipText))
        .toEqual([expect.stringContaining('Coal-Powered Generator')])
    })
  })

  // The row above only draws its divider when something follows it. Keyed on products alone, a
  // power-only factory lost the line between its imports and its generators.
  it('keeps the divider under Importing for a power-only factory', () => {
    addCoalGenerator()
    const subject = mountSubject()

    expect(factory.rawResources).not.toEqual({}) // The coal and water that make the row exist.
    expect(sectionLabelled(subject, 'Importing:')?.classList.contains('border-b-md')).toBe(true)
  })
})
