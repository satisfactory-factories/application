import { describe, expect, it } from 'vitest'
import { calculateFactories, findFacByName } from '@/utils/factory-management/factory'
import { createMiningDemoPlan } from '@/utils/factory-setups/mining-demo-plan'
import { fetchGameData } from '@/utils/gameDataService'

// A template that doesn't balance is worse than no template: it teaches the wrong thing and
// looks like a bug. This asserts the plan loads clean, with every raw resource actually mined.
describe('mining demo plan', async () => {
  const gameData = await fetchGameData()

  const load = () => {
    const factories = createMiningDemoPlan().getFactories()
    calculateFactories(factories, gameData, { origin: 'recalculate' })
    return factories
  }

  it('mines its ore from mixed miner marks and purities', () => {
    const mine = findFacByName('Iron Mine', load())

    // 2 x Mk.3 pure (960) + 1 x Mk.2 normal (120)
    expect(mine.products[0].amount).toBe(1080)
    expect(mine.buildingRequirements.minermk3.amount).toBe(2)
    expect(mine.buildingRequirements.minermk2.amount).toBe(1)
    expect(mine.parts.OreIron.amountSuppliedViaRaw).toBe(0)
  })

  it('runs a resource well off one pressurizer and seven satellites', () => {
    const well = findFacByName('Nitrogen Well', load())

    expect(well.products[0].amount).toBe(780)
    expect(well.buildingRequirements.frackingsmasher.amount).toBe(1)
    expect(well.buildingRequirements.frackingextractor.amount).toBe(7)
    expect(well.power.consumed).toBe(150)
  })

  it('extracts its water on site rather than importing it', () => {
    const acid = findFacByName('Nitric Acid', load())

    expect(acid.parts.Water.amountSuppliedViaProduction).toBe(30)
    expect(acid.parts.Water.amountSuppliedViaRaw).toBe(0)
    expect(acid.buildingRequirements.waterpump.amount).toBe(1)
  })

  it('assumes no raw inputs anywhere, and has none left unmined', () => {
    load().forEach(factory => {
      expect(factory.assumeRawInputs).toBe(false)
      expect(Object.keys(factory.rawResources)).toEqual([])
    })
  })

  it('balances: every factory satisfied and every export met', () => {
    load().forEach(factory => {
      expect({ name: factory.name, problem: factory.hasProblem }).toEqual({
        name: factory.name,
        problem: false,
      })
    })
  })
})
