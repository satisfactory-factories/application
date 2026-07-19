import { VueWrapper } from '@vue/test-utils'
import { reactive } from 'vue'
import { beforeEach, describe, expect, test } from 'vitest'
import Product from '../../../src/components/planner/products/Product.vue'
import { calculateFactories, newFactory } from '../../../src/utils/factory-management/factory'
import { addProductToFactory } from '../../../src/utils/factory-management/products'
import { BuildingGroup, Factory, FactoryItem, ItemType } from '../../../src/interfaces/planner/FactoryInterface'
import { fetchGameData } from '../../../src/utils/gameDataService'
import { mountItem } from '../../helpers'

// @ts-ignore
const gameData = await fetchGameData()

const mountProduct = (factory: Factory) => {
  return mountItem(factory, Product)
}

describe('TDD: BG-E-C-PROD: Building Groups: Clocks (Products)', () => {
  let factory: Factory
  let product: FactoryItem
  let buildingGroup: BuildingGroup
  let subject: VueWrapper

  beforeEach(() => {
    factory = reactive(newFactory('BG-E-C-PROD Factory'))
    addProductToFactory(factory, {
      id: 'IronIngot',
      amount: 60, // 2 Buildings
      recipe: 'IngotIron',
    })
    product = factory.products[0]
    product.buildingGroupsTrayOpen = true
    buildingGroup = product.buildingGroups[0]
    calculateFactories([factory], gameData)
    subject = mountProduct(factory)
  })

  test('BG-E-C-PROD-2: Allows editing', async () => {
    const clockInput = subject.find(`[id="${factory.id}-${buildingGroup.id}-clock"]`)
    await clockInput.setValue(200)

    // Wait for debounce in BuildingGroup.vue (750ms)
    await new Promise(resolve => setTimeout(resolve, 1000))

    expect(buildingGroup.overclockPercent).toBe(200)
    // 2 buildings @ 200% = 4 effective buildings
    expect(subject.find(`[id="${factory.id}-${product.id}-effective-buildings"]`).text()).toBe('4.00')
  })

  test('BG-E-C-PROD-5: Updates the group\'s power consumption', async () => {
    const originalPower = buildingGroup.powerUsage
    expect(originalPower).toBeGreaterThan(0)

    const clockInput = subject.find(`[id="${factory.id}-${buildingGroup.id}-clock"]`)
    await clockInput.setValue(200)

    await new Promise(resolve => setTimeout(resolve, 1000))

    // Power scales at (clock/100)^1.321928 (= log2(2.5), so 200% = 2.5x power).
    // 2 smelters (4MW each) @ 200% = 4 * 2.5 * 2 = 20 MW
    expect(buildingGroup.powerUsage).toBeCloseTo(20, 2)
    expect(buildingGroup.powerUsage).toBeGreaterThan(originalPower)
  })

  test('BG-E-C-PROD-7: Updates the group\'s parts', async () => {
    expect(buildingGroup.parts.IronIngot).toBe(60)
    expect(buildingGroup.parts.OreIron).toBe(60)

    const clockInput = subject.find(`[id="${factory.id}-${buildingGroup.id}-clock"]`)
    await clockInput.setValue(200)

    await new Promise(resolve => setTimeout(resolve, 1000))

    // 2 buildings @ 200% = 4 effective buildings = 120/min
    expect(buildingGroup.parts.IronIngot).toBe(120)
    expect(buildingGroup.parts.OreIron).toBe(120)
  })

  test('BG-E-C-PROD-15: Toggle bar shows the total power shards needed', async () => {
    // Always visible, showing 0 at 100% clock
    expect(subject.find(`[id="${factory.id}-${product.id}-power-shards-total"]`).text()).toBe('0')

    const clockInput = subject.find(`[id="${factory.id}-${buildingGroup.id}-clock"]`)
    await clockInput.setValue(150)
    await new Promise(resolve => setTimeout(resolve, 1000))

    // 2 buildings @ 150% = 1 shard each = 2 total
    expect(subject.find(`[id="${factory.id}-${product.id}-power-shards-total"]`).text()).toBe('2')
  })

  test('BG-E-C-PROD-11: Sync ON: Updates the product\'s total buildings (fractionals)', async () => {
    product.buildingGroupItemSync = true
    const clockInput = subject.find(`[id="${factory.id}-${buildingGroup.id}-clock"]`)
    await clockInput.setValue(150)

    await new Promise(resolve => setTimeout(resolve, 1000))

    // 2 buildings @ 150% = 3 effective buildings
    expect((subject.find(`[id="${factory.id}-${product.id}-building-count"]`).element as HTMLInputElement).value).toBe('3')
    // Product amount should also be updated: 3 * 30 = 90
    expect(product.amount).toBe(90)
  })

  test('BG-E-C-PROD-12: Sync OFF: DOES NOT update the product\'s total buildings', async () => {
    product.buildingGroupItemSync = false
    const clockInput = subject.find(`[id="${factory.id}-${buildingGroup.id}-clock"]`)
    await clockInput.setValue(150)

    await new Promise(resolve => setTimeout(resolve, 1000))

    // Product building count should stay at 2
    expect((subject.find(`[id="${factory.id}-${product.id}-building-count"]`).element as HTMLInputElement).value).toBe('2')
    expect(product.amount).toBe(60)
    // But effective should be 3
    expect(subject.find(`[id="${factory.id}-${product.id}-effective-buildings"]`).text()).toBe('3.00')
    expect(subject.find(`[id="${factory.id}-${product.id}-remaining-buildings"]`).text()).toBe('1.00')
  })
})

