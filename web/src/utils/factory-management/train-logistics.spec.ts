import { beforeEach, describe, expect, it } from 'vitest'
import { Factory } from '@/interfaces/planner/FactoryInterface'
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
  analyseRail,
  carCapacity,
  carPlatformIndex,
  exportTransport,
  formatRoundTrip,
  guessTransportMethod,
  parseRoundTrip,
  removeTrainCar,
  setExportTransportMethod,
  setStationPlatformCount,
  setTrainLocomotives,
  suggestStationLayout,
} from '@/utils/factory-management/train-logistics'

describe('train-logistics', () => {
  let mine: Factory
  let quarry: Factory
  let megafac: Factory

  beforeEach(() => {
    mine = newFactory('Mine', 0, 1)
    quarry = newFactory('Quarry', 1, 2)
    megafac = newFactory('MegaFac', 2, 3)
    megafac.inputs.push({ factoryId: 1, outputPart: 'Stone', amount: 1800 })
    megafac.inputs.push({ factoryId: 2, outputPart: 'Stone', amount: 1200 })
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
      const station = addTrainStation(megafac, { name: 'North', platforms: 4 })
      const train = addTrain(station, { name: 'A', cargo: null })
      expect(carPlatformIndex(train, 0)).toBe(0)
      setTrainLocomotives(train, 2)
      expect(carPlatformIndex(train, 0)).toBe(1)
    })
  })

  describe('editing stations and trains', () => {
    it('adds a station with freight platforms and a default name', () => {
      const station = addTrainStation(megafac, { name: '  ', platforms: 4 })
      expect(station.name).toBe('Station 1')
      expect(station.platforms).toEqual(['freight', 'freight', 'freight', 'freight'])
      expect(megafac.trainStations).toHaveLength(1)
    })

    it('grows and shrinks the platform row from the end', () => {
      const station = addTrainStation(megafac, { name: 'North', platforms: 2 })
      station.platforms[1] = 'empty'
      setStationPlatformCount(station, 3)
      expect(station.platforms).toEqual(['freight', 'empty', 'freight'])
      setStationPlatformCount(station, 0)
      expect(station.platforms).toEqual(['freight'])
    })

    it('gives a new train a car per freight platform, and the first train\'s round trip', () => {
      const station = addTrainStation(megafac, { name: 'North', platforms: 4 })
      const first = addTrain(station, { name: 'A', cargo: { factoryId: 1, part: 'Stone' }, fallbackRoundTripSecs: 537 })
      expect(first.roundTripSecs).toBe(537)
      expect(first.cars).toHaveLength(4)
      first.roundTripSecs = 300
      const second = addTrain(station, { name: 'B', cargo: null, fallbackRoundTripSecs: 999 })
      expect(second.roundTripSecs).toBe(300)
    })

    it('treats an untouched old train time as no time at all', () => {
      const station = addTrainStation(megafac, { name: 'North', platforms: 4 })
      expect(addTrain(station, { name: 'A', cargo: null, fallbackRoundTripSecs: 123 }).roundTripSecs).toBe(0)
    })

    it('copies the last car\'s cargo onto a new car, and never removes the last car', () => {
      const station = addTrainStation(megafac, { name: 'North', platforms: 1 })
      const train = addTrain(station, { name: 'A', cargo: { factoryId: 1, part: 'Stone' } })
      addTrainCar(train)
      expect(train.cars[1].cargo).toEqual({ factoryId: 1, part: 'Stone' })
      removeTrainCar(train, 0)
      removeTrainCar(train, 0)
      expect(train.cars).toHaveLength(1)
    })
  })

  describe('analyseRail', () => {
    it('fills an export\'s cars evenly and adds them up per platform', () => {
      const station = addTrainStation(megafac, { name: 'North', platforms: 4, beltMark: 6 })
      const train = addTrain(station, { name: 'A', cargo: { factoryId: 1, part: 'Stone' } })
      train.roundTripSecs = 300

      const rail = analyseRail(megafac, gameData)
      const flow = rail.cargo['1:Stone']
      // 3,200 a car every five minutes is 640/min a car, 2,560/min for four: more than the 1,800 asked.
      expect(flow.capacity).toBeCloseTo(2560)
      expect(flow.delivered).toBe(1800)
      expect(flow.short).toBe(0)
      expect(rail.stations[0].platforms.map(platform => platform.deliveredPerMin)).toEqual([450, 450, 450, 450])
    })

    it('leaves the platform under an empty car with nothing', () => {
      const station = addTrainStation(megafac, { name: 'North', platforms: 4, beltMark: 6 })
      const train = addTrain(station, { name: 'A', cargo: { factoryId: 1, part: 'Stone' } })
      train.roundTripSecs = 300
      train.cars[0].cargo = null

      const station0 = analyseRail(megafac, gameData).stations[0]
      expect(station0.emptyCars).toBe(1)
      expect(station0.platforms[0].deliveredPerMin).toBe(0)
      expect(station0.platforms[1].deliveredPerMin).toBeCloseTo(600)
    })

    it('counts a car past the last platform as overhanging', () => {
      const station = addTrainStation(megafac, { name: 'North', platforms: 2 })
      const train = addTrain(station, { name: 'A', cargo: { factoryId: 1, part: 'Stone' } })
      setTrainLocomotives(train, 2)
      expect(analyseRail(megafac, gameData).stations[0].overhangingCars).toBe(1)
    })

    it('locks the station for 27.08s per dock, and buffers lift the limit', () => {
      const station = addTrainStation(megafac, { name: 'North', platforms: 4, beltMark: 5 })
      addTrain(station, { name: 'A', cargo: { factoryId: 1, part: 'Stone' } }).roundTripSecs = 270.8

      const unbuffered = analyseRail(megafac, gameData).stations[0]
      expect(unbuffered.lockShare).toBeCloseTo(0.1)
      expect(unbuffered.platforms[0].clearPerMin).toBeCloseTo(702)

      station.buffered = true
      expect(analyseRail(megafac, gameData).stations[0].platforms[0].clearPerMin).toBe(780)
    })

    it('flags a platform whose belts cannot clear what arrives', () => {
      const station = addTrainStation(megafac, { name: 'North', platforms: 1, beltMark: 1 })
      addTrain(station, { name: 'A', cargo: { factoryId: 1, part: 'Stone' } }).roundTripSecs = 300
      expect(analyseRail(megafac, gameData).stations[0].platforms[0].overloaded).toBe(true)
    })

    it('says how many more trains a station takes before another slows it down', () => {
      // Four platforms, two Mk.6 outputs each, limestone on five- and six-minute trips: peaks near three.
      const station = addTrainStation(megafac, { name: 'North', platforms: 4, beltMark: 6, beltsPerPlatform: 2 })
      addTrain(station, { name: 'A', cargo: { factoryId: 1, part: 'Stone' } }).roundTripSecs = 300
      addTrain(station, { name: 'B', cargo: { factoryId: 2, part: 'Stone' } }).roundTripSecs = 360
      expect(analyseRail(megafac, gameData).stations[0].roomForTrains).toBe(1)
    })

    it('counts a second train while it still adds throughput, even on one Mk.5 belt a platform', () => {
      // One train brings 2,133/min; two bring more than the belts clear, but the belts' 2,651 still beats one train.
      const station = addTrainStation(megafac, { name: 'North', platforms: 4, beltMark: 5 })
      addTrain(station, { name: 'A', cargo: { factoryId: 1, part: 'Stone' } }).roundTripSecs = 360
      expect(analyseRail(megafac, gameData).stations[0].roomForTrains).toBe(1)
    })

    it('cannot tell the room for trains before any train is timed', () => {
      const station = addTrainStation(megafac, { name: 'North', platforms: 4 })
      addTrain(station, { name: 'A', cargo: { factoryId: 1, part: 'Stone' } })
      expect(analyseRail(megafac, gameData).stations[0].roomForTrains).toBeNull()
    })
  })

  describe('transport method', () => {
    const settingsFor = (factory: Factory) => {
      initializeCalculatorFactoryPart(factory, 'Stone')
      initializeCalculatorFactorySettings(factory, 'Stone', '3')
      return factory.exportCalculator.Stone.factorySettings['3']
    }

    it('guesses only when exactly one time was changed from its default', () => {
      const settings = settingsFor(mine)
      expect(guessTransportMethod(settings)).toBeUndefined()
      settings.trainTime = 537
      expect(guessTransportMethod(settings)).toBe('train')
      settings.droneTime = 90
      expect(guessTransportMethod(settings)).toBeUndefined()
    })

    it('is unset, then guessed, then set', () => {
      expect(exportTransport(mine, 'Stone', megafac, gameData).state).toBe('unset')
      settingsFor(mine).trainTime = 537
      expect(exportTransport(mine, 'Stone', megafac, gameData)).toMatchObject({ method: 'train', state: 'guessed' })
      setExportTransportMethod(mine, 'Stone', 3, 'belt')
      expect(exportTransport(mine, 'Stone', megafac, gameData)).toMatchObject({ method: 'belt', state: 'ok' })
    })

    it('waits for a train before judging a train export', () => {
      setExportTransportMethod(mine, 'Stone', 3, 'train')
      expect(exportTransport(mine, 'Stone', megafac, gameData).state).toBe('pending')
    })

    it('is short when its trains cannot carry the full amount', () => {
      setExportTransportMethod(mine, 'Stone', 3, 'train')
      const station = addTrainStation(megafac, { name: 'North', platforms: 2, beltMark: 6 })
      addTrain(station, { name: 'A', cargo: { factoryId: 1, part: 'Stone' } }).roundTripSecs = 600
      // Two cars every ten minutes carry 640/min of the 1,800 asked.
      const transport = exportTransport(mine, 'Stone', megafac, gameData)
      expect(transport.state).toBe('short')
      expect(transport.shortBy).toBeCloseTo(1160)
    })

    it('is fine when its trains carry it all', () => {
      setExportTransportMethod(mine, 'Stone', 3, 'train')
      const station = addTrainStation(megafac, { name: 'North', platforms: 4, beltMark: 6 })
      addTrain(station, { name: 'A', cargo: { factoryId: 1, part: 'Stone' } }).roundTripSecs = 300
      expect(exportTransport(mine, 'Stone', megafac, gameData).state).toBe('ok')
    })

    it('is short when a platform its cars stop at cannot be cleared', () => {
      setExportTransportMethod(mine, 'Stone', 3, 'train')
      const station = addTrainStation(megafac, { name: 'North', platforms: 4, beltMark: 1 })
      addTrain(station, { name: 'A', cargo: { factoryId: 1, part: 'Stone' } }).roundTripSecs = 300
      expect(exportTransport(mine, 'Stone', megafac, gameData).state).toBe('short')
    })

    it('leaves an export with no destination unset', () => {
      expect(exportTransport(quarry, 'Stone', undefined, gameData).state).toBe('unset')
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
