// The plan attached to issue #485 (shared as 'putrid-dirty-secretary'), captured verbatim.
//
// 240 Fuel Generators on Rocket Fuel, clocked to 240%. Every Rocket Fuel figure in it reads
// 2400.002 instead of 2400, and the producer carries the old 59.999952 mwPerItem the game
// data used to ship. Saved plans like this are what repairPlanPrecision exists to fix.
import { Factory, FactoryPowerChangeType } from '@/interfaces/planner/FactoryInterface'
import { newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { addPowerProducerToFactory } from '@/utils/factory-management/power'
import { addInputToFactory } from '@/utils/factory-management/inputs'
import { TemplatePlan } from '@/utils/factory-setups/template-plan'

export const create485Scenario = (): Factory[] => {
  return [
    {
      id: 1378,
      name: 'FG TEST',
      products: [],
      byProducts: [],
      powerProducers: [
        {
          id: '1023',
          building: 'generatorfuel',
          buildingAmount: 576,
          buildingCount: 576,
          ingredients: [
            {
              part: 'RocketFuel',
              perMin: 2400.002,
              mwPerItem: 59.999952000038405,
            },
          ],
          fuelAmount: 2400.002,
          powerAmount: 144000,
          powerProduced: 144000,
          recipe: 'GeneratorFuel_RocketFuel',
          byproduct: null,
          displayOrder: 0,
          updated: 'building',
          buildingGroups: [
            {
              id: 4842,
              type: 'Power',
              buildingCount: 240,
              overclockPercent: 240,
              somersloops: 0,
              parts: {
                RocketFuel: 2400.002,
              },
              powerUsage: 0,
              powerProduced: 144000,
              powerProducedMin: 144000,
              powerProducedMax: 144000,
              clockSetByUser: true,
            },
          ],
          buildingGroupsHaveProblem: false,
          buildingGroupsTrayOpen: true,
          buildingGroupItemSync: true,
        },
      ],
      inputs: [],
      previousInputs: [],
      parts: {
        RocketFuel: {
          amountRequired: 2400.002,
          amountRequiredExports: 0,
          amountRequiredProduction: 0,
          amountRequiredPower: 2400.002,
          amountSupplied: 0,
          amountSuppliedViaInput: 0,
          amountSuppliedViaRaw: 0,
          amountSuppliedViaProduction: 0,
          amountRemaining: -2400.002,
          satisfied: false,
          isRaw: false,
          exportable: false,
        },
      },
      buildingRequirements: {
        generatorfuel: {
          name: 'generatorfuel',
          amount: 240,
          powerProduced: 144000,
        },
      },
      dependencies: {
        requests: {},
        metrics: {},
      },
      exportCalculator: {},
      rawResources: {},
      power: {
        consumed: 0,
        consumedMin: 0,
        consumedMax: 0,
        produced: 144000,
        producedMin: 144000,
        producedMax: 144000,
        difference: 0,
        boostPercent: 0,
        boostMw: 0,
        boostFueledBuildings: 0,
        boostUnfueledBuildings: 0,
      },
      requirementsSatisfied: true,
      usingRawResourcesOnly: false,
      hidden: false,
      hasProblem: false,
      inSync: null,
      syncState: {},
      syncStatePower: {},
      displayOrder: 0,
      tasks: [],
      notes: '',
      dataVersion: '2025-01-03',
    },
  ] as unknown as Factory[]
}

// A fuller plan for exercising the repair by hand: three factories, each drifted in a
// different way and by a different amount. Built on top of the captured factory above so
// the headline case stays real save data rather than something we made up.
//
// Every figure here is what the old 59.999952 / 10.499996 mwPerItem actually produced:
//   2,880 gens x 250 MW / 59.999952 = 12000.0096   -> 12000.01
//     420 gens x  75 MW / 10.499996 =  3000.0012   ->  3000.001
export const create485DemoPlan = (): TemplatePlan => {
  const [fgTest] = create485Scenario()

  const refinery = newFactory('Rocket Fuel Refinery', 0)
  const megaPlant = newFactory('Mega Rocket Fuel Plant', 2)
  fgTest.displayOrder = 1

  // Drift beyond the flat 0.002 snap tolerance — only a tolerance that scales catches it.
  addProductToFactory(refinery, {
    id: 'RocketFuel',
    amount: 14400.012,
    recipe: 'RocketFuel',
  })

  // A second, differently-drifted generator on the factory from the issue, so one factory
  // heading carries more than one item.
  addPowerProducerToFactory(fgTest, {
    building: 'generatorcoal',
    fuelAmount: 3000.001,
    recipe: 'GeneratorCoal_CompactedCoal',
    updated: FactoryPowerChangeType.Fuel,
  })

  addPowerProducerToFactory(megaPlant, {
    building: 'generatorfuel',
    fuelAmount: 12000.01,
    recipe: 'GeneratorFuel_RocketFuel',
    updated: FactoryPowerChangeType.Fuel,
  })

  // Imports carry the drift too — they mirror what the producing factory said it made.
  addInputToFactory(fgTest, {
    factoryId: refinery.id,
    outputPart: 'RocketFuel',
    amount: 2400.002,
  })
  addInputToFactory(megaPlant, {
    factoryId: refinery.id,
    outputPart: 'RocketFuel',
    amount: 12000.01,
  })

  return {
    getFactories: () => [refinery, fgTest, megaPlant],
    powerTarget: 0,
  }
}
