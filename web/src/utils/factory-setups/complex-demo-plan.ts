import { Factory, FactoryPowerChangeType, ItemType } from '@/interfaces/planner/FactoryInterface'
import { addProductToFactory } from '@/utils/factory-management/products'
import { addPowerProducerToFactory } from '@/utils/factory-management/power'
import { newFactory } from '@/utils/factory-management/factory'
import { addInputToFactory } from '@/utils/factory-management/inputs'
import { TemplatePlan } from '@/utils/factory-setups/template-plan'

let oilFac: Factory
let copperIngotsFac: Factory
let copperBasicsFac: Factory
let circuitBoardsFac: Factory
let computersFac: Factory
let uraniumFac: Factory
let plutoniumFac: Factory
let alienPowerFac: Factory
let geothermalFac: Factory

// This is a more complex setup with multiple factories with dependencies going in a straight chain from Computers to Ingots and Oil Processing.
// This setup is used to test the more complex factory management functions.
// Copper Basics has a deliberate shortage of Copper Ingots to highlight that functionality to new users.
export const complexDemoPlan = (): TemplatePlan => {
  // Initialize factories
  oilFac = newFactory('Oil Processing', 1, 1)
  copperIngotsFac = newFactory('Copper Ingots', 2, 2)
  copperBasicsFac = newFactory('Copper Basics', 3, 3)
  circuitBoardsFac = newFactory('Circuit Boards', 4, 4)
  computersFac = newFactory('Computers (end product)', 5, 5)
  uraniumFac = newFactory('☢️ Uranium Power', 6, 6)
  plutoniumFac = newFactory('☢️ Plutonium Processing', 7, 7)
  alienPowerFac = newFactory('Alien Power', 8, 8)
  geothermalFac = newFactory('Geothermal Power', 9, 9)

  const factories = [oilFac, copperIngotsFac, copperBasicsFac, circuitBoardsFac, computersFac, uraniumFac, plutoniumFac, alienPowerFac, geothermalFac]

  // Private methods to configure the factories
  const setupFactories = () => {
    // === OIL FAC ===
    addProductToFactory(oilFac, {
      id: 'Plastic',
      amount: 640,
      recipe: 'Plastic',
    })
    // Overclocking showcase: most of the Plastic line runs at stock clock, with four
    // refineries pushed to 200% — costing 2 Power Shards per building (8 total), shown
    // in the Power Shards & Somersloops statistics. 24 + 4x2 = 32 effective buildings.
    oilFac.products[0].buildingGroups = [
      {
        id: 901,
        type: ItemType.Product,
        buildingCount: 24,
        overclockPercent: 100,
        somersloops: 0,
        parts: {},
        powerUsage: 0,
        powerProduced: 0,
      },
      {
        id: 902,
        type: ItemType.Product,
        buildingCount: 4,
        overclockPercent: 200,
        somersloops: 0,
        parts: {},
        powerUsage: 0,
        powerProduced: 0,
      },
    ]
    // Mirrors the app: adding a second group turns off item sync so the custom split sticks.
    oilFac.products[0].buildingGroupItemSync = false
    // Start with the tray open so the overclock showcase is visible immediately.
    oilFac.products[0].buildingGroupsTrayOpen = true
    addProductToFactory(oilFac, {
      id: 'LiquidFuel',
      amount: 40,
      recipe: 'ResidualFuel',
    })
    addPowerProducerToFactory(oilFac, {
      building: 'generatorfuel',
      powerAmount: 500,
      recipe: 'GeneratorFuel_LiquidFuel',
      updated: FactoryPowerChangeType.Power,
    })
    oilFac.notes = 'This factory is producing fuel which is burned off internally, also demonstrating how power generators work.\n\nIt also purposefully has a surplus of Heavy Oil Residue which unless handled would cause a blockage in the system.'
    oilFac.syncState = {
      Plastic: {
        amount: 640,
        recipe: 'Plastic',
      },
      LiquidFuel: {
        amount: 40,
        recipe: 'ResidualFuel',
      },
    }
    oilFac.syncStatePower = {
      generatorfuel: {
        powerAmount: 500,
        buildingAmount: 2,
        recipe: 'GeneratorFuel_LiquidFuel',
        ingredientAmount: 40,
      },
    }
    oilFac.inSync = true
    // =================

    // === COPPER INGOTS FAC ===
    addProductToFactory(copperIngotsFac, {
      id: 'CopperIngot',
      amount: 320,
      recipe: 'IngotCopper',
    })
    copperIngotsFac.syncState = {
      CopperIngot: {
        amount: 320,
        recipe: 'IngotCopper',
      },
    }
    copperIngotsFac.inSync = true
    // =================

    // === COPPER BASICS FAC ===
    addProductToFactory(copperBasicsFac, {
      id: 'Wire',
      amount: 400,
      recipe: 'Wire',
    })
    addProductToFactory(copperBasicsFac, {
      id: 'Cable',
      amount: 200,
      recipe: 'Cable',
    })
    addProductToFactory(copperBasicsFac, {
      id: 'CopperSheet',
      amount: 160,
      recipe: 'CopperSheet',
    })
    // Overclocking showcase: the whole sheet line runs at 200% — half the constructors
    // for the same output, at 2 Power Shards each (16 total). 8 x 2 = 16 effective.
    copperBasicsFac.products[2].buildingGroups = [
      {
        id: 903,
        type: ItemType.Product,
        buildingCount: 8,
        overclockPercent: 200,
        somersloops: 0,
        parts: {},
        powerUsage: 0,
        powerProduced: 0,
      },
    ]
    // Start with the tray open so the overclock showcase is visible immediately.
    copperBasicsFac.products[2].buildingGroupsTrayOpen = true
    addInputToFactory(copperBasicsFac, {
      factoryId: copperIngotsFac.id,
      outputPart: 'CopperIngot',
      amount: 320, // Deliberate shortage, should be 520.
    })
    copperBasicsFac.notes = 'This factory is deliberately short on Copper Ingots to highlight the shortage functionality. It is also over producing cables by 40 to show trimming.'
    // =================

    // === CIRCUIT BOARDS FAC ===
    addProductToFactory(circuitBoardsFac, {
      id: 'CircuitBoard',
      amount: 80,
      recipe: 'CircuitBoard',
    })
    addInputToFactory(circuitBoardsFac, {
      factoryId: copperBasicsFac.id,
      outputPart: 'CopperSheet',
      amount: 160,
    })
    addInputToFactory(circuitBoardsFac, {
      factoryId: oilFac.id,
      outputPart: 'Plastic',
      amount: 320,
    })
    // =================

    // === COMPUTERS FAC ===
    addProductToFactory(computersFac, {
      id: 'Computer',
      amount: 20,
      recipe: 'Computer',
    })
    addInputToFactory(computersFac, {
      factoryId: oilFac.id,
      outputPart: 'Plastic',
      amount: 320,
    })
    addInputToFactory(computersFac, {
      factoryId: copperBasicsFac.id,
      outputPart: 'Cable',
      amount: 160,
    })
    addInputToFactory(computersFac, {
      factoryId: circuitBoardsFac.id,
      outputPart: 'CircuitBoard',
      amount: 80,
    })
    computersFac.notes = 'This factory is the end product of the chain / plan. While not yet supported, it will eventually show that the computers will be sunk or for space elevator parts used in the construction of Project Assembly.'
    // =================

    // === URANIUM FAC ===
    addProductToFactory(uraniumFac, {
      id: 'Cement',
      amount: 60,
      recipe: 'Concrete',
    })
    addProductToFactory(uraniumFac, {
      id: 'SulfuricAcid',
      amount: 160,
      recipe: 'SulfuricAcid',
    })
    addProductToFactory(uraniumFac, {
      id: 'ElectromagneticControlRod',
      amount: 10,
      recipe: 'ElectromagneticControlRod',
    })
    addProductToFactory(uraniumFac, {
      id: 'NuclearFuelRod',
      amount: 2,
      recipe: 'NuclearFuelRod',
    })
    addProductToFactory(uraniumFac, {
      id: 'UraniumCell',
      amount: 100,
      recipe: 'UraniumCell',
    })
    addPowerProducerToFactory(uraniumFac, {
      building: 'generatornuclear',
      powerAmount: 25000,
      recipe: 'GeneratorNuclear_NuclearFuelRod',
      updated: FactoryPowerChangeType.Power,
    })
    uraniumFac.notes = 'This factory is producing nuclear fuel rods and using them via a nuclear power station. This demonstrates how power generators also can generate waste products which need to be handled.'
    uraniumFac.tasks.push(
      { title: 'Add Stators factory to supply this one', completed: false },
      { title: 'Make a place for the waste to go', completed: false },
      { title: 'Get a hazmat suit', completed: true }
    )
    // =================

    // === PLUTONIUM FAC ===
    addProductToFactory(plutoniumFac, {
      id: 'NonFissibleUranium',
      amount: 33.333,
      recipe: 'NonFissileUranium',
    })
    addInputToFactory(plutoniumFac, {
      factoryId: uraniumFac.id,
      outputPart: 'NuclearWaste',
      amount: 100,
    })
    // =================

    // === ALIEN POWER FAC ===
    addPowerProducerToFactory(alienPowerFac, {
      building: 'alienpoweraugmenter',
      buildingAmount: 3,
      recipe: 'AlienPowerAugmenter',
      updated: FactoryPowerChangeType.Building,
    })
    // Two augmenters supplied with Alien Power Matrixes (+30% grid boost each) and one
    // running unfueled (+10%). Constructing each augmenter costs 10 Somersloops, which
    // surfaces in the Power Shards & Somersloops statistics.
    alienPowerFac.powerProducers[0].buildingGroups = [
      {
        id: 801,
        type: ItemType.Power,
        buildingCount: 2,
        overclockPercent: 100,
        somersloops: 0,
        parts: {},
        powerUsage: 0,
        powerProduced: 0,
        supplyMatrixes: true,
      },
      {
        id: 802,
        type: ItemType.Power,
        buildingCount: 1,
        overclockPercent: 100,
        somersloops: 0,
        parts: {},
        powerUsage: 0,
        powerProduced: 0,
      },
    ]
    // Start with the tray open so the matrix-supply toggle showcase is visible immediately.
    alienPowerFac.powerProducers[0].buildingGroupsTrayOpen = true
    alienPowerFac.notes = 'Alien Power Augmenters generate 500 MW each and boost the whole grid: +10% of total generation per augmenter, or +30% when supplied with Alien Power Matrixes.\n\nThe two fueled augmenters create a deliberate Alien Power Matrix shortage (5/min each) to show how matrix demand lands on the satisfaction ledger. Each augmenter also costs 10 Somersloops to construct — see the Power Shards & Somersloops statistics.'
    // =================

    // === GEOTHERMAL POWER FAC ===
    // One producer per geyser purity: Impure 100 MW, Normal 200 MW, Pure 400 MW average
    // per generator, each oscillating between 0.5x and 1.5x of that.
    addPowerProducerToFactory(geothermalFac, {
      building: 'geothermalgenerator',
      buildingAmount: 4,
      recipe: 'GeneratorGeoThermal_Impure',
      updated: FactoryPowerChangeType.Building,
    })
    addPowerProducerToFactory(geothermalFac, {
      building: 'geothermalgenerator',
      buildingAmount: 3,
      recipe: 'GeneratorGeoThermal_Normal',
      updated: FactoryPowerChangeType.Building,
    })
    addPowerProducerToFactory(geothermalFac, {
      building: 'geothermalgenerator',
      buildingAmount: 2,
      recipe: 'GeneratorGeoThermal_Pure',
      updated: FactoryPowerChangeType.Building,
    })
    geothermalFac.notes = 'Geothermal Generators are fuel-less — pick the geyser\'s node purity and the planner shows the average output (Impure 100 MW, Normal 200 MW, Pure 400 MW) plus the 0.5x-1.5x oscillation range the game swings between.'
  }

  // Apply setup steps
  setupFactories()

  // Return an object with a method to access the configured factories
  return {
    getFactories: () => factories,
    // 40 GW: comfortably above the plan's ~27 GW of generation, so the demo also
    // shows off the power-target (bullseye) deficit feature.
    powerTarget: 40_000,
  }
}
