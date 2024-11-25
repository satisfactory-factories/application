import { beforeEach, describe, expect, test } from 'vitest'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { calculateHasProblem } from '@/utils/factory-management/problems'
import { newFactory } from '@/utils/factory-management/factory'

describe('problems', () => {
  describe('calculateHasProblem', () => {
    let mockFactory: Factory

    beforeEach(() => {
      mockFactory = newFactory('Test Factory')
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
      mockFactory.requirementsSatisfied = false

      calculateHasProblem([mockFactory])
      expect(mockFactory.hasProblem).toBe(true)
    })

    test('should not have problem if requirements are satisfied', () => {
      mockFactory.requirementsSatisfied = true

      calculateHasProblem([mockFactory])
      expect(mockFactory.hasProblem).toBe(false)
    })

    test('should have problem if not all requests are satisfied', () => {
      mockFactory.requirementsSatisfied = true

      mockFactory.dependencies.metrics.IronIngot.isRequestSatisfied = false

      calculateHasProblem([mockFactory])
      expect(mockFactory.hasProblem).toBe(true)
    })
  })
})
