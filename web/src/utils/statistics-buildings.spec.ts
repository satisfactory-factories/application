import { beforeEach, describe, expect, it } from 'vitest'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { gameData } from '@/utils/gameData'
import { calculateTotalBuildingsByType } from '@/utils/statistics'

describe('calculateTotalBuildingsByType', () => {
  let factories: Factory[]

  const build = (plan: Factory[]) => {
    calculateFactories(plan, gameData)
    return plan
  }

  beforeEach(() => {
    factories = []
  })

  it('should sum a building type used by more than one factory', () => {
    const smelterA = newFactory('Ingots A', 0, 1)
    addProductToFactory(smelterA, { id: 'IronIngot', amount: 90, recipe: 'IngotIron' })
    const smelterB = newFactory('Ingots B', 1, 2)
    addProductToFactory(smelterB, { id: 'IronIngot', amount: 60, recipe: 'IngotIron' })

    const totals = calculateTotalBuildingsByType(build([smelterA, smelterB]))

    expect(totals).toHaveLength(1)
    expect(totals[0].totalAmount).toBe(5)
    expect(totals[0].sources.map(source => [source.name, source.amount]))
      .toEqual([['Ingots A', 3], ['Ingots B', 2]])
  })

  // The count is what the table leads with, but a plan-wide "42 Constructors" says how many to
  // build without saying where any of them go.
  it('should carry each source factory id so the table can jump to it', () => {
    const smelter = newFactory('Ingots', 0, 7)
    addProductToFactory(smelter, { id: 'IronIngot', amount: 30, recipe: 'IngotIron' })

    expect(calculateTotalBuildingsByType(build([smelter]))[0].sources[0].id).toBe(7)
  })

  it('should only list the factories that actually hold a building type', () => {
    const smelter = newFactory('Ingots', 0, 1)
    addProductToFactory(smelter, { id: 'IronIngot', amount: 30, recipe: 'IngotIron' })
    const constructor = newFactory('Plates', 1, 2)
    addProductToFactory(constructor, { id: 'IronPlate', amount: 20, recipe: 'IronPlate' })

    const totals = calculateTotalBuildingsByType(build([smelter, constructor]))

    expect(totals).toHaveLength(2)
    totals.forEach(building => {
      expect(building.sources).toHaveLength(1)
    })
  })

  it('should sort alphabetically by building name', () => {
    const factory = newFactory('Mixed', 0, 1)
    addProductToFactory(factory, { id: 'IronIngot', amount: 30, recipe: 'IngotIron' })
    addProductToFactory(factory, { id: 'IronPlate', amount: 20, recipe: 'IronPlate' })

    const names = calculateTotalBuildingsByType(build([factory])).map(building => building.name)

    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  })

  it('should report nothing for a plan with no factories', () => {
    expect(calculateTotalBuildingsByType(factories)).toEqual([])
  })
})
