import { ExportCalculatorFactorySettings, ExportCalculatorTransportGroup, Factory } from '@/interfaces/planner/FactoryInterface'
import { formatNumber, formatNumberFully } from '@/utils/numberFormatter'
import { DataInterface } from '@/interfaces/DataInterface'

export enum TransportMethod {
  Train = 'train_solid',
  Drone = 'drone',
  Truck = 'truck',
  Tractor = 'tractor'
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

  // Throw if attempting to transport a part with an unsupported method.
  // In reality this should never happen as the UI prevents it.
  // Fluids can travel by Train (Fluid Freight Car) and, since game patch 1.2, by Truck (Fluid Truck).
  if (isFluid && method !== TransportMethod.Train && method !== TransportMethod.Truck) {
    throw new Error('exportCalculator: calculateTransportRequired: Attempting to calculate a fluid part with a transport method that does not support it!')
  }

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

  // If a liquid, the stack size is the same as the stack capacity.
  // Fluid Freight Car holds 1600 m³, the Fluid Truck 3200 m³.
  if (isFluid) {
    stackCapacity = method === TransportMethod.Truck ? 3200 : 1600
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

// Solid exports go over conveyor belts, fluid exports over pipelines. The group mechanics
// are identical — only the speeds, marks and the settings field they persist to differ.
export type TransportGroupKind = 'belts' | 'pipes'

// Belt and pipeline throughput is not present in gameData, so the speeds are maintained here.
// https://satisfactory.wiki.gg/wiki/Conveyor_Belts and https://satisfactory.wiki.gg/wiki/Pipeline
export const conveyorBeltSpeeds: Record<number, number> = {
  1: 60,
  2: 120,
  3: 270,
  4: 480,
  5: 780,
  6: 1200,
}

export const pipelineSpeeds: Record<number, number> = {
  1: 300,
  2: 600,
}

export const transportGroupSpeeds = (kind: TransportGroupKind): Record<number, number> => {
  return kind === 'pipes' ? pipelineSpeeds : conveyorBeltSpeeds
}

export const transportGroupMarks = (kind: TransportGroupKind): number[] => {
  return Object.keys(transportGroupSpeeds(kind)).map(Number)
}

const getTransportGroups = (settings: ExportCalculatorFactorySettings, kind: TransportGroupKind) => {
  return kind === 'pipes' ? settings.pipeGroups : settings.beltGroups
}

const setTransportGroups = (settings: ExportCalculatorFactorySettings, kind: TransportGroupKind, groups: ExportCalculatorTransportGroup[]) => {
  if (kind === 'pipes') {
    settings.pipeGroups = groups
  } else {
    settings.beltGroups = groups
  }
}

export const calculateTransportGroupCount = (amount: number, mark: number, kind: TransportGroupKind): number => {
  const speed = transportGroupSpeeds(kind)[mark]

  if (!speed) {
    throw new Error(`exportCalculator: calculateTransportGroupCount: Unknown ${kind} mark ${mark}!`)
  }

  return amount / speed
}

// The whole number of belts/pipes to actually build for an amount — you can't build 0.4 of a belt.
export const calculateWholeTransportGroupCount = (amount: number, mark: number, kind: TransportGroupKind): number => {
  return Math.ceil(calculateTransportGroupCount(amount, mark, kind))
}

// The amount a whole number of belts/pipes can carry at full tilt.
export const transportGroupCapacity = (count: number, mark: number, kind: TransportGroupKind): number => {
  const speed = transportGroupSpeeds(kind)[mark]

  if (!speed) {
    throw new Error(`exportCalculator: transportGroupCapacity: Unknown ${kind} mark ${mark}!`)
  }

  return count * speed
}

// The smallest mark that carries the full amount on a single belt/pipe, maxing out at the highest mark.
export const getTransportMarkForAmount = (amount: number, kind: TransportGroupKind): number => {
  const marks = transportGroupMarks(kind)
  const speeds = transportGroupSpeeds(kind)
  const capable = marks.find(mark => speeds[mark] >= amount)
  return capable ?? marks.at(-1)!
}

// Ids only need to be unique within the group list — the next id above the highest existing one
// is deterministic and collision-free, unlike the random ids groups used to get.
const createTransportGroup = (existingGroups: ExportCalculatorTransportGroup[], mark: number, amount: number): ExportCalculatorTransportGroup => {
  return {
    id: Math.max(0, ...existingGroups.map(group => group.id)) + 1,
    mark,
    amount,
  }
}

// Settings saved before this feature existed have no groups, so they are initialized lazily.
export const initializeTransportGroups = (settings: ExportCalculatorFactorySettings, amount: number, kind: TransportGroupKind) => {
  const groups = getTransportGroups(settings, kind)
  if (!groups || groups.length === 0) {
    setTransportGroups(settings, kind, [createTransportGroup([], getTransportMarkForAmount(amount, kind), amount)])
  }
}

export const addTransportGroup = (settings: ExportCalculatorFactorySettings, totalAmount: number, kind: TransportGroupKind) => {
  initializeTransportGroups(settings, totalAmount, kind)
  const groups = getTransportGroups(settings, kind)!

  // Existing groups may be fine-tuned by the user, so they are never rebalanced automatically —
  // the new group just picks up whatever the export still lacks ("Split evenly" rebalances on demand).
  const shortfall = Math.max(0, totalAmount - getTransportGroupsAllocated(settings, kind))
  groups.push(createTransportGroup(groups, groups.at(-1)!.mark, formatNumberFully(shortfall)))
}

export const deleteTransportGroup = (settings: ExportCalculatorFactorySettings, groupId: number, totalAmount: number, kind: TransportGroupKind) => {
  const groups = getTransportGroups(settings, kind)

  // The last group cannot be deleted.
  if (!groups || groups.length <= 1) {
    return
  }

  const remaining = groups.filter(group => group.id !== groupId)
  setTransportGroups(settings, kind, remaining)

  // A lone remaining group always carries the full export.
  if (remaining.length === 1) {
    remaining[0].amount = totalAmount
  }
}

export const splitTransportGroupsEvenly = (settings: ExportCalculatorFactorySettings, totalAmount: number, kind: TransportGroupKind) => {
  const groups = getTransportGroups(settings, kind)

  if (!groups || groups.length === 0) {
    return
  }

  const share = formatNumberFully(totalAmount / groups.length)
  groups.forEach(group => {
    group.amount = share
  })

  // The last group absorbs rounding so the allocation always sums to the export amount.
  groups.at(-1)!.amount = formatNumberFully(totalAmount - share * (groups.length - 1))
}

export const getTransportGroupsAllocated = (settings: ExportCalculatorFactorySettings, kind: TransportGroupKind): number => {
  return (getTransportGroups(settings, kind) ?? []).reduce((sum, group) => sum + group.amount, 0)
}

// How many whole groups could be deleted with the remaining groups' built capacity still
// covering the export. Judged on whole-lane capacity (not allocated amounts) — a group's ceil
// headroom counts towards covering the export. Removing smallest-capacity groups first
// maximizes the number removable. Deliberate overcapacity with no removable group is NOT
// flagged — only groups that are entirely unnecessary.
export const getRedundantTransportGroupCount = (settings: ExportCalculatorFactorySettings, totalAmount: number, kind: TransportGroupKind): number => {
  const groups = getTransportGroups(settings, kind)

  if (!groups || groups.length <= 1 || totalAmount <= 0) {
    return 0
  }

  const capacities = groups
    .map(group => transportGroupCapacity(calculateWholeTransportGroupCount(group.amount, group.mark, kind), group.mark, kind))
    .sort((a, b) => a - b)

  let remaining = capacities.reduce((sum, capacity) => sum + capacity, 0)
  let redundant = 0

  for (const capacity of capacities) {
    if (remaining - capacity < totalAmount - 0.01) {
      break // Sorted ascending, so no larger group can be removable either.
    }
    remaining -= capacity
    redundant++
  }

  return redundant
}
