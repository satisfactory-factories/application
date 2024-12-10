import { beforeEach, describe, expect, it } from 'vitest'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { gameData } from '@/utils/gameData'
import { addInputToFactory } from '@/utils/factory-management/inputs'
import {
  getExportableFactories,
  getRequestsForFactory,
  getRequestsForFactoryByPart,
} from '@/utils/factory-management/exports'

let ironIngotFac: Factory
let ironPlateFac: Factory
let ironRodsFac: Factory
let factories: Factory[]

describe('exports', () => {
  beforeEach(() => {
    ironIngotFac = newFactory('Iron Ingots', 0, 1)
    ironPlateFac = newFactory('Iron Plates', 0, 2)
    ironRodsFac = newFactory('Iron Rods', 0, 3)
    addProductToFactory(ironIngotFac, {
      id: 'IronIngot',
      amount: 1000,
      recipe: 'IngotIron',
    })
    addProductToFactory(ironPlateFac, {
      id: 'IronPlate',
      amount: 500,
      recipe: 'IronPlate',
    })
    addProductToFactory(ironRodsFac, {
      id: 'IronRods',
      amount: 1000,
      recipe: 'IronRod',
    })
    addInputToFactory(ironPlateFac, {
      factoryId: ironIngotFac.id,
      outputPart: 'IronIngot',
      amount: 500,
    })
    addInputToFactory(ironRodsFac, {
      factoryId: ironIngotFac.id,
      outputPart: 'IronIngot',
      amount: 500,
    })
    factories = [ironIngotFac, ironPlateFac, ironRodsFac]
    calculateFactories(factories, gameData, true) // Needed otherwise all inputs get blown away
    calculateFactories(factories, gameData)
  })
  describe('getRequestsForFactory', () => {
    it('should return all requests', () => {
      const requests = getRequestsForFactory(ironIngotFac)

      // For the sake of test consistency, order it by factory ID
      requests.sort((a, b) => a.requestingFactoryId - b.requestingFactoryId)

      expect(requests).toEqual([
        {
          requestingFactoryId: ironPlateFac.id,
          part: 'IronIngot',
          amount: 500,
        },
        {
          requestingFactoryId: ironRodsFac.id,
          part: 'IronIngot',
          amount: 500,
        },
      ])
    })
  })
  describe('getRequestsForFactoryByPart', () => {
    it('should return requests', () => {
      // Drop one of the requests so we're not doing the exact same test as getRequestsForFactory
      ironRodsFac.inputs = []
      calculateFactories(factories, gameData)
      const requests = getRequestsForFactoryByPart(ironIngotFac, 'IronIngot')

      expect(requests).toEqual([
        {
          requestingFactoryId: ironPlateFac.id,
          part: 'IronIngot',
          amount: 500,
        },
      ])
    })
  })
  describe('getExportableFactories', () => {
    it('should calculate exportable parts', () => {
      const exportableFacs = getExportableFactories(factories)

      expect(exportableFacs[0].id).toEqual(ironIngotFac.id)
      expect(exportableFacs[1].id).toEqual(ironPlateFac.id)
      expect(exportableFacs[2].id).toEqual(ironRodsFac.id)
    })
  })
})
