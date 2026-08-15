import { beforeEach, describe, expect, it } from 'vitest'
import { Factory, FactoryPowerChangeType } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { addPowerProducerToFactory } from '@/utils/factory-management/power'
import { addInputToFactory } from '@/utils/factory-management/inputs'
import { fetchGameData } from '@/utils/gameDataService'
import { createMaelsBigBoiPlan } from '@/utils/factory-setups/maels-big-boi-plan'
import {
  applyRawWizard,
  choicesForRow,
  collectRawWizardRows,
  DEFAULT_EXTRACTOR,
  placeNewFactories,
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
      expect(summary).toEqual({ minesCreated: [], productsAdded: 0, importsWired: 0, factories: [] })
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

    // A mine's quantity is only a claim; the building groups are what actually digs. Raising one
    // without the other reports ore that does not exist, and every importer downstream reads green.
    describe('mines actually mine what they claim', () => {
      const buildMine = () => {
        const mine = newFactory('Iron Mine')
        addProductToFactory(mine, { id: 'OreIron', amount: 120, recipe: 'Extract_OreIron' })
        Object.assign(mine.products[0].buildingGroups[0], {
          extractorBuilding: 'minermk2', purity: 'normal', buildingCount: 1,
        })
        const smelter = newFactory('Smelter')
        addProductToFactory(smelter, { id: 'IronIngot', amount: 300, recipe: 'IngotIron' })
        const plan = [mine, smelter]
        calculateFactories(plan, gameData)
        return plan
      }

      const mined = (product: { buildingGroups: { parts: Record<string, number> }[] }, partId: string) =>
        product.buildingGroups.reduce((total, group) => total + (group.parts[partId] ?? 0), 0)

      it('builds the extra miners when importing from a mine that already exists', () => {
        const plan = buildMine()
        const rows = collectRawWizardRows(plan)
        expect(rows[0].choice).toBe('import')

        const { factories: result } = applyRawWizard(plan, rows, gameData)
        const product = result.find(f => f.name === 'Iron Mine')!.products.find(p => p.id === 'OreIron')!

        expect(product.amount).toBe(420)
        expect(mined(product, 'OreIron')).toBeCloseTo(420, 1)
        // The group that was already there is the user's, and stays exactly as they left it.
        expect(product.buildingGroups[0].buildingCount).toBe(1)
        expect(product.buildingGroups[0].overclockPercent).toBe(100)
        expect(product.buildingGroups.length).toBe(2)
        expect(result.find(f => f.name === 'Iron Mine')!.hasProblem).toBe(false)
      })

      // An awkward quantity is the case that catches compounded rounding: 100/min from a 120/min
      // extractor is 0.8333.. buildings, and taking that at 3dp and rounding the clock to 3dp as
      // well produced 99.96, which is outside the satisfaction tolerance. Asserted against the
      // tolerance rather than toBeCloseTo, which was loose enough to pass either way.
      it('sizes an awkward quantity closely enough to actually satisfy it', () => {
        const mine = newFactory('Iron Mine')
        addProductToFactory(mine, { id: 'OreIron', amount: 120, recipe: 'Extract_OreIron' })
        // Mk.2 on a normal node is 120/min, and the shortfall below is 100: 100/120 is 0.8333..,
        // which rounds DOWN at three places. A quantity that rounds up over-produces and hides it.
        Object.assign(mine.products[0].buildingGroups[0], {
          extractorBuilding: 'minermk2', purity: 'normal', buildingCount: 1,
        })
        const consumer = newFactory('Smelter')
        addProductToFactory(consumer, { id: 'IronIngot', amount: 220, recipe: 'IngotIron' })
        const plan = [mine, consumer]
        calculateFactories(plan, gameData)

        const rows = collectRawWizardRows(plan)
        expect(rows[0].choice).toBe('import')
        const { factories: result } = applyRawWizard(plan, rows, gameData)

        const product = result.find(f => f.name === 'Iron Mine')!.products.find(p => p.id === 'OreIron')!
        const digs = mined(product, 'OreIron')
        // Within the tolerance the parts ledger actually uses, not a loose approximation.
        expect(product.amount - digs).toBeLessThanOrEqual(Math.max(0.001, product.amount * 1e-6))
        expect(result.find(f => f.name === 'Smelter')!.parts.OreIron.satisfied).toBe(true)
        expect(result.find(f => f.name === 'Iron Mine')!.hasProblem).toBe(false)
      })

      // The shipped template is the widest real case: several existing mines, several
      // consumers, all defaulting to 'import'. It caught four inflated mines before the fix.
      it('leaves no mine in the shipped MegaPlan claiming more than it digs', () => {
        const plan = JSON.parse(JSON.stringify(createMaelsBigBoiPlan().getFactories()))
        calculateFactories(plan, gameData)
        const megaRows = collectRawWizardRows(plan)
        expect(megaRows.length).toBeGreaterThan(0)
        expect(megaRows.filter(row => row.choice === 'import').length).toBeGreaterThan(0)

        const { factories: result } = applyRawWizard(plan, megaRows, gameData)

        const drift: string[] = []
        for (const factory of result) {
          for (const product of factory.products) {
            if (!product.buildingGroups?.length) continue
            const digs = mined(product, product.id)
            if (Math.abs(digs - product.amount) > 0.5) {
              drift.push(`${factory.name}/${product.id}: claims ${product.amount}, groups make ${digs}`)
            }
          }
        }
        expect(drift).toEqual([])
      })

      it('builds the extra miners when producing on site', () => {
        const plan = buildMine()
        const rows = collectRawWizardRows(plan)
        rows[0].choice = 'onsite'
        rows[0].factoryId = plan[1].id

        const { factories: result } = applyRawWizard(plan, rows, gameData)
        const smelter = result.find(f => f.name === 'Smelter')!
        const product = smelter.products.find(p => p.id === 'OreIron')

        if (product) {
          expect(mined(product, 'OreIron')).toBeCloseTo(product.amount, 1)
        }
        expect(smelter.hasProblem).toBe(false)
      })
    })

    describe('placement of new mines', () => {
      it('puts them at the top of the plan by default, renumbering everything', () => {
        const { factories: result } = applyRawWizard(factories, rows, gameData)

        expect(result.map(factory => factory.name)).toEqual(['Iron Ore Mine', 'Smelter A', 'Smelter B'])
        expect(result.map(factory => factory.displayOrder)).toEqual([0, 1, 2])
      })

      it('puts them at the bottom when asked', () => {
        const { factories: result } = applyRawWizard(factories, rows, gameData, { placement: 'bottom' })

        expect(result.map(factory => factory.name)).toEqual(['Smelter A', 'Smelter B', 'Iron Ore Mine'])
        expect(result.map(factory => factory.displayOrder)).toEqual([0, 1, 2])
      })

      // Nothing was created, so nothing should be shuffled.
      it('leaves the order alone when no mine is created', () => {
        rows.forEach(row => { row.choice = 'onsite' })
        const { factories: result } = applyRawWizard(factories, rows, gameData)

        expect(result.map(factory => factory.name)).toEqual(['Smelter A', 'Smelter B'])
      })

      // The review moves an already-built result rather than applying again, so that anything
      // renamed on that screen survives changing the answer.
      it('can be changed on a built result without re-applying', () => {
        const { factories: result, summary } = applyRawWizard(factories, rows, gameData)
        const newIds = new Set(summary.factories.filter(plan => plan.isNew).map(plan => plan.factoryId))

        const moved = placeNewFactories(result, newIds, 'bottom')

        expect(moved.map(factory => factory.name)).toEqual(['Smelter A', 'Smelter B', 'Iron Ore Mine'])
        expect(moved.map(factory => factory.displayOrder)).toEqual([0, 1, 2])
        expect(placeNewFactories(moved, newIds, 'top').map(factory => factory.name))
          .toEqual(['Iron Ore Mine', 'Smelter A', 'Smelter B'])
      })
    })

    describe('the review breakdown', () => {
      it('describes every factory it touched, in plan order', () => {
        const { summary } = applyRawWizard(factories, rows, gameData)

        expect(summary.factories.map(plan => plan.factoryName))
          .toEqual(['Iron Ore Mine', 'Smelter A', 'Smelter B'])
        expect(summary.factories[0].isNew).toBe(true)
        expect(summary.factories[1].isNew).toBe(false)
      })

      it('lists the mine once with an export per factory it feeds', () => {
        const { summary } = applyRawWizard(factories, rows, gameData)
        const mine = summary.factories[0]

        expect(mine.products)
          .toEqual([{ partId: 'OreIron', partName: 'Iron Ore', amount: 200, change: 'new' }])
        expect(mine.exports.map(exported => [exported.toFactoryName, exported.partId, exported.amount]))
          .toEqual([['Smelter A', 'OreIron', 100], ['Smelter B', 'OreIron', 100]])
      })

      // A factory the run only wired up shows no change to its products at all — the import is
      // the entire change, and without it the review would say "modified" and show nothing.
      it('lists the import it wired into a consumer', () => {
        const { summary } = applyRawWizard(factories, rows, gameData)
        const smelter = summary.factories[1]
        const mineId = summary.factories[0].factoryId

        expect(smelter.products)
          .toEqual([{ partId: 'IronIngot', partName: 'Iron Ingot', amount: 100, change: null }])
        expect(smelter.imports).toEqual([{
          fromFactoryId: mineId,
          fromFactoryName: 'Iron Ore Mine',
          partId: 'OreIron',
          partName: 'Iron Ore',
          amount: 100,
          change: 'new',
        }])
        expect(smelter.exports).toEqual([])
      })

      // The whole point of the flag: telling the wizard's addition apart from what was there.
      it('marks only the on-site extraction it just added as new', () => {
        rows.forEach(row => { row.choice = 'onsite' })
        const { summary } = applyRawWizard(factories, rows, gameData)

        expect(summary.factories[0].products.map(product => [product.partId, product.change]))
          .toEqual([['IronIngot', null], ['OreIron', 'new']])
        expect(summary.factories[0].imports).toEqual([])
      })

      // Bumping what is already there is a change to it, not a new one — on both sides of the wire.
      it('separates a raised product and import from a created one', () => {
        const mine = newFactory('Iron Mine', 2, 3)
        addProductToFactory(mine, { id: 'OreIron', amount: 500, recipe: 'Extract_OreIron' })
        const consumer = factories[0]
        addInputToFactory(consumer, { factoryId: 3, outputPart: 'OreIron', amount: 40 })
        const plan = build([...factories, mine])
        const importRows = collectRawWizardRows(plan)

        const { summary } = applyRawWizard(plan, importRows, gameData)
        const described = summary.factories.find(entry => entry.factoryName === 'Iron Mine')!
        const smelterA = summary.factories.find(entry => entry.factoryName === 'Smelter A')!

        expect(described.isNew).toBe(false)
        expect(described.products[0]).toMatchObject({ partId: 'OreIron', change: 'increased' })
        expect(smelterA.imports[0]).toMatchObject({ partId: 'OreIron', amount: 100, change: 'increased' })
      })
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

      // amountRemaining is supply minus demand, so a shortage and a surplus of the same size are
      // the same number once the sign is dropped — and the check used to drop it. A row that
      // passed this way would mine for a part the factory had going spare.
      it('refuses a row whose shortage has become a surplus of the same size', () => {
        const mine = newFactory('Iron Mine', 2, 3)
        addProductToFactory(mine, { id: 'OreIron', amount: 200, recipe: 'Extract_OreIron' })
        addInputToFactory(factories[0], { factoryId: 3, outputPart: 'OreIron', amount: 200 })
        const plan = build([...factories, mine])

        // Smelter A is now 100 over, where the row still says it is 100 short.
        expect(plan[0].parts.OreIron.amountRemaining).toBe(100)
        expect(rows[0].shortfall).toBe(100)

        expect(() => applyRawWizard(plan, rows, gameData)).toThrow(/no longer short of/)
      })

      it('refuses a row whose shortage has been met exactly', () => {
        const mine = newFactory('Iron Mine', 2, 3)
        addProductToFactory(mine, { id: 'OreIron', amount: 100, recipe: 'Extract_OreIron' })
        addInputToFactory(factories[0], { factoryId: 3, outputPart: 'OreIron', amount: 100 })
        const plan = build([...factories, mine])

        expect(() => applyRawWizard(plan, rows, gameData)).toThrow(/no longer short of/)
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
