import { DataInterface } from '@/interfaces/DataInterface'
import {
  ExportCalculatorFactorySettings,
  ExportTransportMethod,
  Factory,
  Train,
  TrainCar,
  TrainCarCargo,
  TrainPlatformType,
  TrainStation,
} from '@/interfaces/planner/FactoryInterface'
import {
  conveyorBeltSpeeds,
  DEFAULT_TRANSPORT_TIME,
  initializeCalculatorFactoryPart,
  initializeCalculatorFactorySettings,
  pipelineSpeeds,
} from '@/utils/factory-management/exportCalculator'

// Every dock locks the whole station's belts while it transfers.
// https://satisfactory.wiki.gg/wiki/Tutorial:Train_throughput
export const DOCK_LOCKOUT_SECS = 27.08
export const FREIGHT_CAR_STACKS = 32
// Matches calculateTransportVehiclesForExporting until the in-game figure is confirmed.
export const FLUID_CAR_CAPACITY = 1600
// Two trains on six-minute round trips; only used to suggest a new station's layout.
const ASSUMED_LOCK_SHARE = 0.15

export const cargoKey = (cargo: TrainCarCargo) => `${cargo.factoryId}:${cargo.part}`

export const carCapacity = (part: string, gameData: DataInterface): number => {
  const data = gameData.items.parts[part]
  if (!data) return 0
  return data.isFluid ? FLUID_CAR_CAPACITY : data.stackSize * FREIGHT_CAR_STACKS
}

// The first locomotive sits at the station building; every extra one takes a platform.
export const carPlatformIndex = (train: Train, carIndex: number) => Math.max(1, train.locomotives) - 1 + carIndex

export const freightPlatformCount = (station: TrainStation) => station.platforms.filter(type => type !== 'empty').length

export const newTrainStationId = () => `s-${crypto.randomUUID().slice(0, 8)}`
export const newTrainId = () => `t-${crypto.randomUUID().slice(0, 8)}`

// One belt per platform, enough of them to carry the rate, on Mk.5 unless the docking
// lockout would leave Mk.5 short. 3,120/min is four platforms, on Mk.6.
export const suggestStationLayout = (amount: number): { platforms: number, beltMark: number } => {
  if (amount <= 0) return { platforms: 4, beltMark: 5 }
  const platforms = Math.max(1, Math.ceil(amount / conveyorBeltSpeeds[5]))
  const mk5Clears = platforms * conveyorBeltSpeeds[5] * (1 - ASSUMED_LOCK_SHARE)
  return { platforms, beltMark: mk5Clears >= amount ? 5 : 6 }
}

export const addTrainStation = (
  factory: Factory,
  options: { name: string, platforms: number, beltMark?: number, beltsPerPlatform?: number },
): TrainStation => {
  const station: TrainStation = {
    id: newTrainStationId(),
    name: options.name.trim() || `Station ${(factory.trainStations?.length ?? 0) + 1}`,
    platforms: Array.from({ length: Math.max(1, Math.round(options.platforms)) }, () => 'freight' as TrainPlatformType),
    beltsPerPlatform: options.beltsPerPlatform ?? 1,
    beltMark: options.beltMark ?? 5,
    buffered: false,
    trains: [],
  }
  factory.trainStations = [...(factory.trainStations ?? []), station]
  return station
}

export const removeTrainStation = (factory: Factory, stationId: string) => {
  factory.trainStations = (factory.trainStations ?? []).filter(station => station.id !== stationId)
}

export const setStationPlatformCount = (station: TrainStation, count: number) => {
  const target = Math.max(1, Math.round(count))
  while (station.platforms.length < target) station.platforms.push('freight')
  station.platforms.splice(target)
}

// A new train copies the station's first train's round trip, else the export's old train time.
export const addTrain = (
  station: TrainStation,
  options: { name: string, cargo: TrainCarCargo | null, fallbackRoundTripSecs?: number },
): Train => {
  const fallback = options.fallbackRoundTripSecs && options.fallbackRoundTripSecs !== DEFAULT_TRANSPORT_TIME
    ? options.fallbackRoundTripSecs
    : 0
  const train: Train = {
    id: newTrainId(),
    name: options.name.trim() || `Train ${station.trains.length + 1}`,
    roundTripSecs: station.trains[0]?.roundTripSecs ?? fallback,
    locomotives: 1,
    cars: Array.from({ length: Math.max(1, freightPlatformCount(station)) }, () => ({
      cargo: options.cargo ? { ...options.cargo } : null,
    })),
  }
  station.trains.push(train)
  return train
}

export const removeTrain = (station: TrainStation, trainId: string) => {
  station.trains = station.trains.filter(train => train.id !== trainId)
}

export const setTrainLocomotives = (train: Train, count: number) => {
  train.locomotives = Math.max(1, Math.round(count))
}

