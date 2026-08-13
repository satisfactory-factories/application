import { beforeEach, describe, expect, it } from 'vitest'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { gameData } from '@/utils/gameData'
import { calculateTotalRawResources } from '@/utils/statistics'
import { complexDemoPlan } from '@/utils/factory-setups/complex-demo-plan'

describe('calculateTotalRawResources', () => {
  let factories: Factory[]

  const build = (plan: Factory[]) => {
    calculateFactories(plan, gameData)
    return plan
  }

  beforeEach(() => {
    factories = []
  })

  // v0.6 stopped assuming raw supply, which emptied factory.rawResources — the map this used to
  // read. The panel then went blank for exactly the plans that mine properly, which is the whole
  // demo plan.
  it('should report what the demo plan extracts', () => {
    const totals = calculateTotalRawResources(build(complexDemoPlan().getFactories()))

    expect(totals.length).toBeGreaterThan(0)
    const byId = Object.fromEntries(totals.map(entry => [entry.id, entry.totalAmount]))
    expect(byId.OreCopper).toBe(360)
    expect(byId.LiquidOil).toBe(960)
  })

  it('should sum a resource that more than one factory extracts', () => {
    const mineA = newFactory('Mine A', 0, 1)
    addProductToFactory(mineA, { id: 'OreIron', amount: 240, recipe: 'Extract_OreIron' })
    const mineB = newFactory('Mine B', 1, 2)
    addProductToFactory(mineB, { id: 'OreIron', amount: 120, recipe: 'Extract_OreIron' })

    const totals = calculateTotalRawResources(build([mineA, mineB]))

    expect(totals).toEqual([{ id: 'OreIron', totalAmount: 360 }])
  })

  // The panel is about what comes out of the ground, not about everything a plan touches.
  it('should ignore a product that is not a raw resource', () => {
    const smelter = newFactory('Smelter', 0, 1)
    addProductToFactory(smelter, { id: 'IronIngot', amount: 100, recipe: 'IngotIron' })

    expect(calculateTotalRawResources(build([smelter]))).toEqual([])
  })

  // Consuming a raw resource is not extracting it — otherwise a plan importing ore from another
  // factory would report the same ore twice over.
  it('should not count a raw resource a factory only consumes', () => {
    const mine = newFactory('Mine', 0, 1)
    addProductToFactory(mine, { id: 'OreIron', amount: 240, recipe: 'Extract_OreIron' })
    const smelter = newFactory('Smelter', 1, 2)
    addProductToFactory(smelter, { id: 'IronIngot', amount: 240, recipe: 'IngotIron' })

    const totals = calculateTotalRawResources(build([mine, smelter]))

    expect(totals).toEqual([{ id: 'OreIron', totalAmount: 240 }])
  })

  it('should sort alphabetically by display name', () => {
    const mine = newFactory('Mine', 0, 1)
    addProductToFactory(mine, { id: 'OreUranium', amount: 60, recipe: 'Extract_OreUranium' })
    addProductToFactory(mine, { id: 'Coal', amount: 120, recipe: 'Extract_Coal' })
    addProductToFactory(mine, { id: 'Stone', amount: 240, recipe: 'Extract_Stone' })

    expect(calculateTotalRawResources(build([mine])).map(entry => entry.id))
      .toEqual(['Coal', 'Stone', 'OreUranium'])
  })

  it('should report nothing for a plan with no factories', () => {
    expect(calculateTotalRawResources(factories)).toEqual([])
  })
})
