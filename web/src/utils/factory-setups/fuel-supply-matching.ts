import { Factory, FactoryPowerChangeType } from '@/interfaces/planner/FactoryInterface'
import { newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { addPowerProducerToFactory } from '@/utils/factory-management/power'

/**
 * The Oil MegaFac's fuel problem, shrunk to two self-contained factories.
 *
 * A factory that makes its own Liquid Fuel and burns it in Fuel-Powered Generators has an obvious
 * answer to "how much may the generators burn" — right up until a second recipe wants the same
 * fuel. Here that is Recycled Plastic, which eats 240/min of the 640/min made, leaving the
 * generators 400. Neither factory is *broken*: each is one number away from balanced, and the
 * number is the one the generator row now offers to set.
 *
 * The two differ only in what the generators are set to, so the pair shows both directions
 * against the same answer:
 *
 *   Over-drawing  — generators on 640, 240 too much → "Trim to supply (400)", 8,000 → 5,000 MW
 *   Spare fuel    — generators on 240, 160 too little → "Expand to supply (400)", 3,000 → 5,000 MW
 *
 * The chain closes on itself deliberately, so the fuel is the only loose end: crude makes Liquid
 * Fuel and drops Polymer Resin, Residual Rubber turns that resin into Rubber, and Recycled Plastic
 * turns the Rubber back into Plastic — the factory's one output — taking a share of the fuel on
 * the way through. Water and crude are extracted on site, so nothing is imported either.
 */
export const createFuelSupplyMatchingScenario = (): { getFactories: () => Factory[] } => {
  const overDrawing = newFactory('Fuel Power (over-drawing)', 0, 1)
  const spareFuel = newFactory('Fuel Power (spare fuel)', 1, 2)

  const factories = [overDrawing, spareFuel]

  // Both factories are the same plant; only the generators differ.
  const addPlant = (factory: Factory, generatorFuel: number) => {
    addProductToFactory(factory, { id: 'LiquidOil', recipe: 'Extract_LiquidOil', amount: 960 })
    addProductToFactory(factory, { id: 'Water', recipe: 'Extract_Water', amount: 480 })

    // 960 crude → 640 Liquid Fuel, dropping 480 Polymer Resin.
    addProductToFactory(factory, { id: 'LiquidFuel', recipe: 'LiquidFuel', amount: 640 })

    // The resin and the water go back in: 480 + 480 → 240 Rubber.
    addProductToFactory(factory, { id: 'Rubber', recipe: 'ResidualRubber', amount: 240 })

    // Recycled Plastic is the competing claim on the fuel: 240 Rubber + 240 Liquid Fuel → 480
    // Plastic. Whatever the generators are set to, 400/min is what is left for them.
    addProductToFactory(factory, { id: 'Plastic', recipe: 'Alternate_Plastic_1', amount: 480 })

    addPowerProducerToFactory(factory, {
      building: 'generatorfuel',
      fuelAmount: generatorFuel,
      recipe: 'GeneratorFuel_LiquidFuel',
      updated: FactoryPowerChangeType.Fuel,
    })
  }

  addPlant(overDrawing, 640) // Burning everything it makes, forgetting the Plastic line
  addPlant(spareFuel, 240) // Leaving 160/min of fuel doing nothing

  return {
    getFactories: () => factories,
  }
}
