import { beforeEach, describe, expect, it } from 'vitest'
import { Factory, FactoryPowerChangeType } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { addPowerProducerToFactory } from '@/utils/factory-management/power'
import { fetchGameData } from '@/utils/gameDataService'
import {
  applyRawWizard,
  choicesForRow,
  collectRawWizardRows,
  DEFAULT_EXTRACTOR,
  WizardRow,
  WizardValidationError,
} from '@/utils/factory-management/raw-wizard'

describe('raw wizard', async () => {
  const gameData = await fetchGameData()

  // A smelter short of the 100/min of ore nothing in the plan digs up.
  const smelterFactory = (name = 'Smelter', id = 1) => {
    const factory = newFactory(name, id - 1, id)
    addProductToFactory(factory, { id: 'IronIngot', amount: 100, recipe: 'IngotIron' })
    return factory
  }

  const build = (factories: Factory[]) => {
    calculateFactories(factories, gameData)
    return factories
  }

  const rowFor = (rows: WizardRow[], factoryId: number, partId: string) =>
    rows.find(row => row.factoryId === factoryId && row.partId === partId)!

  describe('collectRawWizardRows', () => {
    it('collects a row per factory and unmet raw part', () => {
      const factories = build([smelterFactory()])
      const rows = collectRawWizardRows(factories)

      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ factoryId: 1, partId: 'OreIron', shortfall: 100, choice: 'mine' })
    })

    // Nothing can be built for these, so offering to fix them would be a lie.
    it('skips raw resources the game gives no extractor for', () => {
      const factory = newFactory('Fabric', 0, 1)
      addProductToFactory(factory, { id: 'Fabric', amount: 30, recipe: 'Fabric' })
      const rows = collectRawWizardRows(build([factory]))

      expect(rows.map(row => row.partId)).not.toContain('Mycelia')
    })

    // rawShortage deliberately has no product-less guard, and neither does this: a generator
    // burning coal it doesn't import is short of coal.
    it('includes a power-only factory short of its fuel', () => {
      const factory = newFactory('Coal Power', 0, 1)
      addPowerProducerToFactory(factory, {
        building: 'generatorcoal',
        powerAmount: 75,
        recipe: 'GeneratorCoal_Coal',
        updated: FactoryPowerChangeType.Power,
      })
      const rows = collectRawWizardRows(build([factory]))

      expect(rows.map(row => row.partId)).toContain('Coal')
    })

    it('defaults water to on-site rather than a shared factory', () => {
      const factory = newFactory('Alumina', 0, 1)
      addProductToFactory(factory, { id: 'AluminaSolution', amount: 100, recipe: 'AluminaSolution' })
      const rows = collectRawWizardRows(build([factory]))

      expect(rowFor(rows, 1, 'Water').choice).toBe('onsite')
      expect(rowFor(rows, 1, 'OreBauxite').choice).toBe('mine')
    })

    it('defaults to importing when a factory already mines it', () => {
      const mine = newFactory('Iron Mine', 0, 2)
      addProductToFactory(mine, { id: 'OreIron', amount: 500, recipe: 'Extract_OreIron' })
      const rows = collectRawWizardRows(build([smelterFactory(), mine]))

      const row = rowFor(rows, 1, 'OreIron')
      expect(row.choice).toBe('import')
      expect(row.importFrom).toBe(2)
      expect(row.candidates).toEqual([{ id: 2, name: 'Iron Mine' }])
    })

    // A factory that unpackages a raw resource is not a mine. Bumping its product would expand
    // a packaging chain while the row claimed to be importing ore.
    it('does not offer a factory that merely unpackages the resource as a source', () => {
      const unpackager = newFactory('Unpackager', 0, 2)
      addProductToFactory(unpackager, { id: 'LiquidOil', amount: 300, recipe: 'UnpackageOil' })
      const consumer = newFactory('Plastic', 1, 1)
      addProductToFactory(consumer, { id: 'Plastic', amount: 100, recipe: 'Plastic' })

      const rows = collectRawWizardRows(build([consumer, unpackager]))

      expect(rowFor(rows, 1, 'LiquidOil').candidates).toEqual([])
    })
  })

  describe('well-only resources', () => {
    const nitrogenFactory = () => {
      const factory = newFactory('Nitric Acid', 0, 1)
      addProductToFactory(factory, { id: 'NitricAcid', amount: 100, recipe: 'NitricAcid' })
      return build([factory])
    }

    it('cannot be mined or extracted on site, because a well has to be sized by hand', () => {
      const rows = collectRawWizardRows(nitrogenFactory())
      const row = rowFor(rows, 1, 'NitrogenGas')

      expect(row.wellOnly).toBe(true)
      expect(row.choice).toBe('ignore')
      expect(choicesForRow(row)).toEqual(['ignore'])
    })

    it('refuses to apply one even if a row is forced to mine', () => {
      const factories = nitrogenFactory()
      const rows = collectRawWizardRows(factories)
      rowFor(rows, 1, 'NitrogenGas').choice = 'mine'

      expect(() => applyRawWizard(factories, rows, gameData)).toThrow(WizardValidationError)
    })

    // Even with a well already in the plan. One lone option on a row that otherwise says "not
    // possible" reads as though the wizard half-solved it; wiring that import by hand is one
    // click in Imports.
    it('offers nothing even when a factory already has a well', () => {
      const well = newFactory('Nitrogen Well', 1, 2)
      addProductToFactory(well, { id: 'NitrogenGas', amount: 500, recipe: 'Extract_NitrogenGas_Well' })
      const factories = nitrogenFactory()
      factories.push(well)
      calculateFactories(factories, gameData)

      const row = rowFor(collectRawWizardRows(factories), 1, 'NitrogenGas')
      expect(row.wellOnly).toBe(true)
      expect(choicesForRow(row)).toEqual(['ignore'])
    })
  })

  describe('applying', () => {
    let factories: Factory[]
    let rows: WizardRow[]

    beforeEach(() => {
      factories = build([smelterFactory('Smelter A', 1), smelterFactory('Smelter B', 2)])
      rows = collectRawWizardRows(factories)
    })

    // The whole point of one-mine-per-resource: a plan short of iron in eight places should not
    // sprout eight iron mines.
    it('creates one mine per resource, sized to every factory that asked for it', () => {
      const { factories: result, summary } = applyRawWizard(factories, rows, gameData)

      const mines = result.filter(factory => factory.name === 'Iron Ore Mine')
      expect(mines).toHaveLength(1)
      expect(mines[0].products[0].amount).toBe(200)
      expect(summary.minesCreated).toEqual(['Iron Ore Mine'])
      expect(summary.importsWired).toBe(2)

      // Both consumers import from it and are satisfied.
      result.filter(factory => factory.name.startsWith('Smelter')).forEach(smelter => {
        expect(smelter.inputs).toEqual([{ factoryId: mines[0].id, outputPart: 'OreIron', amount: 100 }])
        expect(smelter.parts.OreIron.satisfied).toBe(true)
      })
    })

    // Nothing may reach the live plan until the caller commits: appStore.addFactory persists on
    // every call, so a throw partway through incremental mutation would save orphan mines.
    it('leaves the plan it was given completely untouched', () => {
      const before = JSON.stringify(factories)
      const { factories: result } = applyRawWizard(factories, rows, gameData)

      expect(JSON.stringify(factories)).toBe(before)
      expect(result).not.toBe(factories)
      expect(result.length).toBeGreaterThan(factories.length)
    })

    it('gives new mines ids that do not collide with the plan', () => {
      const { factories: result } = applyRawWizard(factories, rows, gameData)
      const ids = result.map(factory => factory.id)

      expect(new Set(ids).size).toBe(ids.length)
    })

    it('builds the mine on the chosen mark and purity, sized to match', () => {
      const { factories: result } = applyRawWizard(factories, rows, gameData)
      const mine = result.find(factory => factory.name === 'Iron Ore Mine')!
      const group = mine.products[0].buildingGroups[0]

      expect(group.extractorBuilding).toBe(DEFAULT_EXTRACTOR.building)
      expect(group.purity).toBe(DEFAULT_EXTRACTOR.purity)
      // 200/min from Mk.2s on normal nodes (120/min each) — and the groups must actually add up.
      expect(mine.products[0].buildingGroupsHaveProblem).toBe(false)
      expect(mine.parts.OreIron.amountSuppliedViaProduction).toBe(200)
      // Back to the unsynced default every mine is created with.
      expect(mine.products[0].buildingGroupItemSync).toBe(false)
    })

    it('mines on site without creating a factory when asked to', () => {
      rows.forEach(row => { row.choice = 'onsite' })
      const { factories: result, summary } = applyRawWizard(factories, rows, gameData)

      expect(result).toHaveLength(2)
      expect(summary.minesCreated).toEqual([])
      expect(summary.productsAdded).toBe(2)
      expect(result[0].parts.OreIron.satisfied).toBe(true)
    })

    it('does nothing at all for ignored rows', () => {
      rows.forEach(row => { row.choice = 'ignore' })
      const { factories: result, summary } = applyRawWizard(factories, rows, gameData)

      expect(result).toHaveLength(2)
      expect(summary).toEqual({ minesCreated: [], productsAdded: 0, importsWired: 0 })
      expect(result[0].parts.OreIron.satisfied).toBe(false)
    })

    it('adds a separate extraction product rather than bumping an unrelated one', () => {
      const factory = newFactory('Plastic', 0, 1)
      addProductToFactory(factory, { id: 'Plastic', amount: 100, recipe: 'Plastic' })
      addProductToFactory(factory, { id: 'LiquidOil', amount: 30, recipe: 'UnpackageOil' })
      const plan = build([factory])
      const oilRows = collectRawWizardRows(plan).filter(row => row.partId === 'LiquidOil')
      oilRows.forEach(row => { row.choice = 'onsite' })

      const { factories: result } = applyRawWizard(plan, oilRows, gameData)
      const oilProducts = result[0].products.filter(product => product.id === 'LiquidOil')

      expect(oilProducts).toHaveLength(2)
      expect(oilProducts.map(product => product.recipe)).toContain('UnpackageOil')
      expect(oilProducts.map(product => product.recipe)).toContain('Extract_LiquidOil')
    })

    describe('validation', () => {
      it('refuses a row whose factory has gone', () => {
        const shrunk = [factories[0]]
        rows[1].factoryId = 999

        expect(() => applyRawWizard(shrunk, rows, gameData)).toThrow(WizardValidationError)
      })

      // The number the summary promised has to be the number that gets written.
      it('refuses a row whose shortfall has moved since the table was read', () => {
        rows[0].shortfall = 50

        expect(() => applyRawWizard(factories, rows, gameData)).toThrow(/no longer short by/)
      })

      it('refuses a shortfall that is not a usable amount', () => {
        rows[0].shortfall = Number.NaN

        expect(() => applyRawWizard(factories, rows, gameData)).toThrow(WizardValidationError)
      })

      it('refuses an import from a factory that no longer mines the part', () => {
        rows[0].choice = 'import'
        rows[0].importFrom = factories[1].id

        expect(() => applyRawWizard(factories, rows, gameData)).toThrow(/no longer mines it/)
      })

      // One bad row must not leave the good ones half-applied.
      it('writes nothing when any row fails', () => {
        const before = JSON.stringify(factories)
        rows[1].shortfall = 12345

        expect(() => applyRawWizard(factories, rows, gameData)).toThrow(WizardValidationError)
        expect(JSON.stringify(factories)).toBe(before)
      })
    })
  })
})
