import { beforeEach, describe, expect, it } from 'vitest'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { addInputToFactory } from '@/utils/factory-management/inputs'
import { gameData } from '@/utils/gameData'
import { collectGroupProducts } from '@/utils/factory-management/group-products'

describe('collectGroupProducts', () => {
  let mine: Factory
  let smelter: Factory

  // A two-factory group: a mine feeding a smelter, both inside it. Ore is shipped between them,
  // ingots leave the group entirely.
  beforeEach(() => {
    mine = newFactory('Iron Mine', 0, 1)
    addProductToFactory(mine, { id: 'OreIron', amount: 240, recipe: 'Extract_OreIron' })

    smelter = newFactory('Iron Smelter', 1, 2)
    addProductToFactory(smelter, { id: 'IronIngot', amount: 240, recipe: 'IngotIron' })
    addInputToFactory(smelter, { factoryId: 1, outputPart: 'OreIron', amount: 240 })
  })

  const build = (factories: Factory[]) => {
    calculateFactories(factories, gameData)
    return factories
  }

  it('should list what the group makes, in the order the factories declare it', () => {
    const products = collectGroupProducts(build([mine, smelter]))

    expect(products.map(product => product.partId)).toEqual(['OreIron', 'IronIngot'])
  })

  it('should report a surplus as a positive net', () => {
    mine.products[0].amount = 300
    const products = collectGroupProducts(build([mine, smelter]))

    expect(products.find(product => product.partId === 'OreIron')?.net).toBe(60)
  })

  it('should report a shortfall as a negative net', () => {
    mine.products[0].amount = 200
    smelter.inputs[0].amount = 200
    const products = collectGroupProducts(build([mine, smelter]))

    expect(products.find(product => product.partId === 'OreIron')?.net).toBe(-40)
  })

  // The net is the group's, not any one factory's: the mine's own surplus and the smelter's
  // shortfall of the same part have to cancel, or a balanced group reads as two problems.
  it('should net a part across every factory in the group', () => {
    const products = collectGroupProducts(build([mine, smelter]))

    expect(products.find(product => product.partId === 'OreIron')?.net).toBe(0)
  })

  describe('internal products', () => {
    // Concrete produced and poured in the same factory, which is what put it on the Uranium
    // Power row: nobody outside is waiting for it, so it says nothing about what the group does.
    const withSelfConsumed = () => {
      const factory = newFactory('Uranium Power', 0, 1)
      addProductToFactory(factory, { id: 'EncasedIndustrialBeam', amount: 60, recipe: 'EncasedIndustrialBeam' })
      addProductToFactory(factory, { id: 'Cement', amount: 360, recipe: 'Concrete' })
      return build([factory])
    }

    it('should mark a part produced and consumed on site with no outside demand', () => {
      const products = collectGroupProducts(withSelfConsumed())

      expect(products.find(product => product.partId === 'Cement')?.internal).toBe(true)
    })

    it('should not mark a part the group ships out', () => {
      const consumer = newFactory('Consumer', 2, 3)
      addProductToFactory(consumer, { id: 'IngotSteel', amount: 100, recipe: 'IngotSteel' })
      addInputToFactory(consumer, { factoryId: 1, outputPart: 'OreIron', amount: 60 })
      const plan = build([mine, smelter, consumer])

      // The group is the first two; the third is elsewhere in the plan and imports from it.
      const products = collectGroupProducts([plan[0], plan[1]])

      expect(products.find(product => product.partId === 'OreIron')?.internal).toBe(false)
    })

    // The row exists to surface exactly this, so being consumed on site must not hide it.
    it('should not mark a self-consumed part that does not balance', () => {
      const factory = newFactory('Uranium Power', 0, 1)
      addProductToFactory(factory, { id: 'EncasedIndustrialBeam', amount: 60, recipe: 'EncasedIndustrialBeam' })
      addProductToFactory(factory, { id: 'Cement', amount: 100, recipe: 'Concrete' })
      const products = collectGroupProducts(build([factory]))

      const cement = products.find(product => product.partId === 'Cement')!
      expect(cement.net).toBeLessThan(0)
      expect(cement.internal).toBe(false)
    })

    // Made, not consumed, not shipped: a pile going nowhere is worth saying out loud.
    it('should not mark a part nothing consumes at all', () => {
      const products = collectGroupProducts(build([mine]))

      expect(products.find(product => product.partId === 'OreIron')?.internal).toBe(false)
    })
  })
})