// A new car carries what the last one does, the common case on a single-cargo train.
export const addTrainCar = (train: Train) => {
  const last = train.cars.at(-1)?.cargo
  train.cars.push({ cargo: last ? { ...last } : null })
}

export const removeTrainCar = (train: Train, carIndex: number) => {
  if (train.cars.length <= 1) return
  train.cars.splice(carIndex, 1)
}

export const setTrainCarCargo = (car: TrainCar, cargo: TrainCarCargo | null) => {
  car.cargo = cargo ? { ...cargo } : null
}

export interface CarFlow {
  carIndex: number
  platformIndex: number // -1 when the car hangs past the last platform
  cargo: TrainCarCargo | null
  capacityPerMin: number
  deliveredPerMin: number
}

export interface TrainFlow {
  train: Train
  cars: CarFlow[]
}

export interface PlatformFlow {
  index: number
  type: TrainPlatformType
  deliveredPerMin: number
  clearPerMin: number
  overloaded: boolean
}

export interface StationFlow {
  station: TrainStation
  trains: TrainFlow[]
  platforms: PlatformFlow[]
  // Share of each minute some train is docked and the belts are stopped.
  lockShare: number
  // Trains the station takes before another one slows it down; null when it cannot tell yet.
  roomForTrains: number | null
  emptyCars: number
  overhangingCars: number
}

export interface CargoFlow {
  cargo: TrainCarCargo
  requested: number
  capacity: number
  delivered: number
  short: number
}

export interface RailFlow {
  stations: StationFlow[]
  cargo: Record<string, CargoFlow>
}

const requestedAmount = (consumer: Factory, cargo: TrainCarCargo) =>
  consumer.inputs
    .filter(input => input.factoryId === cargo.factoryId && input.outputPart === cargo.part)
    .reduce((sum, input) => sum + input.amount, 0)

const perMinute = (load: number, roundTripSecs: number) => roundTripSecs > 0 ? load * 60 / roundTripSecs : 0

const platformClearRate = (station: TrainStation, type: TrainPlatformType, lockShare: number) => {
  if (type === 'empty') return 0
  const speeds = type === 'fluid' ? pipelineSpeeds : conveyorBeltSpeeds
  const speed = speeds[Math.min(station.beltMark, type === 'fluid' ? 2 : 6)] ?? 0
  return station.beltsPerPlatform * speed * (station.buffered ? 1 : 1 - lockShare)
}

// Trains a station takes before another one slows it down. Each train brings full cars, and every
// dock stops the platforms emptying, so throughput is the lesser of the two; the best whole number
// of trains is where it peaks. Averaged over the timed trains, so it is an estimate.
const roomForTrains = (station: TrainStation, flows: TrainFlow[]): number | null => {
  const timed = flows.filter(flow => flow.train.roundTripSecs > 0)
  const carLoad = Math.max(0, ...timed.flatMap(flow => flow.cars.map(car => car.capacityPerMin * flow.train.roundTripSecs / 60)))
  if (timed.length === 0 || carLoad === 0) return null
  const platforms = freightPlatformCount(station)
  const beltRate = platformClearRate(station, 'freight', 0)
  const avgTripMins = timed.reduce((sum, flow) => sum + flow.train.roundTripSecs, 0) / timed.length / 60
  const avgCars = timed.reduce((sum, flow) => sum + flow.cars.filter(car => car.platformIndex !== -1).length, 0) / timed.length
  const throughput = (trains: number) => Math.min(
    trains * avgCars * carLoad / avgTripMins,
    platforms * beltRate * Math.max(0, 1 - trains * DOCK_LOCKOUT_SECS / 60 / avgTripMins),
  )
  let best = 1
  for (let trains = 2; trains <= 100 && throughput(trains) > throughput(best); trains++) best = trains
  return best - timed.length
}

