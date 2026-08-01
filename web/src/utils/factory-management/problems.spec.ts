import { beforeEach, describe, expect, test } from 'vitest'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { calculateHasProblem } from '@/utils/factory-management/problems'
import { newFactory } from '@/utils/factory-management/factory'
import { createNewPart } from '@/utils/factory-management/common'
import { mockPowerProducer, mockProduct } from '@/utils/factory-management/status-fixtures'

describe('problems', () => {
  describe('calculateHasProblem', () => {
    let mockFactory: Factory

    beforeEach(() => {
      mockFactory = newFactory('Test Factory')
      // The rollup derives from real part/product state now, so the factory needs a product for
      // the shortage detector to consider it at all (see the hasNoProducts guard in status.ts).
      mockFactory.products = [mockProduct('IronIngot')]
      createNewPart(mockFactory, 'IronIngot')
      mockFactory.dependencies = {
        requests: {
          9216: [
            {
              requestingFactoryId: 9216,
              part: 'IronIngot',
              amount: 900,
            },
          ],
        },
        metrics: {
          IronIngot: {
            part: 'IronIngot',
            request: 900,
            supply: 900,
            isRequestSatisfied: true,
            difference: 0,
          },
        },
      }
    })

    test('should have problem if requirements are not fully satisfied', () => {
      mockFactory.parts.IronIngot.satisfied = false

      calculateHasProblem(mockFactory)
      expect(mockFactory.hasProblem).toBe(true)
    })

    test('should not have problem if requirements are satisfied', () => {
      calculateHasProblem(mockFactory)
      expect(mockFactory.hasProblem).toBe(false)
    })

    test('should have problem if not all requests are satisfied', () => {
      mockFactory.dependencies.metrics.IronIngot.isRequestSatisfied = false

      calculateHasProblem(mockFactory)
      expect(mockFactory.hasProblem).toBe(true)
    })

    test('should have problem if a product has broken building groups', () => {
      mockFactory.products[0].buildingGroupsHaveProblem = true

      calculateHasProblem(mockFactory)
      expect(mockFactory.hasProblem).toBe(true)
    })

    // Regression: calculateBuildingGroupProblems has always run for power producers, but the old
    // rollup only looked at factory.products, so a power-only factory never went red. #506
    test('should have problem if a power producer has broken building groups and there are no products', () => {
      mockFactory.products = []
      mockFactory.powerProducers = [mockPowerProducer('GeneratorCoal', { buildingGroupsHaveProblem: true })]

      calculateHasProblem(mockFactory)
      expect(mockFactory.hasProblem).toBe(true)
    })
  })
})
