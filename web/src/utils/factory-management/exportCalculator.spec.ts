import { beforeEach, describe, expect, it } from 'vitest'
import { gameData } from '@/utils/gameData'
import {
  addTransportGroup,
  calculateTransportGroupCount,
  calculateTransportVehiclesForExporting,
  calculateWholeTransportGroupCount,
  deleteTransportGroup,
  getRedundantTransportGroupCount,
  getTransportGroupsAllocated,
  getTransportMarkForAmount,
  initializeTransportGroups,
  pipelineSpeeds,
  splitTransportGroupsEvenly,
  transportGroupCapacity,
  TransportMethod,
} from '@/utils/factory-management/exportCalculator'
import { DataInterface } from '@/interfaces/DataInterface'
import { ExportCalculatorFactorySettings } from '@/interfaces/planner/FactoryInterface'

describe('exportCalculator', () => {
  let amount = 0
  let part = ''
  let time = 200
  beforeEach(() => {
    amount = 320
    part = 'Plastic'
    time = 200
  })

  describe('calculateTransportVehiclesForExporting', () => {
    describe('gameData validation', () => {
      it('should throw if game data is missing', () => {
        expect(() => calculateTransportVehiclesForExporting(part, amount, TransportMethod.Train, time, {} as DataInterface)).toThrow()
      })

      it('should throw if part data is missing', () => {
        const mockGameData = {
          items: {
            parts: {},
          },
        } as DataInterface
        expect(() => calculateTransportVehiclesForExporting(part, amount, TransportMethod.Train, time, mockGameData)).toThrow(`exportCalculator: calculateTransportRequired: Part ${part} not found in game data!`)
      })

      it('should throw if stack size or isFLuid is missing', () => {
        const mockGameData = {
          items: {
            parts: {
              [part]: {
                isFluid: false,
              },
            },
          },
        } as DataInterface

        expect(() => calculateTransportVehiclesForExporting(part, amount, TransportMethod.Train, time, mockGameData)).toThrow(`exportCalculator: calculateTransportRequired: Missing required parts of data for part ${part}!`)

        // @ts-ignore
        mockGameData.items.parts[part] = {
          stackSize: 0,
        }

        expect(() => calculateTransportVehiclesForExporting(part, amount, TransportMethod.Train, time, mockGameData)).toThrow(`exportCalculator: calculateTransportRequired: Missing required parts of data for part ${part}!`)
      })

      it('should throw if attempting to calculate a fluid part with a transport method that does not support it', () => {
        const mockGameData = {
          items: {
            parts: {
              [part]: {
                stackSize: 100,
                isFluid: true,
              },
            },
          },
        } as DataInterface

        expect(() => calculateTransportVehiclesForExporting(part, amount, TransportMethod.Drone, time, mockGameData)).toThrow('exportCalculator: calculateTransportRequired: Attempting to calculate a fluid part with a transport method that does not support it!')
        expect(() => calculateTransportVehiclesForExporting(part, amount, TransportMethod.Tractor, time, mockGameData)).toThrow('exportCalculator: calculateTransportRequired: Attempting to calculate a fluid part with a transport method that does not support it!')
      })
    })

    describe('trains', () => {
      it('should calculate correctly for solid parts', () => {
        expect(calculateTransportVehiclesForExporting(part, amount, TransportMethod.Train, time, gameData)).toBe('0.167')
        expect(calculateTransportVehiclesForExporting(part, 1600, TransportMethod.Train, time, gameData)).toBe('0.833')
        expect(calculateTransportVehiclesForExporting(part, 1600, TransportMethod.Train, 123, gameData)).toBe('0.513')
      })

      it('should calculate correctly for fluid parts', () => {
        part = 'AluminaSolution'

        expect(calculateTransportVehiclesForExporting(part, 666.667, TransportMethod.Train, time, gameData)).toBe('1.389')

        expect(calculateTransportVehiclesForExporting(part, 666.667, TransportMethod.Train, 123, gameData)).toBe('0.854')

        expect(calculateTransportVehiclesForExporting(part, 500, TransportMethod.Train, time, gameData)).toBe('1.042')
      })
    })

    describe('drones', () => {
      it('should calculate the correct amount of drones needed', () => {
        part = 'IronIngot'
        expect(calculateTransportVehiclesForExporting(part, 160, TransportMethod.Drone, 42, gameData)).toBe('0.124')
        expect(calculateTransportVehiclesForExporting(part, 1600, TransportMethod.Drone, 42, gameData)).toBe('1.244')
        expect(calculateTransportVehiclesForExporting(part, 1600, TransportMethod.Drone, 240, gameData)).toBe('7.111')
      })
    })

    describe('trucks', () => {
      it('should calculate the correct amount of trucks needed', () => {
        part = 'IronIngot'
        expect(calculateTransportVehiclesForExporting(part, 160, TransportMethod.Truck, 42, gameData)).toBe('0.023')
        expect(calculateTransportVehiclesForExporting(part, 1600, TransportMethod.Truck, 42, gameData)).toBe('0.233')
        expect(calculateTransportVehiclesForExporting(part, 1600, TransportMethod.Truck, 240, gameData)).toBe('1.333')
      })

      it('should calculate correctly for fluid parts using the Fluid Truck', () => {
        part = 'AluminaSolution'

        expect(calculateTransportVehiclesForExporting(part, 666.667, TransportMethod.Truck, 200, gameData)).toBe('0.694')
        expect(calculateTransportVehiclesForExporting(part, 666.667, TransportMethod.Truck, 123, gameData)).toBe('0.427')
        expect(calculateTransportVehiclesForExporting(part, 500, TransportMethod.Truck, 200, gameData)).toBe('0.521')
      })
    })

    describe('tractors', () => {
      it('should calculate the correct amount of tractors needed', () => {
        part = 'IronIngot'
        expect(calculateTransportVehiclesForExporting(part, 160, TransportMethod.Tractor, 42, gameData)).toBe('0.045')
        expect(calculateTransportVehiclesForExporting(part, 1600, TransportMethod.Tractor, 42, gameData)).toBe('0.448')
        expect(calculateTransportVehiclesForExporting(part, 1600, TransportMethod.Tractor, 240, gameData)).toBe('2.56')
      })
    })
  })

  describe('belts', () => {
    let settings: ExportCalculatorFactorySettings

    beforeEach(() => {
      settings = {
        trainTime: 123,
        droneTime: 123,
        truckTime: 123,
        tractorTime: 123,
      }
    })

    describe('calculateTransportGroupCount', () => {
      it('should calculate the belts required per mark', () => {
        expect(calculateTransportGroupCount(320, 1, 'belts')).toBeCloseTo(5.333, 3)
        expect(calculateTransportGroupCount(320, 2, 'belts')).toBeCloseTo(2.667, 3)
        expect(calculateTransportGroupCount(320, 4, 'belts')).toBeCloseTo(0.667, 3)
        expect(calculateTransportGroupCount(1200, 6, 'belts')).toBe(1)
      })

      it('should calculate the pipes required per mark', () => {
        expect(calculateTransportGroupCount(600, 1, 'pipes')).toBe(2)
        expect(calculateTransportGroupCount(900, 2, 'pipes')).toBe(1.5)
      })

      it('should throw for an unknown mark', () => {
        expect(() => calculateTransportGroupCount(320, 7, 'belts')).toThrow('exportCalculator: calculateTransportGroupCount: Unknown belts mark 7!')
        expect(() => calculateTransportGroupCount(320, 3, 'pipes')).toThrow('exportCalculator: calculateTransportGroupCount: Unknown pipes mark 3!')
      })
    })

    describe('calculateWholeTransportGroupCount', () => {
      it('should round the belts/pipes to build up to whole numbers', () => {
        // 1666.667/min on Mk.5 (780) = 2.137 exact -> 3 whole belts
        expect(calculateWholeTransportGroupCount(1666.667, 5, 'belts')).toBe(3)
        expect(calculateWholeTransportGroupCount(1200, 6, 'belts')).toBe(1)
        expect(calculateWholeTransportGroupCount(301, 1, 'pipes')).toBe(2)
      })
    })

    describe('transportGroupCapacity', () => {
      it('should return the full-tilt amount for a whole belt/pipe count', () => {
        expect(transportGroupCapacity(3, 5, 'belts')).toBe(2340)
        expect(transportGroupCapacity(2, 2, 'pipes')).toBe(1200)
      })

      it('should throw for an unknown mark', () => {
        expect(() => transportGroupCapacity(3, 7, 'belts')).toThrow('exportCalculator: transportGroupCapacity: Unknown belts mark 7!')
      })
    })

    describe('getTransportMarkForAmount', () => {
      it('should select the smallest mark that carries the amount on a single belt', () => {
        expect(getTransportMarkForAmount(60, 'belts')).toBe(1)
        expect(getTransportMarkForAmount(61, 'belts')).toBe(2)
        expect(getTransportMarkForAmount(480, 'belts')).toBe(4)
        expect(getTransportMarkForAmount(781, 'belts')).toBe(6)
      })

      it('should max out at the highest mark when no single belt/pipe can carry the amount', () => {
        expect(getTransportMarkForAmount(5000, 'belts')).toBe(6)
        expect(getTransportMarkForAmount(5000, 'pipes')).toBe(2)
      })

      it('should select the smallest pipeline mark that carries the amount', () => {
        expect(getTransportMarkForAmount(300, 'pipes')).toBe(1)
        expect(getTransportMarkForAmount(301, 'pipes')).toBe(2)
      })
    })

    describe('initializeTransportGroups', () => {
      it('should create a single group carrying the full amount', () => {
        initializeTransportGroups(settings, 320, 'belts')

        expect(settings.beltGroups).toHaveLength(1)
        expect(settings.beltGroups?.[0].amount).toBe(320)
        expect(settings.beltGroups?.[0].mark).toBe(4)
      })

      it('should create pipe groups independently of belt groups', () => {
        initializeTransportGroups(settings, 500, 'pipes')

        expect(settings.pipeGroups).toHaveLength(1)
        expect(settings.pipeGroups?.[0].amount).toBe(500)
        expect(settings.pipeGroups?.[0].mark).toBe(2)
        expect(settings.beltGroups).toBeUndefined()
      })

      it('should not overwrite existing groups', () => {
        settings.beltGroups = [{ id: 1, mark: 2, amount: 100 }]

        initializeTransportGroups(settings, 320, 'belts')

        expect(settings.beltGroups).toEqual([{ id: 1, mark: 2, amount: 100 }])
      })
    })

    describe('addTransportGroup', () => {
      it('should add a group of the same mark carrying the unallocated shortfall, leaving existing groups untouched', () => {
        // Fine-tuned amounts must survive adding a group — no automatic rebalancing.
        initializeTransportGroups(settings, 320, 'belts')
        settings.beltGroups![0].amount = 200
        addTransportGroup(settings, 320, 'belts')

        expect(settings.beltGroups).toHaveLength(2)
        expect(settings.beltGroups?.[1].mark).toBe(settings.beltGroups?.[0].mark)
        expect(settings.beltGroups?.[0].amount).toBe(200)
        expect(settings.beltGroups?.[1].amount).toBe(120)
      })

      it('should add an empty group when the export is already fully allocated', () => {
        initializeTransportGroups(settings, 320, 'belts')
        addTransportGroup(settings, 320, 'belts')

        expect(settings.beltGroups?.[0].amount).toBe(320)
        expect(settings.beltGroups?.[1].amount).toBe(0)
      })

      it('should not touch belt groups when adding a pipe group', () => {
        initializeTransportGroups(settings, 320, 'belts')
        addTransportGroup(settings, 600, 'pipes')

        expect(settings.beltGroups).toHaveLength(1)
        expect(settings.beltGroups?.[0].amount).toBe(320)
        expect(settings.pipeGroups).toHaveLength(2)
        expect(settings.pipeGroups?.[0].amount).toBe(600)
        expect(settings.pipeGroups?.[1].amount).toBe(0)
      })
    })

    describe('deleteTransportGroup', () => {
      it('should refuse to delete the last group', () => {
        initializeTransportGroups(settings, 320, 'belts')

        deleteTransportGroup(settings, settings.beltGroups?.[0].id ?? 0, 320, 'belts')

        expect(settings.beltGroups).toHaveLength(1)
      })

      it('should restore the full amount to a lone remaining group', () => {
        settings.beltGroups = [
          { id: 1, mark: 4, amount: 100 },
          { id: 2, mark: 4, amount: 220 },
        ]

        deleteTransportGroup(settings, 2, 320, 'belts')

        expect(settings.beltGroups).toEqual([{ id: 1, mark: 4, amount: 320 }])
      })
    })

    describe('splitTransportGroupsEvenly', () => {
      it('should split evenly with the last group absorbing rounding', () => {
        settings.beltGroups = [
          { id: 1, mark: 4, amount: 0 },
          { id: 2, mark: 4, amount: 0 },
          { id: 3, mark: 4, amount: 100 },
        ]

        splitTransportGroupsEvenly(settings, 100, 'belts')

        expect(settings.beltGroups[0].amount).toBe(33.333)
        expect(settings.beltGroups[1].amount).toBe(33.333)
        expect(settings.beltGroups[2].amount).toBe(33.334)
        expect(getTransportGroupsAllocated(settings, 'belts')).toBeCloseTo(100, 3)
      })
    })

    describe('getTransportGroupsAllocated', () => {
      it('should sum the group amounts per kind, treating missing groups as zero', () => {
        expect(getTransportGroupsAllocated(settings, 'belts')).toBe(0)
        expect(getTransportGroupsAllocated(settings, 'pipes')).toBe(0)

        settings.beltGroups = [
          { id: 1, mark: 1, amount: 60 },
          { id: 2, mark: 3, amount: 200 },
        ]
        settings.pipeGroups = [{ id: 3, mark: 2, amount: 450 }]
        expect(getTransportGroupsAllocated(settings, 'belts')).toBe(260)
        expect(getTransportGroupsAllocated(settings, 'pipes')).toBe(450)
      })
    })

    describe('getRedundantTransportGroupCount', () => {
      it('should return zero for missing groups, a lone group or a zero export', () => {
        expect(getRedundantTransportGroupCount(settings, 600, 'belts')).toBe(0)

        settings.beltGroups = [{ id: 1, mark: 1, amount: 6000 }]
        expect(getRedundantTransportGroupCount(settings, 600, 'belts')).toBe(0)

        settings.beltGroups.push({ id: 2, mark: 1, amount: 6000 })
        expect(getRedundantTransportGroupCount(settings, 0, 'belts')).toBe(0)
      })

      it('should return zero when every group is needed', () => {
        // 600/min over two Mk.1 groups of 300 = 5 belts each; removing either drops below 600
        settings.beltGroups = [
          { id: 1, mark: 1, amount: 300 },
          { id: 2, mark: 1, amount: 300 },
        ]
        expect(getRedundantTransportGroupCount(settings, 600, 'belts')).toBe(0)
      })

      it('should not flag plain overcapacity with no removable group', () => {
        // 7 + 7 Mk.1 belts (840 capacity) for a 600 export: fat headroom, but neither group can go
        settings.beltGroups = [
          { id: 1, mark: 1, amount: 400 },
          { id: 2, mark: 1, amount: 400 },
        ]
        expect(getRedundantTransportGroupCount(settings, 600, 'belts')).toBe(0)
      })

      it('should count only as many groups as can actually be removed together', () => {
        // 10 Mk.1 belts needed (600/min); 8+1+1+1 belts built = 11. Any one 1-belt group can
        // go, but only one — removing two drops capacity to 540.
        settings.beltGroups = [
          { id: 1, mark: 1, amount: 480 },
          { id: 2, mark: 1, amount: 60 },
          { id: 3, mark: 1, amount: 60 },
          { id: 4, mark: 1, amount: 60 },
        ]
        expect(getRedundantTransportGroupCount(settings, 600, 'belts')).toBe(1)
      })

      it('should flag all other groups when one group covers the whole export', () => {
        settings.beltGroups = [
          { id: 1, mark: 6, amount: 6000 },
          { id: 2, mark: 1, amount: 60 },
          { id: 3, mark: 1, amount: 60 },
        ]
        expect(getRedundantTransportGroupCount(settings, 5000, 'belts')).toBe(2)
      })

      it('should judge on whole-lane capacity, not allocated amounts', () => {
        // Amounts split 90 + 10 sum exactly to the 100 export, but 90 on Mk.2 already builds
        // a whole belt carrying 120 — the second group is physically unnecessary.
        settings.beltGroups = [
          { id: 1, mark: 2, amount: 90 },
          { id: 2, mark: 2, amount: 10 },
        ]
        expect(getRedundantTransportGroupCount(settings, 100, 'belts')).toBe(1)
      })

      it('should treat a zero-amount group as removable', () => {
        settings.beltGroups = [
          { id: 1, mark: 1, amount: 600 },
          { id: 2, mark: 1, amount: 0 },
        ]
        expect(getRedundantTransportGroupCount(settings, 600, 'belts')).toBe(1)
      })

      it('should work for pipes', () => {
        // 900 m³/min: two Mk.2 pipes (1200 capacity) make the Mk.1 group removable
        settings.pipeGroups = [
          { id: 1, mark: 2, amount: 900 },
          { id: 2, mark: 1, amount: 100 },
        ]
        expect(getRedundantTransportGroupCount(settings, 900, 'pipes')).toBe(1)
      })
    })

    describe('pipelineSpeeds', () => {
      it('should match the wiki throughputs', () => {
        expect(pipelineSpeeds).toEqual({ 1: 300, 2: 600 })
      })
    })
  })
})