export const analyseRail = (consumer: Factory, gameData: DataInterface): RailFlow => {
  const stations = consumer.trainStations ?? []

  const trainCars = stations.map(station => station.trains.map(train => train.cars.map((car, carIndex): CarFlow => {
    const platformIndex = carPlatformIndex(train, carIndex)
    return {
      carIndex,
      platformIndex: platformIndex < station.platforms.length ? platformIndex : -1,
      cargo: car.cargo,
      capacityPerMin: car.cargo ? perMinute(carCapacity(car.cargo.part, gameData), train.roundTripSecs) : 0,
      deliveredPerMin: 0,
    }
  })))

  // An export spread over several cars (or trains, or stations) fills them evenly.
  const cargo: Record<string, CargoFlow> = {}
  trainCars.flat(2).forEach(car => {
    if (!car.cargo) return
    const key = cargoKey(car.cargo)
    cargo[key] ??= { cargo: car.cargo, requested: requestedAmount(consumer, car.cargo), capacity: 0, delivered: 0, short: 0 }
    cargo[key].capacity += car.capacityPerMin
  })
  Object.values(cargo).forEach(flow => {
    flow.delivered = Math.min(flow.requested, flow.capacity)
    flow.short = Math.max(0, flow.requested - flow.capacity)
  })
  trainCars.flat(2).forEach(car => {
    const flow = car.cargo ? cargo[cargoKey(car.cargo)] : undefined
    car.deliveredPerMin = flow && flow.capacity > 0 ? car.capacityPerMin * flow.delivered / flow.capacity : 0
  })

  const stationFlows = stations.map((station, stationIndex): StationFlow => {
    const trains = station.trains.map((train, trainIndex) => ({ train, cars: trainCars[stationIndex][trainIndex] }))
    const lockShare = Math.min(1, station.trains.reduce(
      (sum, train) => sum + (train.roundTripSecs > 0 ? DOCK_LOCKOUT_SECS / train.roundTripSecs : 0), 0))
    const cars = trains.flatMap(flow => flow.cars)
    const platforms = station.platforms.map((type, index): PlatformFlow => {
      const deliveredPerMin = cars.filter(car => car.platformIndex === index).reduce((sum, car) => sum + car.deliveredPerMin, 0)
      const clearPerMin = platformClearRate(station, type, lockShare)
      return { index, type, deliveredPerMin, clearPerMin, overloaded: deliveredPerMin > clearPerMin + 0.5 }
    })
    return {
      station,
      trains,
      platforms,
      lockShare,
      roomForTrains: roomForTrains(station, trains),
      emptyCars: cars.filter(car => !car.cargo).length,
      overhangingCars: cars.filter(car => car.platformIndex === -1).length,
    }
  })

  return { stations: stationFlows, cargo }
}

export type TransportState = 'unset' | 'guessed' | 'pending' | 'ok' | 'short'

export interface ExportTransport {
  method?: ExportTransportMethod
  state: TransportState
  shortBy: number
}

// A time changed from its default points at that method, but only when exactly one was changed.
export const guessTransportMethod = (settings?: ExportCalculatorFactorySettings): ExportTransportMethod | undefined => {
  if (!settings) return undefined
  const timed = ([
    ['train', settings.trainTime],
    ['drone', settings.droneTime],
    ['truck', settings.truckTime],
    ['tractor', settings.tractorTime],
  ] as [ExportTransportMethod, number][]).filter(([, time]) => time > 0 && time !== DEFAULT_TRANSPORT_TIME)
  return timed.length === 1 ? timed[0][0] : undefined
}

export const getExportSettings = (producer: Factory, part: string, consumerId: number) =>
  producer.exportCalculator[part]?.factorySettings?.[consumerId.toString()]

export const setExportTransportMethod = (producer: Factory, part: string, consumerId: number, method: ExportTransportMethod) => {
  initializeCalculatorFactoryPart(producer, part)
  initializeCalculatorFactorySettings(producer, part, consumerId.toString())
  producer.exportCalculator[part].factorySettings[consumerId.toString()].method = method
}

export const exportTransport = (
  producer: Factory,
  part: string,
  consumer: Factory | undefined,
  gameData: DataInterface,
): ExportTransport => {
  if (!consumer) return { state: 'unset', shortBy: 0 }
  const settings = getExportSettings(producer, part, consumer.id)
  if (!settings?.method) {
    const guess = guessTransportMethod(settings)
    return guess ? { method: guess, state: 'guessed', shortBy: 0 } : { state: 'unset', shortBy: 0 }
  }
  if (settings.method !== 'train') return { method: settings.method, state: 'ok', shortBy: 0 }

  const rail = analyseRail(consumer, gameData)
  const key = cargoKey({ factoryId: producer.id, part })
  const flow = rail.cargo[key]
  if (!flow) return { method: 'train', state: 'pending', shortBy: 0 }

  const overloaded = rail.stations.some(station => station.platforms.some(platform =>
    platform.overloaded && station.trains.some(train =>
      train.cars.some(car => car.platformIndex === platform.index && car.cargo && cargoKey(car.cargo) === key))))
  const shortBy = flow.short
  return { method: 'train', state: shortBy > 0.5 || overloaded ? 'short' : 'ok', shortBy }
}

export const formatRoundTrip = (secs: number) => {
  const whole = Math.round(secs)
  return whole > 0 ? `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}` : ''
}

// Accepts 5:20, 5m 20s or plain seconds. Null when it cannot read it; empty is no time yet.
export const parseRoundTrip = (text: string): number | null => {
  const trimmed = text.trim().toLowerCase()
  if (!trimmed) return 0
  const colon = /^(\d+):(\d{1,2})$/.exec(trimmed)
  if (colon) return Number(colon[1]) * 60 + Number(colon[2])
  const units = /^(?:(\d+)\s*m)?\s*(?:(\d+)\s*s)?$/.exec(trimmed)
  if (units && (units[1] || units[2])) return Number(units[1] ?? 0) * 60 + Number(units[2] ?? 0)
  const secs = Number(trimmed)
  return Number.isFinite(secs) && secs >= 0 ? Math.round(secs) : null
}
