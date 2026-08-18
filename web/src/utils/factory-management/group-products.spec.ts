import { beforeEach, describe, expect, it } from 'vitest'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { addInputToFactory } from '@/utils/factory-management/inputs'
import { addPowerProducerToFactory } from '@/utils/factory-management/power'
import { FactoryPowerChangeType } from '@/interfaces/planner/FactoryInterface'
import { gameData } from '@/utils/gameData'
import {
  collectGroupProducts,
  groupExportRequests,
  groupProducers,
  GroupProduct,
  overflowLines,
} from '@/utils/factory-management/group-products'

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

  // What the roll-up's two tables read from: where a part goes, and who made it.
  describe('groupExportRequests', () => {
    const withOutsideConsumer = () => {
      const consumer = newFactory('Consumer', 2, 3)
      addProductToFactory(consumer, { id: 'IngotSteel', amount: 100, recipe: 'IngotSteel' })
      addInputToFactory(consumer, { factoryId: 1, outputPart: 'OreIron', amount: 60 })
      return { plan: build([mine, smelter, consumer]), consumer }
    }

    it('should name the factory outside the group and what it asked for', () => {
      const { plan, consumer } = withOutsideConsumer()

      const flows = groupExportRequests([plan[0], plan[1]], 'OreIron')

      expect(flows).toEqual([{ factoryId: consumer.id, amount: 60 }])
    })

    // A sibling's request is not an export out of the group, which is the whole distinction the
    // `kind` classification rests on.
    it('should ignore a request from a factory inside the group', () => {
      const plan = build([mine, smelter])

      expect(groupExportRequests(plan, 'OreIron')).toEqual([])
    })
  })

  describe('groupProducers', () => {
    it('should name every factory in the group that makes the part, largest first', () => {
      const second = newFactory('Second Mine', 2, 3)
      addProductToFactory(second, { id: 'OreIron', amount: 480, recipe: 'Extract_OreIron' })
      const plan = build([mine, second])

      const flows = groupProducers(plan, 'OreIron')

      expect(flows.map(flow => flow.factoryId)).toEqual([second.id, mine.id])
      expect(flows[0].amount).toBeGreaterThan(flows[1].amount)
    })

    it('should leave out a factory that only consumes the part', () => {
      const plan = build([mine, smelter])

      expect(groupProducers(plan, 'OreIron').map(flow => flow.factoryId)).toEqual([mine.id])
    })
  })

  // The +N tooltip's lines. One per hidden part, because joining them with commas made a single
  // wrapped paragraph that nothing could be found in.
  describe('overflowLines', () => {
    it('should list every label when they fit under the cap', () => {
      expect(overflowLines(['a', 'b', 'c'], 10)).toEqual(['a', 'b', 'c'])
    })

    it('should cap the list and count what it left out', () => {
      const labels = Array.from({ length: 23 }, (_, index) => `part ${index}`)

      const lines = overflowLines(labels, 10)

      expect(lines).toHaveLength(11)
      expect(lines[9]).toBe('part 9')
      expect(lines.at(-1)).toBe('and 13 more')
    })

    // Exactly at the cap is not truncated, so it must not claim "and 0 more".
    it('should not add a count when the list ends exactly on the cap', () => {
      const labels = Array.from({ length: 10 }, (_, index) => `part ${index}`)

      expect(overflowLines(labels, 10)).toHaveLength(10)
    })
  })

  // What the tile's corner badge is chosen from. One of three, always.
  describe('product kinds', () => {
    const kindOf = (products: GroupProduct[], partId: string) =>
      products.find(product => product.partId === partId)!.kind

    it('should call a part a factory outside the group asks for an export', () => {
      const consumer = newFactory('Consumer', 2, 3)
      addProductToFactory(consumer, { id: 'IngotSteel', amount: 100, recipe: 'IngotSteel' })
      addInputToFactory(consumer, { factoryId: 1, outputPart: 'OreIron', amount: 60 })
      const plan = build([mine, smelter, consumer])

      const products = collectGroupProducts([plan[0], plan[1]])

      expect(kindOf(products, 'OreIron')).toBe('export')
    })

    // Requested by a sibling in the same group, so it never leaves it. This is the case `internal`
    // deliberately answers the other way, being about a request rather than about the group.
    it('should call a part a sibling in the group asks for internal', () => {
      const products = collectGroupProducts(build([mine, smelter]))
      const ore = products.find(product => product.partId === 'OreIron')!

      expect(ore.kind).toBe('internal')
      expect(ore.internal).toBe(false)
    })

    it('should call a part made and used up in one factory internal', () => {
      const factory = newFactory('Uranium Power', 0, 1)
      addProductToFactory(factory, { id: 'EncasedIndustrialBeam', amount: 60, recipe: 'EncasedIndustrialBeam' })
      addProductToFactory(factory, { id: 'Cement', amount: 360, recipe: 'Concrete' })
      const products = collectGroupProducts(build([factory]))

      expect(kindOf(products, 'Cement')).toBe('internal')
    })

    it('should call anything else a plain product', () => {
      const products = collectGroupProducts(build([mine, smelter]))

      // Made by the group, nothing outside asking for it, not consumed inside either.
      expect(kindOf(products, 'IronIngot')).toBe('product')
    })

    /**
     * The Water at Uranium Power case, which is why `kind` asks about consumption directly rather
     * than reusing the `internal` flag.
     *
     * `internal` also requires the part to balance, deliberately, because the display option hides
     * internal rows and a shortfall must never be hidden. Classifying `kind` off it reported a part
     * the factory makes and drinks on the spot as having no demand, purely because the two figures
     * did not match. Being consumed is what decides the kind; balancing is what `net` reports.
     */
    it('should still call an unbalanced self-consumed part internal', () => {
      const factory = newFactory('Uranium Power', 0, 1)
      addProductToFactory(factory, { id: 'EncasedIndustrialBeam', amount: 60, recipe: 'EncasedIndustrialBeam' })
      addProductToFactory(factory, { id: 'Cement', amount: 100, recipe: 'Concrete' })
      const products = collectGroupProducts(build([factory]))
      const cement = products.find(product => product.partId === 'Cement')!

      expect(cement.net).not.toBe(0) // it does not balance...
      expect(cement.internal).toBe(false) // ...so the display flag stays off...
      expect(cement.kind).toBe('internal') // ...but it plainly does not leave the group.
    })

    /**
     * Fuel burnt by a generator is consumption too. It lands in `amountRequiredPower` rather than
     * `amountRequiredProduction`, so testing production alone reported a fuel a factory makes and
     * burns on the spot as having no demand.
     */
    it('should call a part burnt by a generator in the group internal', () => {
      const factory = newFactory('Fuel Power', 0, 1)
      addProductToFactory(factory, { id: 'LiquidFuel', amount: 1000, recipe: 'LiquidFuel' })
      addPowerProducerToFactory(factory, {
        building: 'generatorfuel',
        ingredientAmount: 100,
        recipe: 'GeneratorFuel_LiquidFuel',
        updated: FactoryPowerChangeType.Ingredient,
      })
      const products = collectGroupProducts(build([factory]))

      expect(kindOf(products, 'LiquidFuel')).toBe('internal')
    })

    // Which leaves `product` meaning what it says: made, and nothing anywhere wants any of it.
    it('should only call a part a plain product when nothing consumes or requests it', () => {
      const products = collectGroupProducts(build([mine]))

      expect(kindOf(products, 'OreIron')).toBe('product')
    })
  })
})
