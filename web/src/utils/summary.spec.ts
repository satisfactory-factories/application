import { describe, expect, it } from 'vitest'
import { FactoryDependencyRequest, FactoryInput } from '@/interfaces/planner/FactoryInterface'
import { calculateExports, calculateImports } from '@/utils/summary'

describe('summary', () => {
  describe('calculateImports', () => {
    it('should total imports per part and retain source factories', () => {
      const inputs: FactoryInput[] = [
        { factoryId: 1, outputPart: 'IronIngot', amount: 100 },
        { factoryId: 2, outputPart: 'IronIngot', amount: 50 },
        { factoryId: 1, outputPart: 'CopperIngot', amount: 25 },
      ]

      const result = calculateImports(inputs)

      expect(result).toEqual([
        {
          part: 'CopperIngot',
          totalAmount: 25,
          factories: [{ factoryId: 1, amount: 25 }],
        },
        {
          part: 'IronIngot',
          totalAmount: 150,
          factories: [
            { factoryId: 1, amount: 100 },
            { factoryId: 2, amount: 50 },
          ],
        },
      ])
    })

    it('should merge multiple inputs of the same part from the same factory', () => {
      const inputs: FactoryInput[] = [
        { factoryId: 1, outputPart: 'IronIngot', amount: 100 },
        { factoryId: 1, outputPart: 'IronIngot', amount: 25 },
      ]

      expect(calculateImports(inputs)).toEqual([
        {
          part: 'IronIngot',
          totalAmount: 125,
          factories: [{ factoryId: 1, amount: 125 }],
        },
      ])
    })

    it('should ignore incomplete inputs', () => {
      const inputs: FactoryInput[] = [
        { factoryId: null, outputPart: 'IronIngot', amount: 100 },
        { factoryId: 1, outputPart: null, amount: 50 },
      ]

      expect(calculateImports(inputs)).toEqual([])
    })
  })

  describe('calculateExports', () => {
    it('should total export requests per part and retain destination factories', () => {
      const requests: Record<string, FactoryDependencyRequest[]> = {
        2: [
          { requestingFactoryId: 2, part: 'IronPlate', amount: 60 },
          { requestingFactoryId: 2, part: 'IronRod', amount: 30 },
        ],
        3: [{ requestingFactoryId: 3, part: 'IronPlate', amount: 40 }],
      }

      const result = calculateExports(requests)

      expect(result).toEqual([
        {
          part: 'IronPlate',
          totalAmount: 100,
          factories: [
            { factoryId: 2, amount: 60 },
            { factoryId: 3, amount: 40 },
          ],
        },
        {
          part: 'IronRod',
          totalAmount: 30,
          factories: [{ factoryId: 2, amount: 30 }],
        },
      ])
    })

    it('should return an empty array when there are no requests', () => {
      expect(calculateExports({})).toEqual([])
    })
  })
})
