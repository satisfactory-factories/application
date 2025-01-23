import { beforeEach, describe, expect, it } from 'vitest'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { create220Scenario } from '@/utils/factory-setups/220-byproduct-only-part'
import { addProductToFactory } from '@/utils/factory-management/products'
import {
  convertWasteToGeneratorFuel,
  showByProductChip,
  showImportedChip, showInternalChip,
  showProductChip, showRawChip,
  showSatisfactionItemButton,
} from '@/utils/factory-management/satisfaction'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { gameData } from '@/utils/gameData'
import { addInputToFactory, getAllInputs, getInput } from '@/utils/factory-management/inputs'
import { create338Scenario } from '@/utils/factory-setups/338-satisfaction-chips'

describe('satisfaction', () => {
  let factories: Factory[]
  let mockFactory: Factory
  beforeEach(() => {
    factories = create220Scenario().getFactories()
    mockFactory = factories[0]
    calculateFactories(factories, gameData)
  })

  describe('showSatisfactionItemButton', () => {
    it('should return null if no part was found', () => {
      expect(showSatisfactionItemButton(mockFactory, 'nonExistentPart', 'addProduct')).toBe(null)
    })

    describe('addProduct', () => {
      it('should should NOT show if there is already a product', () => {
        expect(showSatisfactionItemButton(mockFactory, 'SteelPlateReinforced', 'addProduct')).toBe(false)
      })
      it('should show for a part that is not a byproduct, and is not satisfied', () => {
        // SteelPlate is an ingredient of EncasedIndustrialBeam
        expect(showSatisfactionItemButton(mockFactory, 'SteelPlate', 'addProduct')).toBe(true)
      })
      it('should NOT show for a part that is raw', () => {
        // Add a product that requires a raw ingredient
        addProductToFactory(mockFactory, {
          id: 'IronIngot',
          amount: 10,
          recipe: 'IngotIron',
        })
        calculateFactories(factories, gameData)

        expect(showSatisfactionItemButton(mockFactory, 'OreIron', 'addProduct')).toBe(false)
      })
      it('should NOT show for a part that is satisfied', () => {
        // Add import to satisfy the part
        const steelFac = newFactory('Steel 2')
        addProductToFactory(steelFac, {
          id: 'SteelPlate',
          amount: 1000,
          recipe: 'SteelPlate',
        })
        factories.push(steelFac)
        addInputToFactory(mockFactory, {
          factoryId: steelFac.id,
          outputPart: 'SteelPlate',
          amount: 1000,
        })
        calculateFactories(factories, gameData)

        // SteelPlateReinforced is now satisfied
        expect(showSatisfactionItemButton(mockFactory, 'SteelPlate', 'addProduct')).toBe(false)
      })
      it('should NOT show for a part that is already a byproduct within the factory', () => {
        expect(showSatisfactionItemButton(mockFactory, 'HeavyOilResidue', 'addProduct')).toBe(false)
      })
    })

    describe('fixProduct', () => {
      beforeEach(() => {
        // Add SteelPlates to the factory, at a deficit
        addProductToFactory(mockFactory, {
          id: 'SteelPlate',
          amount: 1,
          recipe: 'SteelPlate',
        })
      })
      it('should show if a part is a product and is not producing enough', () => {
        expect(showSatisfactionItemButton(mockFactory, 'SteelPlate', 'fixProduct')).toBe(true)
      })
    })

    describe('correctManually', () => {
      it('should show for a part that is already a byproduct within the factory', () => {
        expect(showSatisfactionItemButton(mockFactory, 'HeavyOilResidue', 'correctManually')).toBe(true)
      })
      it('should NOT show for a product already in the factory', () => {
        addProductToFactory(mockFactory, {
          id: 'SteelPlate',
          amount: 1,
          recipe: 'SteelPlate',
        })
        expect(showSatisfactionItemButton(mockFactory, 'SteelPlate', 'correctManually')).toBe(false)
      })
      it('should NOT show for a part that can be added as a product directly', () => {
        expect(showSatisfactionItemButton(mockFactory, 'SteelPlate', 'correctManually')).toBe(false)
      })
    })
    describe('fixImport', () => {
      beforeEach(() => {
        // Add an import
        const steelFac = newFactory('Steel')
        addProductToFactory(steelFac, {
          id: 'SteelPlate',
          amount: 1000,
          recipe: 'SteelPlate',
        })
        factories.push(steelFac)
        addInputToFactory(mockFactory, {
          factoryId: steelFac.id,
          outputPart: 'SteelPlate',
          amount: 1,
        })
        calculateFactories(factories, gameData)
      })
      it('should show only for an imported part', () => {
        expect(showSatisfactionItemButton(mockFactory, 'SteelPlate', 'fixImport')).toBe(true)
      })
      it('should NOT show on a product that has no imports', () => {
        expect(showSatisfactionItemButton(mockFactory, 'Plastic', 'fixImport')).toBeFalsy()
      })
      it('should NOT show on a byproduct that has no imports', () => {
        expect(showSatisfactionItemButton(mockFactory, 'HeavyOilResidue', 'fixImport')).toBeFalsy()
      })
      it('should NOT show for a satisfied input part', () => {
        const steelPlateInput = getInput(mockFactory, 'SteelPlate')
        steelPlateInput.amount = 1000
        calculateFactories(factories, gameData)
        expect(showSatisfactionItemButton(mockFactory, 'SteelPlate', 'fixImport')).toBe(false)
      })
      it('should show for a unsatisfied input part', () => {
        const steelPlateInput = getInput(mockFactory, 'SteelPlate')
        steelPlateInput.amount = 1
        calculateFactories(factories, gameData)
        expect(showSatisfactionItemButton(mockFactory, 'SteelPlate', 'fixImport')).toBe(true)
      })
      describe('#339: multiple imports', () => {
        let steelFac2: Factory
        beforeEach(() => {
          steelFac2 = newFactory('Steel 2')
          addProductToFactory(steelFac2, {
            id: 'SteelPlate',
            amount: 1000,
            recipe: 'SteelPlate',
          })
          factories.push(steelFac2)
          addInputToFactory(mockFactory, {
            factoryId: steelFac2.id,
            outputPart: 'SteelPlate',
            amount: 1,
          })
        })
        it('should return "multiple" for multiple imports', () => {
          // Force all steelplate inputs to be low
          const steelPlateInputs = getAllInputs(mockFactory, 'SteelPlate')
          steelPlateInputs.forEach(input => {
            input.amount = 1
          })
          calculateFactories(factories, gameData)

          expect(showSatisfactionItemButton(mockFactory, 'SteelPlate', 'fixImport')).toBe('multiple')
        })
        it('should NOT return "multiple" for multiple imports when unsatisfied', () => {
          // Force all steelplate inputs to be satisfied
          const steelPlateInputs = getAllInputs(mockFactory, 'SteelPlate')
          steelPlateInputs.forEach(input => {
            input.amount = 1000
          })
          calculateFactories(factories, gameData)

          expect(showSatisfactionItemButton(mockFactory, 'SteelPlate', 'fixImport')).toBe(false)
        })
      })
    })
  })
  describe('chips', () => {
    beforeEach(() => {
      factories = create338Scenario().getFactories()
      mockFactory = factories[0]
      calculateFactories(factories, gameData)
    })

    describe('showProductChip', () => {
      it('should show for a product', () => {
        expect(showProductChip(mockFactory, 'Plastic')).toBe(true)
      })
      it('should NOT show for a byproduct only', () => {
        expect(showProductChip(mockFactory, 'PolymerResin')).toBe(false)
      })
      it('should NOT show for a raw part', () => {
        expect(showProductChip(mockFactory, 'LiquidOil')).toBe(false)
      })
      it('should show when a part is both a product and a byproduct', () => {
        expect(showProductChip(mockFactory, 'HeavyOilResidue')).toBe(true)
      })
      it('should NOT show for import only parts', () => {
        // SteelPlate is imported thanks to the template
        expect(showProductChip(mockFactory, 'SteelPlate')).toBe(false)
      })
    })

    describe('showByProductChip', () => {
      it('should show for a byproduct', () => {
        expect(showByProductChip(mockFactory, 'PolymerResin')).toBe(true)
      })
      it('should NOT show for a product only', () => {
        expect(showByProductChip(mockFactory, 'Plastic')).toBe(false)
      })
      it('should NOT show for a raw part', () => {
        expect(showByProductChip(mockFactory, 'LiquidOil')).toBe(false)
      })
      it('should show when a part is both a product and a byproduct', () => {
        expect(showByProductChip(mockFactory, 'HeavyOilResidue')).toBe(true)
      })
      it('should NOT show for import only parts', () => {
        // SteelPlate is imported thanks to the template
        expect(showByProductChip(mockFactory, 'SteelPlate')).toBe(false)
      })
    })

    describe('showImportedChip', () => {
      it('should show for an imported part', () => {
        expect(showImportedChip(mockFactory, 'SteelPlate')).toBe(true)
      })
      it('should show for a part that is both a product and imported', () => {
        // Add SteelPlate as a product
        addProductToFactory(mockFactory, {
          id: 'SteelPlate',
          amount: 1000,
          recipe: 'SteelPlate',
        })
        calculateFactories(factories, gameData)
        expect(showImportedChip(mockFactory, 'SteelPlate')).toBe(true)
      })
      it('should NOT show for a product only', () => {
        expect(showImportedChip(mockFactory, 'Plastic')).toBe(false)
      })
      it('should NOT show for a byproduct only', () => {
        expect(showImportedChip(mockFactory, 'PolymerResin')).toBe(false)
      })
      it('should NOT show for a raw part', () => {
        expect(showImportedChip(mockFactory, 'LiquidOil')).toBe(false)
      })
    })

    describe('showRawChip', () => {
      it('should show for a raw part', () => {
        expect(showRawChip(mockFactory, 'LiquidOil')).toBe(true)
      })
      it('should NOT show for a product only', () => {
        expect(showRawChip(mockFactory, 'Plastic')).toBe(false)
      })
      it('should NOT show for a byproduct only', () => {
        expect(showRawChip(mockFactory, 'PolymerResin')).toBe(false)
      })
      it('should NOT show for an imported part', () => {
        expect(showRawChip(mockFactory, 'SteelPlate')).toBe(false)
      })
    })

    describe('showInternalChip', () => {
      it('should show for a product that is used internally', () => {
        expect(showInternalChip(mockFactory, 'HeavyOilResidue')).toBe(true)
      })
      it('should NOT show for a product that is not used internally', () => {
        expect(showInternalChip(mockFactory, 'Plastic')).toBe(false)
      })
      it('should NOT show for a raw part', () => {
        expect(showInternalChip(mockFactory, 'LiquidOil')).toBe(false)
      })
    })
  })

  describe('convertWasteToGeneratorFuel', () => {
    it('should correctly convert nuclear waste to generator fuel rods', () => {
      const recipe = gameData.powerGenerationRecipes.find(recipe => recipe.id === 'GeneratorNuclear_NuclearFuelRod')
      if (!recipe) {
        throw new Error('No recipe found for NuclearWaste')
      }
      const result = convertWasteToGeneratorFuel(recipe, 25)
      expect(result).toBe(0.5)
    })

    it('should correctly convert nuclear waste to generator fuel rods #2', () => {
      const recipe = gameData.powerGenerationRecipes.find(recipe => recipe.id === 'GeneratorNuclear_NuclearFuelRod')
      if (!recipe) {
        throw new Error('No recipe found for NuclearWaste')
      }
      const result = convertWasteToGeneratorFuel(recipe, 1000)
      expect(result).toBe(20)
    })
  })
})
