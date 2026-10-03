import { beforeEach, describe, expect, it } from 'vitest'
import { Factory, FactoryPowerChangeType, ItemType } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { addPowerProducerToFactory } from '@/utils/factory-management/power'
import { fetchGameData } from '@/utils/gameDataService'
import {
  getAsBuiltDifferences,
  getAsBuiltOutput,
  getItemAsBuiltSources,
} from '@/utils/factory-management/building-groups/as-built'

describe('as-built building group differences', async () => {
  const gameData = await fetchGameData()

  let factory: Factory

  beforeEach(() => {
    factory = newFactory('As Built')
  })

  it('reports nothing for groups that match the plan', () => {
    addProductToFactory(factory, { id: 'IronIngot', amount: 300, recipe: 'IngotIron' })
    calculateFactories([factory], gameData)

    expect(factory.products[0].buildingGroupsHaveProblem).toBe(false)
    expect(getAsBuiltDifferences(factory)).toEqual({})
    expect(getAsBuiltOutput(factory.products[0])).toBeNull()
  })

  // The case that prompted this: a refinery product raised with Sync off, so the planner counts
  // 950/min while the groups still hold the 18 refineries built for 720/min. Satisfaction balances
  // exactly on the 950 and the factory is 230/min short in game.
  describe('a product raised with Sync off', () => {
    beforeEach(() => {
      addProductToFactory(factory, { id: 'HeavyOilResidue', amount: 720, recipe: 'Alternate_HeavyOilResidue' })
      calculateFactories([factory], gameData)

      const product = factory.products[0]
      product.buildingGroupItemSync = false
      product.amount = 950
      calculateFactories([factory], gameData)
    })

    it('flags the groups as out of balance', () => {
      expect(factory.products[0].buildingGroupsHaveProblem).toBe(true)
    })

    it('reports what the groups actually make of the product', () => {
      expect(getAsBuiltOutput(factory.products[0])).toBe(720)
    })

    it('lowers the surplus of every output by what the groups do not make', () => {
      const differences = getAsBuiltDifferences(factory)

      expect(differences.HeavyOilResidue.surplusDelta).toBe(-230)
      expect(differences.PolymerResin.surplusDelta).toBe(-115)
    })

    it('raises the surplus of an ingredient the groups do not consume', () => {
      // 950 HOR asks for 712.5 crude; the 18 refineries built only take 540.
      expect(getAsBuiltDifferences(factory).LiquidOil.surplusDelta).toBe(172.5)
    })

    it('names the item responsible, with both figures', () => {
      expect(getAsBuiltDifferences(factory).HeavyOilResidue.sources).toEqual([{
        type: ItemType.Product,
        subject: 'HeavyOilResidue',
        role: 'output',
        planned: 950,
        asBuilt: 720,
      }])
    })
  })

  it('reports groups that make more than planned as extra surplus', () => {
    addProductToFactory(factory, { id: 'IronIngot', amount: 300, recipe: 'IngotIron' })
    calculateFactories([factory], gameData)

    factory.products[0].buildingGroupItemSync = false
    factory.products[0].amount = 150
    calculateFactories([factory], gameData)

    expect(getAsBuiltDifferences(factory).IronIngot.surplusDelta).toBe(150)
    expect(getAsBuiltDifferences(factory).OreIron.surplusDelta).toBe(-150)
  })

  it('counts a power producer whose groups burn a different amount of fuel', () => {
    addPowerProducerToFactory(factory, {
      building: 'generatorfuel',
      buildingAmount: 2,
      recipe: 'GeneratorFuel_LiquidFuel',
      updated: FactoryPowerChangeType.Building,
    })
    calculateFactories([factory], gameData)

    const producer = factory.powerProducers[0]
    producer.buildingGroupsHaveProblem = true
    producer.buildingGroups[0].parts.LiquidFuel = 20

    expect(getItemAsBuiltSources(producer, ItemType.Power)).toEqual([{
      part: 'LiquidFuel',
      source: { type: ItemType.Power, subject: 'generatorfuel', role: 'ingredient', planned: 40, asBuilt: 20 },
    }])
    expect(getAsBuiltDifferences(factory).LiquidFuel.surplusDelta).toBe(20)
  })

  it('leaves out a part two items push in opposite directions by the same amount', () => {
    addProductToFactory(factory, { id: 'IronIngot', amount: 300, recipe: 'IngotIron' })
    addProductToFactory(factory, { id: 'IronIngot', amount: 300, recipe: 'Alternate_PureIronIngot' })
    calculateFactories([factory], gameData)

    const [over, under] = factory.products
    over.buildingGroupsHaveProblem = true
    over.buildingGroups[0].parts.IronIngot = 330
    under.buildingGroupsHaveProblem = true
    under.buildingGroups[0].parts.IronIngot = 270

    expect(getAsBuiltDifferences(factory).IronIngot).toBeUndefined()
  })
})
