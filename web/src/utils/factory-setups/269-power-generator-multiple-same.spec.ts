import { beforeAll, describe, expect, it } from 'vitest'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, findFacByName } from '@/utils/factory-management/factory'
import { gameData } from '@/utils/gameData'
import { create269Scenraio } from '@/utils/factory-setups/269-power-generator-multiple-same'

let factories: Factory[]
let fuelFac: Factory

describe('269 Scenario Plan', () => {
  beforeAll(() => {
    const templateInstance = create269Scenraio()
    factories = templateInstance.getFactories()
    fuelFac = findFacByName('Fuel Power', factories)
    calculateFactories(factories, gameData)
  })

  describe('Fuel Fac', () => {
    it('should have 2 power producers', () => {
      expect(fuelFac.powerProducers.length).toBe(2)
    })

    it('should have the correct amount of power per generator group', () => {
      expect(fuelFac.powerProducers[0].powerAmount).toBe(1000)
      expect(fuelFac.powerProducers[1].powerAmount).toBe(1000)
    })

    it('should calculate the proper power metrics', () => {
      expect(fuelFac.buildingRequirements.generatorfuel).toEqual({
        name: 'generatorfuel',
        amount: 8,
        powerProduced: 2000,
      })
      expect(Object.keys(fuelFac.buildingRequirements).length).toBe(1)
    })
  })
})
