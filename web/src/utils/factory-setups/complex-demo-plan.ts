import { Factory } from '@/interfaces/planner/FactoryInterface'
import { addPowerProducerToFactory, addProductToFactory } from '@/utils/factory-management/products'
import { newFactory } from '@/utils/factory-management/factory'
import { addInputToFactory } from '@/utils/factory-management/inputs'

let oilFac: Factory
let copperIngotsFac: Factory
let copperBasicsFac: Factory
let circuitBoardsFac: Factory
let computersFac: Factory
let uraniumFac: Factory

// This is a more complex setup with multiple factories with dependencies going in a straight chain from Computers to Ingots and Oil Processing.
// This setup is used to test the more complex factory management functions.
// Copper Basics has a deliberate shortage of Copper Ingots to highlight that functionality to new users.
export const complexDemoPlan = (): { getFactories: () => Factory[] } => {
  // Initialize factories
  oilFac = newFactory('Oil Processing')
  copperIngotsFac = newFactory('Copper Ingots')
  copperBasicsFac = newFactory('Copper Basics')
  circuitBoardsFac = newFactory('Circuit Boards')
  computersFac = newFactory('Computers (end product)')
  uraniumFac = newFactory('☢️ Uranium Power')

  const factories = [oilFac, copperIngotsFac, copperBasicsFac, circuitBoardsFac, computersFac, uraniumFac]

  // Private methods to configure the factories
  const setupFactories = () => {
    // === OIL FAC ===
    addProductToFactory(oilFac, {
      id: 'Plastic',
      amount: 640,
      recipe: 'Plastic',
    })
    addProductToFactory(oilFac, {
      id: 'LiquidFuel',
      amount: 40,
      recipe: 'ResidualFuel',
    })
    addPowerProducerToFactory(oilFac, {
      building: 'generatorfuel',
      powerAmount: 500,
      recipe: 'GeneratorFuel_LiquidFuel',
      updated: 'power',
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
      amount: 120,
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
      updated: 'power',
    })
    uraniumFac.notes = 'This factory is producing nuclear fuel rods and using them via a nuclear power station. This demonstrates how power generators also can generate waste products which need to be handled.'
  }

  // Apply setup steps
  setupFactories()

  // Return an object with a method to access the configured factories
  return {
    getFactories: () => factories,
  }
}
