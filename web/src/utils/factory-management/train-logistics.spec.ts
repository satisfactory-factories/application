import { beforeEach, describe, expect, it } from 'vitest'
import { Factory, TrainStation } from '@/interfaces/planner/FactoryInterface'
import { newFactory } from '@/utils/factory-management/factory'
import { gameData } from '@/utils/gameData'
import {
  initializeCalculatorFactoryPart,
  initializeCalculatorFactorySettings,
} from '@/utils/factory-management/exportCalculator'
import {
  addTrain,
  addTrainCar,
  addTrainStation,
  analyseNetwork,
  carCapacity,
  carPlatformIndex,
  exportTransport,
  formatRoundTrip,
  guessTransportMethod,
  parseRoundTrip,
  removeTrainCar,
  removeTrainStation,
  routeKey,
  setExportTransportMethod,
  setStationPlatformCount,
  setTrainLocomotives,
  stationKey,
  suggestStationLayout,
} from '@/utils/factory-management/train-logistics'

describe('train-logistics', () => {
  let mine: Factory
  let quarry: Factory
  let megafac: Factory
  let factories: Factory[]

  // A loading station at the mine and a receiving station at the MegaFac, four platforms each.
  let mineStation: TrainStation
  let receiving: TrainStation

  const toMegafac = () => ({ factoryId: megafac.id, stationId: receiving.id })
  const network = () => analyseNetwork(factories, gameData)
  const receivingFlow = () => network().stations[stationKey(megafac.id, receiving.id)]

  beforeEach(() => {
    mine = newFactory('Mine', 0, 1)
    quarry = newFactory('Quarry', 1, 2)
    megafac = newFactory('MegaFac', 2, 3)
    megafac.inputs.push({ factoryId: 1, outputPart: 'Stone', amount: 1800 })
    megafac.inputs.push({ factoryId: 2, outputPart: 'Stone', amount: 1200 })
    factories = [mine, quarry, megafac]
    mineStation = addTrainStation(mine, { name: 'Mine loading', platforms: 4, beltMark: 6 })
    receiving = addTrainStation(megafac, { name: 'North', platforms: 4, beltMark: 6 })
  })

  describe('capacities and layout', () => {
    it('fills a freight car with 32 stacks, and a fluid car with a flat volume', () => {
      expect(carCapacity('Stone', gameData)).toBe(3200)
      expect(carCapacity('Water', gameData)).toBe(1600)
      expect(carCapacity('NotAPart', gameData)).toBe(0)
    })

    it('suggests one belt per platform, stepping up to Mk.6 when the lockout leaves Mk.5 short', () => {
      expect(suggestStationLayout(3120)).toEqual({ platforms: 4, beltMark: 6 })
      expect(suggestStationLayout(1800)).toEqual({ platforms: 3, beltMark: 5 })
      expect(suggestStationLayout(0)).toEqual({ platforms: 4, beltMark: 5 })
    })

    it('puts each extra locomotive on a platform, pushing the cars along', () => {
      const train = addTrain(mineStation, { name: 'A', part: null, destination: null })
      expect(carPlatformIndex(train, 0)).toBe(0)
      setTrainLocomotives(train, 2)
      expect(carPlatformIndex(train, 0)).toBe(1)
    })
  })

  describe('editing stations and trains', () => {
    it('adds a station with freight platforms and a default name', () => {
      const station = addTrainStation(quarry, { name: '  ', platforms: 4 })
      expect(station.name).toBe('Station 1')
      expect(station.platforms).toEqual(['freight', 'freight', 'freight', 'freight'])
      expect(quarry.trainStations).toHaveLength(1)
    })

    it('grows and shrinks the platform row from the end', () => {
      const station = addTrainStation(quarry, { name: 'Q', platforms: 2 })
      station.platforms[1] = 'empty'
      setStationPlatformCount(station, 3)
      expect(station.platforms).toEqual(['freight', 'empty', 'freight'])
      setStationPlatformCount(station, 0)
      expect(station.platforms).toEqual(['freight'])
    })

    it('gives a new train a car per loading platform, its destination, and the first train\'s round trip', () => {
      const first = addTrain(mineStation, { name: 'A', part: 'Stone', destination: toMegafac(), fallbackRoundTripSecs: 537 })
      expect(first.roundTripSecs).toBe(537)
      expect(first.cars).toEqual([{ part: 'Stone' }, { part: 'Stone' }, { part: 'Stone' }, { part: 'Stone' }])
      expect(first.destination).toEqual(toMegafac())
      first.roundTripSecs = 300
      expect(addTrain(mineStation, { name: 'B', part: null, destination: null, fallbackRoundTripSecs: 999 }).roundTripSecs).toBe(300)
    })

    it('treats an untouched old train time as no time at all', () => {
      expect(addTrain(mineStation, { name: 'A', part: null, destination: null, fallbackRoundTripSecs: 123 }).roundTripSecs).toBe(0)
    })

    it('copies the last car\'s part onto a new car, and never removes the last car', () => {
      const station = addTrainStation(quarry, { name: 'Q', platforms: 1 })
      const train = addTrain(station, { name: 'A', part: 'Stone', destination: null })
      addTrainCar(train)
      expect(train.cars[1].part).toBe('Stone')
      removeTrainCar(train, 0)
      removeTrainCar(train, 0)
      expect(train.cars).toHaveLength(1)
    })

    it('clears the destination of trains that unloaded at a removed station', () => {
      const train = addTrain(mineStation, { name: 'A', part: 'Stone', destination: toMegafac() })
      const changed = removeTrainStation(megafac, receiving.id, factories)
      expect(train.destination).toBeNull()
      expect(changed).toEqual([mine])
      expect(megafac.trainStations).toEqual([])
    })
  })

  describe('analyseNetwork', () => {
    it('fills an export\'s cars evenly, loading and unloading the same amount at each end', () => {
      addTrain(mineStation, { name: 'A', part: 'Stone', destination: toMegafac() }).roundTripSecs = 300

      const flows = network()
      const flow = flows.exports[routeKey(1, 3, 'Stone')]
      // 3,200 a car every five minutes is 640/min a car, 2,560/min for four: more than the 1,800 asked.
      expect(flow.capacity).toBeCloseTo(2560)
      expect(flow.delivered).toBe(1800)
      expect(flow.short).toBe(0)
      expect(flows.stations[stationKey(3, receiving.id)].platforms.map(platform => platform.unloadPerMin)).toEqual([450, 450, 450, 450])
      expect(flows.stations[stationKey(1, mineStation.id)].platforms.map(platform => platform.loadPerMin)).toEqual([450, 450, 450, 450])
    })

    it('lists trains from every exporter at the receiving station', () => {
      addTrain(mineStation, { name: 'A', part: 'Stone', destination: toMegafac() }).roundTripSecs = 300
      const quarryStation = addTrainStation(quarry, { name: 'Quarry loading', platforms: 4 })
      addTrain(quarryStation, { name: 'B', part: 'Stone', destination: toMegafac() }).roundTripSecs = 360

      const flow = receivingFlow()
      expect(flow.incoming.map(train => train.train.name)).toEqual(['A', 'B'])
      expect(flow.outgoing).toEqual([])
      // 1,800/min from the mine plus 1,200/min from the quarry, four platforms each.
      expect(flow.platforms[0].unloadPerMin).toBeCloseTo(750)
    })

    it('carries nothing on a train with no receiving station', () => {
      addTrain(mineStation, { name: 'A', part: 'Stone', destination: null }).roundTripSecs = 300
      expect(network().exports).toEqual({})
    })

    it('leaves the platform under an empty car with nothing', () => {
      const train = addTrain(mineStation, { name: 'A', part: 'Stone', destination: toMegafac() })
      train.roundTripSecs = 300
      train.cars[0].part = null

      const flows = network()
      expect(flows.stations[stationKey(1, mineStation.id)].emptyCars).toBe(1)
      expect(flows.stations[stationKey(3, receiving.id)].platforms[0].unloadPerMin).toBe(0)
      expect(flows.stations[stationKey(3, receiving.id)].platforms[1].unloadPerMin).toBeCloseTo(600)
    })

    it('counts cars past the last platform at a shorter receiving station', () => {
      setStationPlatformCount(receiving, 2)
      addTrain(mineStation, { name: 'A', part: 'Stone', destination: toMegafac() })
      expect(receivingFlow().overhangingCars).toBe(2)
    })

    it('locks the station for 27.08s per dock, and buffers lift the limit', () => {
      receiving.beltMark = 5
      addTrain(mineStation, { name: 'A', part: 'Stone', destination: toMegafac() }).roundTripSecs = 270.8

      expect(receivingFlow().lockShare).toBeCloseTo(0.1)
      expect(receivingFlow().platforms[0].clearPerMin).toBeCloseTo(702)
      receiving.buffered = true
      expect(receivingFlow().platforms[0].clearPerMin).toBe(780)
    })

    it('flags a platform whose belts cannot clear what arrives', () => {
      receiving.beltMark = 1
      addTrain(mineStation, { name: 'A', part: 'Stone', destination: toMegafac() }).roundTripSecs = 300
      expect(receivingFlow().platforms[0].overloaded).toBe(true)
    })

    it('says how many more trains a station takes before another slows it down', () => {
      // Four platforms, two Mk.6 outputs each, limestone on five- and six-minute trips.
      receiving.beltsPerPlatform = 2
      addTrain(mineStation, { name: 'A', part: 'Stone', destination: toMegafac() }).roundTripSecs = 300
      const quarryStation = addTrainStation(quarry, { name: 'Quarry loading', platforms: 4 })
      addTrain(quarryStation, { name: 'B', part: 'Stone', destination: toMegafac() }).roundTripSecs = 360
      expect(receivingFlow().roomForTrains).toBe(1)
    })

    it('counts a second train while it still adds throughput, even on one Mk.5 belt a platform', () => {
      // One train brings 2,133/min; two bring more than the belts clear, but the belts' 2,651 still beats one train.
      receiving.beltMark = 5
      addTrain(mineStation, { name: 'A', part: 'Stone', destination: toMegafac() }).roundTripSecs = 360
      expect(receivingFlow().roomForTrains).toBe(1)
    })

    it('cannot tell the room for trains before any train is timed', () => {
      addTrain(mineStation, { name: 'A', part: 'Stone', destination: toMegafac() })
      expect(receivingFlow().roomForTrains).toBeNull()
    })
  })

  describe('transport method', () => {
    const settingsFor = (factory: Factory) => {
      initializeCalculatorFactoryPart(factory, 'Stone')
      initializeCalculatorFactorySettings(factory, 'Stone', '3')
      return factory.exportCalculator.Stone.factorySettings['3']
    }

    const transport = () => exportTransport(mine, 'Stone', megafac, network())

    it('guesses only when exactly one time was changed from its default', () => {
      const settings = settingsFor(mine)
      expect(guessTransportMethod(settings)).toBeUndefined()
      settings.trainTime = 537
      expect(guessTransportMethod(settings)).toBe('train')
      settings.droneTime = 90
      expect(guessTransportMethod(settings)).toBeUndefined()
    })

    it('is unset, then guessed, then set', () => {
      expect(transport().state).toBe('unset')
      settingsFor(mine).trainTime = 537
      expect(transport()).toMatchObject({ method: 'train', state: 'guessed' })
      setExportTransportMethod(mine, 'Stone', 3, 'belt')
      expect(transport()).toMatchObject({ method: 'belt', state: 'ok' })
    })

    it('waits for a train before judging a train export', () => {
      setExportTransportMethod(mine, 'Stone', 3, 'train')
      expect(transport().state).toBe('pending')
    })

    it('is short when its trains cannot carry the full amount', () => {
      setExportTransportMethod(mine, 'Stone', 3, 'train')
      setStationPlatformCount(mineStation, 2)
      addTrain(mineStation, { name: 'A', part: 'Stone', destination: toMegafac() }).roundTripSecs = 600
      // Two cars every ten minutes carry 640/min of the 1,800 asked.
      expect(transport().state).toBe('short')
      expect(transport().shortBy).toBeCloseTo(1160)
    })

    it('is fine when its trains carry it all', () => {
      setExportTransportMethod(mine, 'Stone', 3, 'train')
      addTrain(mineStation, { name: 'A', part: 'Stone', destination: toMegafac() }).roundTripSecs = 300
      expect(transport().state).toBe('ok')
    })

    it('is short when a platform at either end cannot keep up', () => {
      setExportTransportMethod(mine, 'Stone', 3, 'train')
      addTrain(mineStation, { name: 'A', part: 'Stone', destination: toMegafac() }).roundTripSecs = 300
      mineStation.beltMark = 1
      expect(transport().state).toBe('short')
      mineStation.beltMark = 6
      receiving.beltMark = 1
      expect(transport().state).toBe('short')
    })

    it('leaves an export with no destination unset', () => {
      expect(exportTransport(quarry, 'Stone', undefined, network()).state).toBe('unset')
    })
  })

  describe('round trip text', () => {
    it('reads minutes and seconds in the forms people type', () => {
      expect(parseRoundTrip('5:20')).toBe(320)
      expect(parseRoundTrip('5m 20s')).toBe(320)
      expect(parseRoundTrip('8m')).toBe(480)
      expect(parseRoundTrip('537')).toBe(537)
      expect(parseRoundTrip('')).toBe(0)
      expect(parseRoundTrip('soon')).toBeNull()
    })

    it('writes it back as minutes and seconds, blank for no time', () => {
      expect(formatRoundTrip(320)).toBe('5:20')
      expect(formatRoundTrip(59.6)).toBe('1:00')
      expect(formatRoundTrip(0)).toBe('')
    })
  })
})
