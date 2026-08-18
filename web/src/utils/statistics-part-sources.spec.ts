import { describe, expect, it } from 'vitest'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { addInputToFactory } from '@/utils/factory-management/inputs'
import { gameData } from '@/utils/gameData'
import { calculateTotalParts } from '@/utils/statistics'

describe('calculateTotalParts sources', () => {
  const build = (plan: Factory[]) => {
    calculateFactories(plan, gameData)
    return plan
  }

  const find = (plan: Factory[], partId: string) =>
    calculateTotalParts(plan).find(part => part.id === partId)!

  it('should name the factory a shortfall belongs to', () => {
    const smelter = newFactory('Smelter', 0, 1)
    addProductToFactory(smelter, { id: 'IronIngot', amount: 100, recipe: 'IngotIron' })

    const ore = find(build([smelter]), 'OreIron')

    expect(ore.amountRemaining).toBe(-100)
    expect(ore.sources).toEqual([{ id: 1, name: 'Smelter', icon: undefined, amount: -100 }])
  })

  // The reason the column exists: a plan-wide zero is not the same as nothing to do.
  it('should keep both sides when a surplus and a shortfall cancel out', () => {
    const mine = newFactory('Mine', 0, 1)
    addProductToFactory(mine, { id: 'OreIron', amount: 340, recipe: 'Extract_OreIron' })
    const smelter = newFactory('Smelter', 1, 2)
    addProductToFactory(smelter, { id: 'IronIngot', amount: 100, recipe: 'IngotIron' })

    const ore = find(build([mine, smelter]), 'OreIron')

    expect(ore.amountRemaining).toBe(240)
    expect(ore.sources.map(source => [source.name, source.amount]))
      .toEqual([['Mine', 340], ['Smelter', -100]])
  })

  // The reported bug: an item that balances exactly showed nothing at all against it, so a
  // finished plan listed most of its items with no idea where any of them were made.
  it('should still name the producer when the part balances exactly', () => {
    const mine = newFactory('Mine', 0, 1)
    addProductToFactory(mine, { id: 'OreIron', amount: 100, recipe: 'Extract_OreIron' })
    const smelter = newFactory('Smelter', 1, 2)
    addProductToFactory(smelter, { id: 'IronIngot', amount: 100, recipe: 'IngotIron' })
    addInputToFactory(smelter, { factoryId: 1, outputPart: 'OreIron', amount: 100 })

    const ore = find(build([mine, smelter]), 'OreIron')

    expect(ore.amountRemaining).toBe(0)
    expect(ore.sources.map(source => [source.name, source.amount])).toEqual([['Mine', 100]])
  })

  // A factory that only imports a part and consumes the lot has nothing to say about it.
  it('should leave out a factory that neither makes it nor is short of it', () => {
    const mine = newFactory('Mine', 0, 1)
    addProductToFactory(mine, { id: 'OreIron', amount: 100, recipe: 'Extract_OreIron' })
    const smelter = newFactory('Smelter', 1, 2)
    addProductToFactory(smelter, { id: 'IronIngot', amount: 100, recipe: 'IngotIron' })
    addInputToFactory(smelter, { factoryId: 1, outputPart: 'OreIron', amount: 100 })

    const ore = find(build([mine, smelter]), 'OreIron')

    expect(ore.sources.map(source => source.name)).not.toContain('Smelter')
  })

  // Production wins over the balance: a factory making a part and shipping it all out is where
  // that part comes from, whatever its own balance ends up being.
  it('should report what a producer makes rather than its balance', () => {
    const mine = newFactory('Mine', 0, 1)
    addProductToFactory(mine, { id: 'OreIron', amount: 340, recipe: 'Extract_OreIron' })
    const smelter = newFactory('Smelter', 1, 2)
    addProductToFactory(smelter, { id: 'IronIngot', amount: 100, recipe: 'IngotIron' })
    addInputToFactory(smelter, { factoryId: 1, outputPart: 'OreIron', amount: 100 })

    const ore = find(build([mine, smelter]), 'OreIron')

    expect(ore.sources.find(source => source.name === 'Mine')?.amount).toBe(340)
  })

  it('should carry the factory id so the table can jump to it', () => {
    const smelter = newFactory('Smelter', 0, 42)
    addProductToFactory(smelter, { id: 'IronIngot', amount: 100, recipe: 'IngotIron' })

    expect(find(build([smelter]), 'OreIron').sources[0].id).toBe(42)
  })
})
