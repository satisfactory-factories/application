import { beforeAll, describe, expect, it } from 'vitest'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, findFacByName } from '@/utils/factory-management/factory'
import { gameData } from '@/utils/gameData'
import { create243Scenario } from '@/utils/factory-setups/243-water-recycling'
import { showRecycledChip } from '@/utils/factory-management/satisfaction'

let factories: Factory[]
let mockFactory: Factory

describe('243 Scenario Plan', () => {
  beforeAll(() => {
    const templateInstance = create243Scenario()
    factories = templateInstance.getFactories()
    mockFactory = findFacByName('Water recycling', factories)
    calculateFactories(factories, gameData)
  })

  describe('Water recycling within the closed loop', () => {
    it('should require the full amount of water for alumina production', () => {
      expect(mockFactory.parts.Water.amountRequired).toBe(1440)
    })

    it('should supply water from the aluminum scrap byproduct', () => {
      expect(mockFactory.parts.Water.amountSuppliedViaProduction).toBe(480)
    })

    it('should only demand the water shortfall from raw supply', () => {
      expect(mockFactory.parts.Water.amountSuppliedViaRaw).toBe(960)
    })

    it('should not tell the user to over-feed water into the loop', () => {
      expect(mockFactory.rawResources.Water.amount).toBe(960)
    })

    it('should fully satisfy water', () => {
      expect(mockFactory.parts.Water.amountSupplied).toBe(1440)
      expect(mockFactory.parts.Water.amountRemaining).toBe(0)
      expect(mockFactory.parts.Water.satisfied).toBe(true)
    })

    it('should demand the correct amounts of the other raw resources', () => {
      expect(mockFactory.rawResources.OreBauxite.amount).toBe(960)
      expect(mockFactory.rawResources.Coal.amount).toBe(480)
    })

    it('should mark the factory as satisfied', () => {
      expect(mockFactory.requirementsSatisfied).toBe(true)
    })

    it('should flag water as recycled', () => {
      expect(showRecycledChip(mockFactory, 'Water')).toBe(true)
    })

    it('should NOT flag the silica byproduct as recycled, as nothing consumes it', () => {
      expect(showRecycledChip(mockFactory, 'Silica')).toBe(false)
    })
  })
})
