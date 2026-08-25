import { beforeAll, describe, expect, it } from 'vitest'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, findFacByName } from '@/utils/factory-management/factory'
import { gameData } from '@/utils/gameData'
import { create315Scenario } from '@/utils/factory-setups/315-non-exportable-parts-imports'

let factories: Factory[]
let copperIngots: Factory
let copperParts: Factory
let aluminiumPartsFac: Factory

describe('315 Scenario Plan', () => {
  beforeAll(() => {
    const templateInstance = create315Scenario()
    factories = templateInstance.getFactories()
    copperIngots = findFacByName('Copper Ingots Fac', factories)
    copperParts = findFacByName('Copper Parts Fac', factories)
    aluminiumPartsFac = findFacByName('Aluminium Parts Fac', factories)
    calculateFactories(factories, gameData)
  })

  describe('Aluminium Processing', () => {
    it('should have the correct products', () => {
      expect(aluminiumPartsFac.products.length).toBe(2)
      expect(aluminiumPartsFac.products[0].id).toBe('AluminumPlateReinforced')
      expect(aluminiumPartsFac.products[0].amount).toBe(10)
      expect(aluminiumPartsFac.products[0].recipe).toBe('HeatSink')
      expect(aluminiumPartsFac.products[1].id).toBe('AluminumPlate')
      expect(aluminiumPartsFac.products[1].amount).toBe(50)
      expect(aluminiumPartsFac.products[1].recipe).toBe('AluminumSheet')
    })
    // It should not have three imports (one in the scenario is purposefully invalid on a non-exportable part)
    it('should contain the correct inputs', () => {
      expect(aluminiumPartsFac.inputs.length).toBe(2)
      expect(aluminiumPartsFac.inputs[0]).toEqual({
        factoryId: copperIngots.id,
        outputPart: 'CopperIngot',
        amount: 20,
        completed: false,
      })
      expect(aluminiumPartsFac.inputs[1]).toEqual({
        factoryId: copperParts.id,
        outputPart: 'CopperSheet',
        amount: 30,
        completed: false,
      })
    })
  })
})
