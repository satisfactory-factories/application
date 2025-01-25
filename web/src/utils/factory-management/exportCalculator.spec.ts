import { beforeEach, describe, expect, it } from 'vitest'
import { gameData } from '@/utils/gameData'
import { calculateTransportVehiclesForExporting, TransportMethod } from '@/utils/factory-management/exportCalculator'
import { DataInterface } from '@/interfaces/DataInterface'

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
})
