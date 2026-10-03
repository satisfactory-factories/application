import { beforeEach, describe, expect, it } from 'vitest'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories } from '@/utils/factory-management/factory'
import { fixProducerFuel, fuelFixTarget, shouldShowFuelFix } from '@/utils/factory-management/power'
import { createFuelSupplyMatchingScenario } from '@/utils/factory-setups/fuel-supply-matching'
import { gameData } from '@/utils/gameData'

// The template exists to demonstrate one thing, so the numbers on the buttons are the thing to
// pin: a template that has drifted into showing nothing teaches nothing.
describe('Fuel supply matching template', () => {
  let overDrawing: Factory
  let spareFuel: Factory

  beforeEach(() => {
    const factories = createFuelSupplyMatchingScenario().getFactories()
    calculateFactories(factories, gameData)
    ;[overDrawing, spareFuel] = factories
  })

  it('should leave the fuel as the only loose end', () => {
    // Everything the chain makes on the way through is consumed by the next step, so the only
    // part either factory has anything left over of is the Plastic it exists to make.
    for (const factory of [overDrawing, spareFuel]) {
      expect(factory.parts.PolymerResin.amountRemaining).toBe(0)
      expect(factory.parts.Water.amountRemaining).toBe(0)
      expect(factory.parts.Rubber.amountRemaining).toBe(0)
      expect(factory.parts.LiquidOil.amountRemaining).toBe(0)
      expect(factory.parts.Plastic.amountRemaining).toBe(480)
      // Nothing is imported: each factory stands on its own.
      expect(factory.inputs).toEqual([])
    }
  })

  it('should offer a trim on the over-drawing factory', () => {
    const part = overDrawing.parts.LiquidFuel
    expect(part.amountSupplied).toBe(640)
    expect(part.amountRequiredProduction).toBe(240) // Recycled Plastic's share
    expect(part.amountRequiredPower).toBe(640)
    expect(part.amountRemaining).toBe(-240)

    const producer = overDrawing.powerProducers[0]
    expect(producer.powerProduced).toBe(8000)
    expect(shouldShowFuelFix(producer, overDrawing, gameData)).toBe('trim')
    expect(fuelFixTarget(producer, overDrawing, gameData)).toBe(400)
  })

  it('should offer an expand on the spare fuel factory, at the same figure', () => {
    const part = spareFuel.parts.LiquidFuel
    expect(part.amountRequiredPower).toBe(240)
    expect(part.amountRemaining).toBe(160)

    const producer = spareFuel.powerProducers[0]
    expect(producer.powerProduced).toBe(3000)
    expect(shouldShowFuelFix(producer, spareFuel, gameData)).toBe('expand')
    expect(fuelFixTarget(producer, spareFuel, gameData)).toBe(400)
  })

  it('should balance both factories on 5,000 MW once the button is pressed', () => {
    for (const factory of [overDrawing, spareFuel]) {
      fixProducerFuel(factory.powerProducers[0], factory, gameData)
      calculateFactories([factory], gameData)

      expect(factory.powerProducers[0].fuelAmount).toBe(400)
      expect(factory.powerProducers[0].powerProduced).toBe(5000)
      expect(factory.parts.LiquidFuel.amountRemaining).toBe(0)
      expect(factory.parts.LiquidFuel.satisfied).toBe(true)
      expect(shouldShowFuelFix(factory.powerProducers[0], factory, gameData)).toBe(null)
    }
  })
})