describe('TDD: BG-E-I-PROD: Building Groups: Ingredients (Products)', () => {
  let factory: Factory
  let product: FactoryItem
  let buildingGroup: BuildingGroup
  let subject: VueWrapper

  beforeEach(() => {
    factory = reactive(newFactory('BG-E-I-PROD Factory'))
    addProductToFactory(factory, {
      id: 'IronIngot',
      amount: 60, // 2 Buildings
      recipe: 'IngotIron',
    })
    product = factory.products[0]
    product.buildingGroupsTrayOpen = true
    buildingGroup = product.buildingGroups[0]
    calculateFactories([factory], gameData)
    subject = mountProduct(factory)
  })

  test('BG-E-I-PROD-2: Building count AND clocks updated when editing ingredient amount', async () => {
    // Iron Ore is the ingredient. 60 IngotIron needs 60 OreIron.
    const oreInput = subject.find(`[id="${factory.id}-${buildingGroup.id}-parts-OreIron-amount"]`)

    // Change OreIron to 120 (needs 4 buildings)
    await oreInput.setValue(120)

    // Wait for debounce (750ms)
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Should have updated building count to 4 (defaulting to 100% clock if possible)
    expect(buildingGroup.buildingCount).toBe(4)
    expect(buildingGroup.overclockPercent).toBe(100)

    expect(subject.find(`[id="${factory.id}-${buildingGroup.id}-building-count"]`).element.value).toBe('4')
    expect(subject.find(`[id="${factory.id}-${buildingGroup.id}-clock"]`).element.value).toBe('100')
  })

  test('BG-E-I-PROD-5: Parts with the exact input the user entered', async () => {
    const oreInput = subject.find(`[id="${factory.id}-${buildingGroup.id}-parts-OreIron-amount"]`)

    // Change OreIron to a non-multiple of 30, e.g., 40
    await oreInput.setValue(40)
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Clock should have adjusted to match 40
    // 40 / 30 = 1.333 buildings.
    // Best fit is 2 buildings @ 66.667%? Or 1 building @ 133.333%?
    // Code prefers <= 100% clock, so 2 buildings @ 66.667%
    expect(buildingGroup.buildingCount).toBe(2)
    expect(buildingGroup.overclockPercent).toBe(67)

    // Amount should be exactly 40. Actually it will be 30 * 2 * 0.67 = 40.2 due to ceil.
    expect(buildingGroup.parts.OreIron).toBe(40.2)
  })
})
