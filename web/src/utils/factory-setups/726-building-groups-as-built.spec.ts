import { beforeEach, describe, expect, it } from 'vitest'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories } from '@/utils/factory-management/factory'
import { getAsBuiltDifferences, getAsBuiltOutput } from '@/utils/factory-management/building-groups/as-built'
import { create726Scenario } from '@/utils/factory-setups/726-building-groups-as-built'
import { gameData } from '@/utils/gameData'

// The template exists to show one thing: a plan that balances on its quantities while its
// building groups do not. If the plan stops balancing, or the groups stop disagreeing, it shows
// nothing, so both halves are pinned.
describe('#726 building groups as built template', () => {
  let oil: Factory

  beforeEach(() => {
    const factories = create726Scenario().getFactories()
    calculateFactories(factories, gameData)
    ;[oil] = factories
  })

  it('should balance on the quantities', () => {
    expect(oil.parts.HeavyOilResidue.amountSupplied).toBe(420)
    expect(oil.parts.HeavyOilResidue.amountRemaining).toBe(0)
    expect(oil.parts.LiquidFuel.amountRemaining).toBe(0)
    expect(oil.parts.LiquidOil.amountRemaining).toBe(0)
    // The two surpluses that are not the story are sunk.
    expect(oil.parts.Plastic.amountRemaining).toBe(0)
    expect(oil.parts.PolymerResin.amountRemaining).toBe(0)
  })

  it('should keep the groups disagreeing with the quantities', () => {
    const [, residue, , fuel] = oil.products

    expect(residue.buildingGroupItemSync).toBe(false)
    expect(residue.buildingGroupsHaveProblem).toBe(true)
    expect(residue.amount).toBe(360)
    expect(getAsBuiltOutput(residue)).toBe(240)

    expect(fuel.buildingGroupItemSync).toBe(false)
    expect(fuel.buildingGroupsHaveProblem).toBe(true)
    expect(fuel.amount).toBe(280)
    expect(getAsBuiltOutput(fuel)).toBe(320)
  })

  it('should leave Heavy Oil Residue short as built, from both directions', () => {
    const residue = getAsBuiltDifferences(oil).HeavyOilResidue

    // 120 not made by the residue refineries, 60 more eaten by the fuel ones.
    expect(residue.remaining).toBe(-180)
    expect(residue.sources.map(source => [source.subject, source.role])).toEqual([
      ['HeavyOilResidue', 'output'],
      ['LiquidFuel', 'ingredient'],
    ])
  })

  it('should leave Liquid Fuel in surplus as built', () => {
    expect(getAsBuiltDifferences(oil).LiquidFuel.remaining).toBe(40)
  })

  it('should leave crude in surplus as built, drawn by refineries that are not there', () => {
    expect(getAsBuiltDifferences(oil).LiquidOil.remaining).toBe(90)
  })

  it('should say nothing about a sunk byproduct the sink absorbs', () => {
    // 60/min less resin as built is 60/min less sunk, not a shortage.
    expect(getAsBuiltDifferences(oil).PolymerResin).toBeUndefined()
  })
})
