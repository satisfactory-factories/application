import { DataInterface } from '@/interfaces/DataInterface'
import {
  ExportCalculatorFactorySettings,
  ExportTransportMethod,
  Factory,
  Train,
  TrainCar,
  TrainDestination,
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

export const stationKey = (factoryId: number, stationId: string) => `${factoryId}:${stationId}`
export const routeKey = (producerId: number, consumerId: number, part: string) => `${producerId}>${consumerId}:${part}`

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

// Trains elsewhere that unloaded here lose their destination rather than pointing at nothing.
// Returns the factories whose trains changed, so the caller can declare them edited.
export const removeTrainStation = (factory: Factory, stationId: string, factories: Factory[]): Factory[] => {
  factory.trainStations = (factory.trainStations ?? []).filter(station => station.id !== stationId)
  return factories.filter(other => {
    let changed = false
    other.trainStations?.forEach(station => station.trains.forEach(train => {
      if (train.destination?.factoryId === factory.id && train.destination.stationId === stationId) {
        train.destination = null
        changed = true
      }
    }))
    return changed
  })
}

export const setStationPlatformCount = (station: TrainStation, count: number) => {
  const target = Math.max(1, Math.round(count))
  while (station.platforms.length < target) station.platforms.push('freight')
  station.platforms.splice(target)
}

// A new train copies the station's first train's round trip, else the export's old train time.
export const addTrain = (
  station: TrainStation,
  options: { name: string, part: string | null, destination: TrainDestination | null, fallbackRoundTripSecs?: number },
): Train => {
  const fallback = options.fallbackRoundTripSecs && options.fallbackRoundTripSecs !== DEFAULT_TRANSPORT_TIME
    ? options.fallbackRoundTripSecs
    : 0
  const train: Train = {
    id: newTrainId(),
    name: options.name.trim() || `Train ${station.trains.length + 1}`,
    roundTripSecs: station.trains[0]?.roundTripSecs ?? fallback,
    locomotives: 1,
    cars: Array.from({ length: Math.max(1, freightPlatformCount(station)) }, () => ({ part: options.part })),
    destination: options.destination ? { ...options.destination } : null,
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
  train.cars.push({ part: train.cars.at(-1)?.part ?? null })
}

export const removeTrainCar = (train: Train, carIndex: number) => {
  if (train.cars.length <= 1) return
  train.cars.splice(carIndex, 1)
}

export const setTrainCarPart = (car: TrainCar, part: string | null) => {
  car.part = part
}

export const setTrainDestination = (train: Train, destination: TrainDestination | null) => {
  train.destination = destination ? { ...destination } : null
}

export interface CarFlow {
  carIndex: number
  part: string | null
  capacityPerMin: number
  deliveredPerMin: number
}

export interface TrainFlow {
  train: Train
  origin: Factory
  loadingStation: TrainStation
  destination?: { factory: Factory, station: TrainStation }
  cars: CarFlow[]
}

export interface PlatformFlow {
  index: number
  type: TrainPlatformType
  loadPerMin: number
  unloadPerMin: number
  clearPerMin: number
  overloaded: boolean
}

export interface StationFlow {
  factory: Factory
  station: TrainStation
  // Trains that load here, and trains from elsewhere that unload here.
  outgoing: TrainFlow[]
  incoming: TrainFlow[]
  platforms: PlatformFlow[]
  // Share of each minute some train is docked and the belts are stopped.
  lockShare: number
  // Trains the station takes before another one slows it down; null when it cannot tell yet.
  roomForTrains: number | null
  emptyCars: number
  overhangingCars: number
}

export interface ExportFlow {
  producerId: number
  consumerId: number
  part: string
  requested: number
  capacity: number
  delivered: number
  short: number
}

export interface NetworkFlow {
  trains: TrainFlow[]
  stations: Record<string, StationFlow>
  exports: Record<string, ExportFlow>
}

const perMinute = (load: number, roundTripSecs: number) => roundTripSecs > 0 ? load * 60 / roundTripSecs : 0

const platformClearRate = (station: TrainStation, type: TrainPlatformType, lockShare: number) => {
  if (type === 'empty') return 0
  const speeds = type === 'fluid' ? pipelineSpeeds : conveyorBeltSpeeds
  const speed = speeds[Math.min(station.beltMark, type === 'fluid' ? 2 : 6)] ?? 0
  return station.beltsPerPlatform * speed * (station.buffered ? 1 : 1 - lockShare)
}

const requestedAmount = (consumer: Factory, producerId: number, part: string) =>
  consumer.inputs
    .filter(input => input.factoryId === producerId && input.outputPart === part)
    .reduce((sum, input) => sum + input.amount, 0)

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
  const avgCars = timed.reduce((sum, flow) => sum + Math.min(flow.cars.length, platforms), 0) / timed.length
  const throughput = (trains: number) => Math.min(
    trains * avgCars * carLoad / avgTripMins,
    platforms * beltRate * Math.max(0, 1 - trains * DOCK_LOCKOUT_SECS / 60 / avgTripMins),
  )
  let best = 1
  for (let trains = 2; trains <= 100 && throughput(trains) > throughput(best); trains++) best = trains
  return best - timed.length
}

const stationFlow = (factory: Factory, station: TrainStation, trains: TrainFlow[]): StationFlow => {
  const outgoing = trains.filter(flow => flow.origin.id === factory.id && flow.loadingStation.id === station.id)
  const incoming = trains.filter(flow => flow.destination?.factory.id === factory.id && flow.destination.station.id === station.id)
  const touching = [...outgoing, ...incoming]
  const lockShare = Math.min(1, touching.reduce(
    (sum, flow) => sum + (flow.train.roundTripSecs > 0 ? DOCK_LOCKOUT_SECS / flow.train.roundTripSecs : 0), 0))
  const atPlatform = (flows: TrainFlow[], index: number) => flows.reduce((sum, flow) =>
    sum + flow.cars.filter(car => carPlatformIndex(flow.train, car.carIndex) === index).reduce((cars, car) => cars + car.deliveredPerMin, 0), 0)
  const platforms = station.platforms.map((type, index): PlatformFlow => {
    const loadPerMin = atPlatform(outgoing, index)
    const unloadPerMin = atPlatform(incoming, index)
    const clearPerMin = platformClearRate(station, type, lockShare)
    return { index, type, loadPerMin, unloadPerMin, clearPerMin, overloaded: loadPerMin + unloadPerMin > clearPerMin + 0.5 }
  })
  return {
    factory,
    station,
    outgoing,
    incoming,
    platforms,
    lockShare,
    roomForTrains: roomForTrains(station, touching),
    emptyCars: outgoing.reduce((sum, flow) => sum + flow.cars.filter(car => !car.part).length, 0),
    overhangingCars: touching.reduce((sum, flow) =>
      sum + flow.cars.filter(car => carPlatformIndex(flow.train, car.carIndex) >= station.platforms.length).length, 0),
  }
}

// Every train in the plan, from its loading station to its receiving station. An export spread
// over several cars, trains or stations fills them evenly.
export const analyseNetwork = (factories: Factory[], gameData: DataInterface): NetworkFlow => {
  const byId = new Map(factories.map(factory => [factory.id, factory]))

  const trains: TrainFlow[] = factories.flatMap(origin => (origin.trainStations ?? []).flatMap(loadingStation =>
    loadingStation.trains.map((train): TrainFlow => {
      const destFactory = train.destination ? byId.get(train.destination.factoryId) : undefined
      const destStation = destFactory?.trainStations?.find(station => station.id === train.destination?.stationId)
      return {
        train,
        origin,
        loadingStation,
        destination: destFactory && destStation ? { factory: destFactory, station: destStation } : undefined,
        cars: train.cars.map((car, carIndex) => ({
          carIndex,
          part: car.part,
          capacityPerMin: car.part ? perMinute(carCapacity(car.part, gameData), train.roundTripSecs) : 0,
          deliveredPerMin: 0,
        })),
      }
    })))

  const exports: Record<string, ExportFlow> = {}
  trains.forEach(flow => {
    if (!flow.destination) return
    const consumer = flow.destination.factory
    flow.cars.forEach(car => {
      if (!car.part) return
      const key = routeKey(flow.origin.id, consumer.id, car.part)
      exports[key] ??= {
        producerId: flow.origin.id,
        consumerId: consumer.id,
        part: car.part,
        requested: requestedAmount(consumer, flow.origin.id, car.part),
        capacity: 0,
        delivered: 0,
        short: 0,
      }
      exports[key].capacity += car.capacityPerMin
    })
  })
  Object.values(exports).forEach(flow => {
    flow.delivered = Math.min(flow.requested, flow.capacity)
    flow.short = Math.max(0, flow.requested - flow.capacity)
  })
  trains.forEach(flow => flow.cars.forEach(car => {
    const route = flow.destination && car.part ? exports[routeKey(flow.origin.id, flow.destination.factory.id, car.part)] : undefined
    car.deliveredPerMin = route && route.capacity > 0 ? car.capacityPerMin * route.delivered / route.capacity : 0
  }))

  const stations: Record<string, StationFlow> = {}
  factories.forEach(factory => (factory.trainStations ?? []).forEach(station => {
    stations[stationKey(factory.id, station.id)] = stationFlow(factory, station, trains)
  }))

  return { trains, stations, exports }
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
  network: NetworkFlow,
): ExportTransport => {
  if (!consumer) return { state: 'unset', shortBy: 0 }
  const settings = getExportSettings(producer, part, consumer.id)
  if (!settings?.method) {
    const guess = guessTransportMethod(settings)
    return guess ? { method: guess, state: 'guessed', shortBy: 0 } : { state: 'unset', shortBy: 0 }
  }
  if (settings.method !== 'train') return { method: settings.method, state: 'ok', shortBy: 0 }

  const flow = network.exports[routeKey(producer.id, consumer.id, part)]
  if (!flow) return { method: 'train', state: 'pending', shortBy: 0 }

  // A platform that cannot keep up, at either end, holds the route back however many cars run it.
  const onRoute = network.trains.filter(train => train.origin.id === producer.id && train.destination?.factory.id === consumer.id &&
    train.cars.some(car => car.part === part))
  const overloaded = onRoute.some(train => [
    network.stations[stationKey(producer.id, train.loadingStation.id)],
    network.stations[stationKey(consumer.id, train.destination!.station.id)],
  ].some(station => station?.platforms.some(platform => platform.overloaded &&
    train.cars.some(car => car.part === part && carPlatformIndex(train.train, car.carIndex) === platform.index))))

  return { method: 'train', state: flow.short > 0.5 || overloaded ? 'short' : 'ok', shortBy: flow.short }
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
