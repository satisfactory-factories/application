import { beforeEach, describe, expect, it } from 'vitest'
import { calculateFactories, findFacByName, newFactory } from '@/utils/factory-management/factory'
import { gameData } from '@/utils/gameData'
import { addInputToFactory } from '@/utils/factory-management/inputs'
import { addProductToFactory } from '@/utils/factory-management/products'
import { internalProductionDeficitPlan } from '@/utils/factory-setups/internal-production-deficit-plan'

let ironIngotFac = newFactory('Iron Ingots')
let ironPlateFac = newFactory('Iron Plates')

describe('exports', () => {
  describe('calculateExports', () => {
    beforeEach(() => {
    // Reset the mocks
      ironIngotFac = newFactory('Iron Ingots')
      ironPlateFac = newFactory('Iron Plates')

      addProductToFactory(ironIngotFac, {
        id: 'IronIngot',
        amount: 100,
        recipe: 'IngotIron', // I love this game's recipe naming being inconsistent
      })

      addProductToFactory(ironPlateFac, {
        id: 'IronPlate',
        amount: 100,
        recipe: 'IronPlate',
      })
    })
    it('should calculate exports correctly when no factories requesting it', () => {
      const factories = [ironIngotFac]

      calculateFactories(factories, gameData)

      expect(ironIngotFac.exports.IronIngot.surplus).toEqual(100)
      expect(ironIngotFac.exports.IronIngot.demands).toEqual(0)
    })
    it('should calculate exports correctly', () => {
      const factories = [ironIngotFac, ironPlateFac]

      addInputToFactory(ironPlateFac, {
        factoryId: ironIngotFac.id,
        outputPart: 'IronIngot',
        amount: 100,
      })

      // This should have added the dependency for us, thus calculateExports should have added the export because it's a dependant.
      calculateFactories(factories, gameData)

      expect(ironIngotFac.exports).not.toEqual({})
      expect(ironIngotFac.exports.IronIngot).toEqual({
        productId: 'IronIngot',
        surplus: 100,
        demands: 100,
        difference: 0,
        displayOrder: 0,
      })
    })
    it('should calculate exports correctly with multiple factories', () => {
      const ironRodsFac = newFactory('Iron Rods')
      const factories = [ironIngotFac, ironPlateFac, ironRodsFac]

      addInputToFactory(ironPlateFac, {
        factoryId: ironIngotFac.id,
        outputPart: 'IronIngot',
        amount: 50,
      })
      addInputToFactory(ironRodsFac, {
        factoryId: ironIngotFac.id,
        outputPart: 'IronIngot',
        amount: 75,
      })

      calculateFactories(factories, gameData)

      expect(ironIngotFac.exports.IronIngot.demands).toEqual(125)
    })
    it('should calculate exports correctly when factory is in a production deficit, without demands', () => {
      const factories = [ironIngotFac]

      // Will produce a 200 ingot deficit
      addProductToFactory(ironIngotFac, {
        id: 'IronPlate',
        amount: 200,
        recipe: 'IronPlate',
      })

      calculateFactories(factories, gameData)

      expect(ironIngotFac.exports.IronIngot).not.toBeDefined()
    })

    // Issue Ref: #107
    it('should calculate exports correctly when factory is in a production deficit, with demands', () => {
      const factories = [ironIngotFac, ironPlateFac]

      addInputToFactory(ironPlateFac, {
        factoryId: ironIngotFac.id,
        outputPart: 'IronIngot',
        amount: 100,
      })

      // Will produce a 200 ingot deficit
      addProductToFactory(ironIngotFac, {
        id: 'IronPlate',
        amount: 200,
        recipe: 'IronPlate',
      })

      calculateFactories(factories, gameData)

      expect(ironIngotFac.exports.IronIngot.demands).toBe(100)
      expect(ironIngotFac.exports.IronIngot.surplus).toBe(0)
      expect(ironIngotFac.exports.IronPlate.surplus).toBe(200)
      expect(ironIngotFac.exports.IronPlate.demands).toBe(0)
    })
    it('should calculate exports correctly with confirmed bugged factory', () => {
      const factories = internalProductionDeficitPlan()

      calculateFactories(factories, gameData)

      const wireFac = findFacByName('Wire', factories)
      expect(wireFac.parts.Wire.amountRemaining).toBe(120) // Currently, we do not add the exports into the parts calculations, we possibly could do.
      expect(wireFac.exports.Wire.surplus).toBe(0)
      expect(wireFac.exports.Wire.demands).toBe(170)
    })
    it('should calculate no exports when id of product is unset', () => {
      const factory = newFactory('Iron Ingots')
      addProductToFactory(factory, {
        amount: 100,
        recipe: 'IngotIron',
      })

      calculateFactories([factory], gameData)

      expect(factory.exports).toEqual({})
    })
  })
})
