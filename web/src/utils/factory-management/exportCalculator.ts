import { Factory } from '@/interfaces/planner/FactoryInterface'
import { formatNumber } from '@/utils/numberFormatter'
import { DataInterface } from '@/interfaces/DataInterface'

export enum TransportMethod {
  Train = 'train_solid',
  Drone = 'drone',
  Truck = 'truck',
  Tractor = 'tractor',
}

export const initializeCalculatorFactoryPart = (factory: Factory, part: string) => {
  if (!factory.exportCalculator[part]) {
    factory.exportCalculator[part] = {
      selected: null,
      factorySettings: {},
    }
  }
}

export const initializeCalculatorFactorySettings = (factory: Factory, part: string, factoryId: string) => {
  if (!factory.exportCalculator[part].factorySettings) {
    throw new Error('calculator: Was asked to initialize factory settings, but factory settings parent object is not defined!')
  }

  if (!factory.exportCalculator[part].factorySettings[factoryId]) {
    factory.exportCalculator[part].factorySettings[factoryId] = {
      trainTime: 123,
      droneTime: 123,
      truckTime: 123,
      tractorTime: 123,
    }
  }
}

export const calculateTransportVehiclesForExporting = (
  part: string,
  amount: number,
  method: TransportMethod,
  time: number,
  gameData: DataInterface
) => {
  // 1. Get the product info from game data
  const partData = gameData.items.parts[part]

  if (!partData) {
    throw new Error(`exportCalculator: calculateTransportRequired: Part ${part} not found in game data!`)
  }
  if (partData.stackSize === undefined || partData.isFluid === undefined) {
    throw new Error(`exportCalculator: calculateTransportRequired: Missing required parts of data for part ${part}!`)
  }

  const isFluid = gameData.items.parts[part].isFluid

  // 2. Get the carrying capacity of the vehicle in stacks
  let stackCapacity = 0

  if (method === TransportMethod.Train) {
    stackCapacity = 32
  } else if (method === TransportMethod.Drone) {
    stackCapacity = 9
  } else if (method === TransportMethod.Truck) {
    stackCapacity = 48
  } else if (method === TransportMethod.Tractor) {
    stackCapacity = 25
  } else {
    throw new Error('exportCalculator: calculateTransportRequired: Unknown transport method!')
  }

  // If a liquid, the stack size is the same as the stack capacity
  if (isFluid) {
    stackCapacity = 1600
  }

  // 3. Calculate the throughput of the item based on stack size (more stackSize = higher throughput)
  let itemThroughput

  if (isFluid) {
    // If it is a liquid, there is no concept of stack sizes.
    itemThroughput = stackCapacity
  } else {
    itemThroughput = stackCapacity * partData.stackSize
  }

  // Need amount/min of the product, divided by the vehicle capacity divided by the round trip time
  const vehiclesNeeded = (amount / 60) / (itemThroughput / time)

  return formatNumber(vehiclesNeeded)
}
