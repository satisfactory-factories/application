import vuetify from '@/plugins/vuetify'
import { createPinia, setActivePinia } from 'pinia'
import { mount, VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FactorySummaryTable from './FactorySummaryTable.vue'
import { Factory, FactoryPowerChangeType } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { addPowerProducerToFactory } from '@/utils/factory-management/power'
import { gameData } from '@/utils/gameData'
import Tooltip from '@/components/tooltip.vue'

// The Products column was built from factory.products alone, so a factory of nothing but power
// generators had an empty cell — reading, in a table meant to summarise the plan, as a factory
// that does nothing.
describe('Component: FactorySummaryTable (Products column)', () => {
  let factory: Factory

  const addCoalGenerator = (powerAmount = 600) => addPowerProducerToFactory(factory, {
    building: 'generatorcoal',
    powerAmount,
    recipe: 'GeneratorCoal_Coal',
    updated: FactoryPowerChangeType.Power,
  })

  // The table defers its real rows behind two animation frames so the skeleton paints first.
  // Tests need the rows, so both frames are run synchronously.
  const mountSubject = async (): Promise<VueWrapper> => {
    calculateFactories([factory], gameData)
    const subject = mount(FactorySummaryTable, {
      propsData: { rows: [factory], allFactories: [factory], statuses: new Map() },
      global: { plugins: [vuetify] },
    })
    await vi.waitUntil(() => subject.find('tbody tr.hover').exists(), { timeout: 2000 })
    return subject
  }

  // Products are blue, generators green — the third cell is the Products column.
  const productsCell = (subject: VueWrapper): Element => {
    const cell = subject.element.querySelectorAll('tbody tr td')[2]
    if (!cell) throw new Error('No Products cell rendered')
    return cell
  }

  const chipTexts = (subject: VueWrapper, colour: string): string[] =>
    [...productsCell(subject).querySelectorAll(`.summary-chip.${colour}`)]
      .map(chip => chip.textContent?.replace(/\s+/g, ' ').trim() ?? '')

  beforeEach(() => {
    setActivePinia(createPinia())
    factory = newFactory('Test')
  })

  it('leaves the Products column empty for a factory with nothing in it', async () => {
    expect(chipTexts(await mountSubject(), 'blue')).toEqual([])
    expect(chipTexts(await mountSubject(), 'green')).toEqual([])
  })

  it('states a power-only factory’s output rather than showing an empty cell', async () => {
    addCoalGenerator(600)

    expect(chipTexts(await mountSubject(), 'green')).toEqual(['600 MW'])
  })

  it('lists a generator alongside the products, each in its own colour', async () => {
    addProductToFactory(factory, { id: 'IronIngot', amount: 100, recipe: 'IngotIron' })
    addCoalGenerator(600)
    const subject = await mountSubject()

    expect(chipTexts(subject, 'blue')).toEqual(['100/min'])
    expect(chipTexts(subject, 'green')).toEqual(['600 MW'])
  })

  it('gives every generator its own chip', async () => {
    addCoalGenerator(600)
    addPowerProducerToFactory(factory, {
      building: 'generatorfuel',
      powerAmount: 750,
      recipe: 'GeneratorFuel_LiquidFuel',
      updated: FactoryPowerChangeType.Power,
    })

    expect(chipTexts(await mountSubject(), 'green')).toEqual(['600 MW', '750 MW'])
  })

  // The "+" is an icon rather than text, so the chip's text cannot prove it survived.
  it('leads the chip with a bolt and a plus, ahead of the building icon', async () => {
    addCoalGenerator(600)
    const chip = productsCell(await mountSubject()).querySelector('.summary-chip.green')!

    const bolt = chip.querySelector('.fa-bolt')
    const plus = chip.querySelector('.fa-plus')
    const asset = chip.querySelector('.game-asset-content')

    expect(bolt).toBeTruthy()
    expect(plus).toBeTruthy()
    expect(asset).toBeTruthy()
    expect(bolt!.compareDocumentPosition(plus!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(plus!.compareDocumentPosition(asset!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  // The chip itself only has room for the MW, so the name and count live in the hover.
  it('names the generator and counts its buildings in the tooltip', async () => {
    addCoalGenerator(600)
    const subject = await mountSubject()

    const tip = subject.findAllComponents(Tooltip)
      .map(wrapper => wrapper.props('text') as string)
      .find(text => text.includes('Coal-Powered Generator'))

    expect(tip).toBeDefined()
    expect(tip).toContain('8x') // 600 MW is eight Coal-Powered Generators.
    expect(tip).toContain('600\u00A0MW')
  })
})
