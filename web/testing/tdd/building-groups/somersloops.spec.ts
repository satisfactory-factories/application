import { VueWrapper } from '@vue/test-utils'
import { reactive } from 'vue'
import { beforeEach, describe, expect, test } from 'vitest'
import Product from '../../../src/components/planner/products/Product.vue'
import { calculateFactories, newFactory } from '../../../src/utils/factory-management/factory'
import { addProductToFactory } from '../../../src/utils/factory-management/products'
import { BuildingGroup, Factory, FactoryItem } from '../../../src/interfaces/planner/FactoryInterface'
import { fetchGameData } from '../../../src/utils/gameDataService'
import { mountItem } from '../../helpers'

// @ts-ignore
const gameData = await fetchGameData()

const mountProduct = (factory: Factory) => {
  return mountItem(factory, Product)
}

// The somersloop input is not debounced, but the factory update it triggers is async.
const waitForUpdate = () => new Promise(resolve => setTimeout(resolve, 100))

describe('TDD: BG-E-S-PROD: Building Groups: Somersloops (Products)', () => {
  let factory: Factory
  let product: FactoryItem
  let buildingGroup: BuildingGroup
  let subject: VueWrapper

  beforeEach(() => {
    factory = reactive(newFactory('BG-E-S-PROD Factory'))
    addProductToFactory(factory, {
      id: 'IronIngot',
      amount: 60, // 2 smelters (1 somersloop slot each)
      recipe: 'IngotIron',
    })
    product = factory.products[0]
    product.buildingGroupsTrayOpen = true
    buildingGroup = product.buildingGroups[0]
    calculateFactories([factory], gameData)
    subject = mountProduct(factory)
  })

  test('BG-E-S-PROD-1: Somersloop input is enabled and editable', async () => {
    const sloopInput = subject.find(`[id="${factory.id}-${buildingGroup.id}-somersloops"]`)
    expect(sloopInput.exists()).toBe(true)
    expect((sloopInput.element as HTMLInputElement).disabled).toBe(false)

    await sloopInput.setValue(1)
    await waitForUpdate()

    expect(buildingGroup.somersloops).toBe(1)
  })

  test('BG-E-S-PROD-2: Amplifies the group output without changing ingredients', async () => {
    product.buildingGroupItemSync = false
    const sloopInput = subject.find(`[id="${factory.id}-${buildingGroup.id}-somersloops"]`)
    await sloopInput.setValue(1)
    await waitForUpdate()

    // 2 smelters @ 100% fully slooped: 120 ingots out, still 60 ore in
    expect(buildingGroup.parts.IronIngot).toBe(120)
    expect(buildingGroup.parts.OreIron).toBe(60)

    const outputInput = subject.find(`[id="${factory.id}-${buildingGroup.id}-parts-IronIngot-amount"]`)
    const oreInput = subject.find(`[id="${factory.id}-${buildingGroup.id}-parts-OreIron-amount"]`)
    expect((outputInput.element as HTMLInputElement).value).toBe('120')
    expect((oreInput.element as HTMLInputElement).value).toBe('60')
  })

  test('BG-E-S-PROD-3: Updates the group power with the (1 + filled/slots)^2 penalty', async () => {
    product.buildingGroupItemSync = false
    expect(buildingGroup.powerUsage).toBe(8) // 2 smelters * 4MW

    const sloopInput = subject.find(`[id="${factory.id}-${buildingGroup.id}-somersloops"]`)
    await sloopInput.setValue(1)
    await waitForUpdate()

    // 2 smelters * 4MW * 4 = 32 MW
    expect(buildingGroup.powerUsage).toBe(32)
  })

  test('BG-E-S-PROD-4: Updates the effective buildings readout', async () => {
    product.buildingGroupItemSync = false
    const sloopInput = subject.find(`[id="${factory.id}-${buildingGroup.id}-somersloops"]`)
    await sloopInput.setValue(1)
    await waitForUpdate()

    // 2 physical buildings fully slooped = 4 effective
    expect(subject.find(`[id="${factory.id}-${product.id}-effective-buildings"]`).text()).toBe('4.00')
  })

  test('BG-E-S-PROD-5: Clamps somersloops to the building slot count', async () => {
    const sloopInput = subject.find(`[id="${factory.id}-${buildingGroup.id}-somersloops"]`)
    await sloopInput.setValue(5) // smelter only has 1 slot
    await waitForUpdate()

    expect(buildingGroup.somersloops).toBe(1)
  })

  test('BG-E-S-PROD-6: Sync ON: Updates the product amount and building count', async () => {
    product.buildingGroupItemSync = true
    const sloopInput = subject.find(`[id="${factory.id}-${buildingGroup.id}-somersloops"]`)
    await sloopInput.setValue(1)
    await waitForUpdate()

    // 4 effective buildings worth of output = 120/min
    expect(product.amount).toBe(120)
    expect((subject.find(`[id="${factory.id}-${product.id}-building-count"]`).element as HTMLInputElement).value).toBe('4')
    // The item's ingredient demand reflects what the 2 physical machines actually eat
    expect(product.requirements.OreIron.amount).toBe(60)
  })

  test('BG-E-S-PROD-7: Sync OFF: DOES NOT update the product, shows over-production', async () => {
    product.buildingGroupItemSync = false
    const sloopInput = subject.find(`[id="${factory.id}-${buildingGroup.id}-somersloops"]`)
    await sloopInput.setValue(1)
    await waitForUpdate()

    expect(product.amount).toBe(60)
    expect((subject.find(`[id="${factory.id}-${product.id}-building-count"]`).element as HTMLInputElement).value).toBe('2')
    expect(subject.find(`[id="${factory.id}-${product.id}-effective-buildings"]`).text()).toBe('4.00')
    // Re-find the remaining span: its :key is value-bound so the element is replaced on change.
    // The readout displays the absolute value with an "over" verb alongside it.
    expect(subject.find(`[id="${factory.id}-${product.id}-remaining-buildings"]`).text()).toBe('2.00')
    expect(subject.find(`[id="${factory.id}-${product.id}-remaining-buildings-verb"]`).text()).toBe('over')
  })

  test('BG-E-S-PROD-16: Toggle bar shows the item\'s total somersloop usage', async () => {
    // No sloops used: the counter should not render at all
    expect(subject.find(`[id="${factory.id}-${product.id}-somersloops-total"]`).exists()).toBe(false)

    const sloopInput = subject.find(`[id="${factory.id}-${buildingGroup.id}-somersloops"]`)
    await sloopInput.setValue(1)
    await waitForUpdate()

    // 2 buildings x 1 somersloop each = 2 in total
    const total = subject.find(`[id="${factory.id}-${product.id}-somersloops-total"]`)
    expect(total.exists()).toBe(true)
    expect(total.text()).toBe('2')
  })

  test('BG-E-S-PROD-8: Somersloops PLUS overclocking generate the proper combined numbers', async () => {
    product.buildingGroupItemSync = false
    const sloopInput = subject.find(`[id="${factory.id}-${buildingGroup.id}-somersloops"]`)
    await sloopInput.setValue(1)
    await waitForUpdate()

    const clockInput = subject.find(`[id="${factory.id}-${buildingGroup.id}-clock"]`)
    await clockInput.setValue(150)
    // Clock edits are debounced 750ms
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Output: 2 buildings * 1.5 clock * 30/min * 2 sloop boost = 180/min
    expect(buildingGroup.parts.IronIngot).toBe(180)
    // Ingredients: 2 * 1.5 * 30 = 90/min — never amplified
    expect(buildingGroup.parts.OreIron).toBe(90)
    // Power: 4MW * 1.5^1.321928 * (1 + 1/1)^2 * 2 buildings = ~54.7 MW
    expect(buildingGroup.powerUsage).toBeCloseTo(4 * Math.pow(1.5, 1.321928) * 4 * 2, 2)
    // Effective buildings: 2 * 1.5 * 2 = 6
    expect(subject.find(`[id="${factory.id}-${product.id}-effective-buildings"]`).text()).toBe('6.00')
  })
})
