import { beforeEach, describe, expect, test } from 'vitest'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { newFactory } from '@/utils/factory-management/factory'
import { createNewPart } from '@/utils/factory-management/common'
import { mockPowerProducer, mockProduct } from '@/utils/factory-management/status-fixtures'
import {
  factoryStatusClass,
  factoryStatusDefinitions,
  factoryStatusTallyChips,
  getChipStatuses,
  getFactoryStatuses,
  getSectionStatuses,
  hasFactoryProblem,
  hasNoDemand,
  highestSeverity,
  isEndProduct,
  tallyFactoryStatuses,
} from '@/utils/factory-management/status'

const typesOf = (factory: Factory) => getFactoryStatuses(factory).map(status => status.type)
const statusOf = (factory: Factory, type: string) =>
  getFactoryStatuses(factory).find(status => status.type === type)

// A factory with one product and one satisfied part — the baseline every case perturbs. Its
// output is asked for: a product nothing wants is a state of its own (noDemand), so leaving the
// demand at zero would put that status on every case below.
const healthyFactory = (): Factory => {
  const factory = newFactory('Test Factory')
  factory.products = [mockProduct('IronIngot')]
  createNewPart(factory, 'IronIngot')
  factory.parts.IronIngot.amountRequired = 100
  return factory
}

// An import row whose part the factory needs but does not produce, so it is genuinely required.
const withRequiredImport = (factory: Factory, part: string, amount = 100) => {
  createNewPart(factory, part)
  factory.parts[part].amountRequired = amount
  factory.inputs.push({ factoryId: 2, outputPart: part, amount })
}

describe('status', () => {
  let factory: Factory

  beforeEach(() => {
    factory = healthyFactory()
  })

  describe('a clean factory', () => {
    test('yields no statuses at all', () => {
      expect(getFactoryStatuses(factory)).toEqual([])
    })

    test('is not a problem', () => {
      expect(hasFactoryProblem(factory)).toBe(false)
    })
  })

  describe('partShortage', () => {
    test('fires for an unsatisfied non-raw part and names it', () => {
      factory.parts.IronIngot.satisfied = false

      expect(statusOf(factory, 'partShortage')).toMatchObject({
        severity: 'problem',
        section: 'satisfaction',
        label: 'Shortage',
        subjects: [{ id: 'IronIngot', type: 'item' }],
      })
    })

    test('counts rather than lists when several parts are short', () => {
      createNewPart(factory, 'CopperIngot')
      factory.parts.IronIngot.satisfied = false
      factory.parts.CopperIngot.satisfied = false

      const status = statusOf(factory, 'partShortage')
      expect(status?.label).toBe('2 shortages')
      expect(status?.subjects).toHaveLength(2)
    })

    // Mirrors calculateParts, which reports requirementsSatisfied === true whenever a factory has
    // no products. Without this guard a power-only factory short of fuel would newly go red, which
    // would change hasProblem on plans people have already saved.
    test('does not fire on a factory with no products', () => {
      factory.products = []
      factory.parts.IronIngot.satisfied = false

      expect(typesOf(factory)).not.toContain('partShortage')
    })

    // Raw resources used to have a status of their own. Being told which kind of shortage it was
    // never told anyone anything they could act on, so there is one status and one chip.
    describe('raw resources', () => {
      const shortOfOre = () => {
        createNewPart(factory, 'OreIron')
        factory.parts.OreIron.isRaw = true
        factory.parts.OreIron.satisfied = false
      }

      test('fires for an unsatisfied raw part, in the same status as a manufactured one', () => {
        shortOfOre()

        expect(statusOf(factory, 'partShortage')).toMatchObject({
          severity: 'problem',
          section: 'satisfaction',
          label: 'Shortage',
          subjects: [{ id: 'OreIron', type: 'item' }],
        })
      })

      test('counts raw and manufactured shortages together', () => {
        shortOfOre()
        factory.parts.IronIngot.satisfied = false

        const status = statusOf(factory, 'partShortage')
        expect(status?.label).toBe('2 shortages')
        expect(status?.subjects).toEqual([
          { id: 'IronIngot', type: 'item' },
          { id: 'OreIron', type: 'item' },
        ])
      })

      // Hand-gathered resources leave the engine satisfied, so the !satisfied filter is the only
      // guard this needs — there is no assumption left to check.
      test('stays silent for a raw part the engine left satisfied', () => {
        createNewPart(factory, 'Leaves')
        factory.parts.Leaves.isRaw = true
        factory.parts.Leaves.satisfied = true

        expect(typesOf(factory)).not.toContain('partShortage')
      })

      // A mine that extracts everything it exports is the point of the feature, so it must not
      // report a shortage merely for having raw parts.
      test('ignores a raw part the factory satisfies itself', () => {
        createNewPart(factory, 'OreIron')
        factory.parts.OreIron.isRaw = true

        expect(typesOf(factory)).not.toContain('partShortage')
      })

      // The raw half bypasses the product-less guard the manufactured half obeys, so folding the
      // two into one status must not quietly apply that guard to raw resources.
      test('still fires on a factory with no products, such as a generator burning coal', () => {
        factory.products = []
        createNewPart(factory, 'Coal')
        factory.parts.Coal.isRaw = true
        factory.parts.Coal.satisfied = false

        expect(typesOf(factory)).toContain('partShortage')
      })
    })
  })

  describe('exportShortage', () => {
    beforeEach(() => {
      factory.dependencies.metrics = {
        IronIngot: { part: 'IronIngot', request: 900, supply: 900, isRequestSatisfied: true, difference: 0 },
      }
    })

    test('does not fire while every request is satisfied', () => {
      expect(typesOf(factory)).not.toContain('exportShortage')
    })

    test('fires for an unsatisfied request, with a fuller label for section headers', () => {
      factory.dependencies.metrics.IronIngot.isRequestSatisfied = false

      expect(statusOf(factory, 'exportShortage')).toMatchObject({
        severity: 'problem',
        section: 'satisfaction',
        label: 'Export unmet',
        detailLabel: 'Export request unmet',
        subjects: [{ id: 'IronIngot', type: 'item' }],
      })
    })
  })

  describe('buildingGroupMismatch', () => {
    test('fires for a product, whose subject is the item it makes', () => {
      factory.products[0].buildingGroupsHaveProblem = true

      expect(statusOf(factory, 'buildingGroupMismatch')).toMatchObject({
        severity: 'problem',
        section: 'products',
        subjects: [{ id: 'IronIngot', type: 'item' }],
      })
    })

    // The bug this plan fixes: calculateBuildingGroupProblems has always run for power producers,
    // but the old rollup only ever looked at factory.products. #506
    test('fires for a power producer on a factory with no products', () => {
      factory.products = []
      factory.powerProducers = [mockPowerProducer('GeneratorCoal', { buildingGroupsHaveProblem: true })]

      expect(statusOf(factory, 'buildingGroupMismatch')).toMatchObject({ severity: 'problem' })
    })

    // A producer's id is a random instance number, so it cannot be handed to <game-asset type="item">.
    test('uses the building, not the producer id, as a power producer subject', () => {
      factory.powerProducers = [mockPowerProducer('GeneratorCoal', { buildingGroupsHaveProblem: true })]

      expect(statusOf(factory, 'buildingGroupMismatch')?.subjects).toEqual([
        { id: 'GeneratorCoal', type: 'building' },
      ])
    })

    test('counts products and producers together', () => {
      factory.products[0].buildingGroupsHaveProblem = true
      factory.powerProducers = [mockPowerProducer('GeneratorCoal', { buildingGroupsHaveProblem: true })]

      expect(statusOf(factory, 'buildingGroupMismatch')?.label).toBe('2 building groups')
    })
  })

  describe('outOfSync', () => {
    test('does not fire while the factory has never been marked built', () => {
      factory.inSync = null
      expect(typesOf(factory)).not.toContain('outOfSync')
    })

    test('does not fire while in sync', () => {
      factory.inSync = true
      expect(typesOf(factory)).not.toContain('outOfSync')
    })

    test('fires when drifted, as a warning with no subjects and no section', () => {
      factory.inSync = false

      expect(statusOf(factory, 'outOfSync')).toMatchObject({
        severity: 'warning',
        label: 'Out of sync',
        subjects: [],
      })
      expect(statusOf(factory, 'outOfSync')?.section).toBeUndefined()
    })
  })

  describe('redundantImport', () => {
    test('does not fire for an import the factory actually needs', () => {
      withRequiredImport(factory, 'IronOre')

      expect(typesOf(factory)).not.toContain('redundantImport')
    })

    test('fires when internal production already covers the part', () => {
      withRequiredImport(factory, 'IronOre')
      factory.parts.IronOre.amountSuppliedViaProduction = 100

      expect(statusOf(factory, 'redundantImport')).toMatchObject({
        severity: 'warning',
        section: 'imports',
        label: 'Redundant import',
        subjects: [{ id: 'IronOre', type: 'item' }],
      })
    })
  })

  describe('duplicateImport', () => {
    test('does not fire for two rows of the same part from different factories', () => {
      withRequiredImport(factory, 'IronOre')
      factory.inputs.push({ factoryId: 3, outputPart: 'IronOre', amount: 50 })

      expect(typesOf(factory)).not.toContain('duplicateImport')
    })

    test('fires for two rows of the same part from the same factory, deduped to one subject', () => {
      withRequiredImport(factory, 'IronOre')
      factory.inputs.push({ factoryId: 2, outputPart: 'IronOre', amount: 50 })

      expect(statusOf(factory, 'duplicateImport')).toMatchObject({
        severity: 'warning',
        section: 'imports',
        label: 'Duplicate import',
        subjects: [{ id: 'IronOre', type: 'item' }],
      })
    })
  })

  describe('noDemand', () => {
    test('fires for a product nothing asks for', () => {
      factory.parts.IronIngot.amountRequired = 0

      expect(statusOf(factory, 'noDemand')).toMatchObject({
        severity: 'note',
        section: 'products',
        label: 'No demand',
        subjects: [{ id: 'IronIngot', type: 'item' }],
      })
    })

    test('does not fire while anything at all asks for the output', () => {
      factory.parts.IronIngot.amountRequired = 0.5

      expect(typesOf(factory)).not.toContain('noDemand')
    })

    test('a surplus is not the same as no demand', () => {
      factory.parts.IronIngot.amountRequired = 40
      factory.parts.IronIngot.amountRemaining = 60

      expect(typesOf(factory)).not.toContain('noDemand')
    })

    // Byproducts have their own, worse status. Saying the same item in both chips would be
    // saying it twice.
    test('leaves byproducts to unhandledByproduct', () => {
      factory.byProducts = [{ id: 'Water', amount: 100, byProductOf: 'IronIngot' }]
      createNewPart(factory, 'Water')

      expect(typesOf(factory)).not.toContain('noDemand')
      expect(typesOf(factory)).toContain('unhandledByproduct')
    })

    test('an item that is both a product and a byproduct counts as the byproduct', () => {
      factory.parts.IronIngot.amountRequired = 0
      factory.byProducts = [{ id: 'IronIngot', amount: 10, byProductOf: 'IronIngot' }]

      expect(typesOf(factory)).not.toContain('noDemand')
      expect(statusOf(factory, 'unhandledByproduct')?.subjects).toEqual([
        { id: 'IronIngot', type: 'item' },
      ])
    })

    // The engine rebuilds factory.parts every pass; a product added between passes has none yet.
    test('ignores an output with no part data', () => {
      factory.products.push(mockProduct('CopperIngot'))

      expect(typesOf(factory)).not.toContain('noDemand')
    })

    // An end product with no consumer is finished, not spare. It gets its own chip instead.
    test('says nothing about an end product', () => {
      factory.parts.IronIngot.amountRequired = 0
      factory.parts.IronIngot.isEndProduct = true

      expect(typesOf(factory)).not.toContain('noDemand')
      expect(hasNoDemand(factory, 'IronIngot')).toBe(false)
      expect(isEndProduct(factory, 'IronIngot')).toBe(true)
    })

    test('an end product this factory only imports is neither', () => {
      createNewPart(factory, 'Rebar_Explosive')
      factory.parts.Rebar_Explosive.isEndProduct = true

      expect(isEndProduct(factory, 'Rebar_Explosive')).toBe(false)
      expect(hasNoDemand(factory, 'Rebar_Explosive')).toBe(false)
    })

    test('leaves the factory green, unlike every other tier', () => {
      factory.parts.IronIngot.amountRequired = 0
      const statuses = getFactoryStatuses(factory)

      expect(highestSeverity(statuses)).toBe('note')
      expect(factoryStatusClass(statuses)).toEqual({ problem: false, warning: false })
      expect(hasFactoryProblem(factory)).toBe(false)
    })
  })

  describe('unhandledByproduct', () => {
    const withByproduct = (id: string) => {
      factory.byProducts = [{ id, amount: 100, byProductOf: 'IronIngot' }]
      createNewPart(factory, id)
    }

    test('fires for a byproduct nothing takes, and colours the factory amber', () => {
      withByproduct('HeavyOilResidue')

      expect(statusOf(factory, 'unhandledByproduct')).toMatchObject({
        severity: 'warning',
        section: 'products',
        label: 'Unhandled byproduct',
        subjects: [{ id: 'HeavyOilResidue', type: 'item' }],
      })
      expect(factoryStatusClass(getFactoryStatuses(factory))).toEqual({ problem: false, warning: true })
    })

    // Plutonium Waste off a Plutonium Fuel Rod line: the generator makes it whether you have
    // somewhere to put it or not.
    test('counts a power generator\'s waste', () => {
      factory.powerProducers = [mockPowerProducer('generatornuclear', {
        byproduct: { part: 'PlutoniumWaste', amount: 10 },
      })]
      createNewPart(factory, 'PlutoniumWaste')

      expect(statusOf(factory, 'unhandledByproduct')?.subjects).toEqual([
        { id: 'PlutoniumWaste', type: 'item' },
      ])
    })

    test('stays silent once something consumes it', () => {
      withByproduct('HeavyOilResidue')
      factory.parts.HeavyOilResidue.amountRequired = 100

      expect(typesOf(factory)).not.toContain('unhandledByproduct')
    })

    // Exporting it is handling it: the request is demand like any other.
    test('stays silent once another factory takes it', () => {
      withByproduct('HeavyOilResidue')
      factory.parts.HeavyOilResidue.amountRequiredExports = 100
      factory.parts.HeavyOilResidue.amountRequired = 100

      expect(typesOf(factory)).not.toContain('unhandledByproduct')
    })

    test('is a warning, so it does not make the factory a problem', () => {
      withByproduct('HeavyOilResidue')

      expect(hasFactoryProblem(factory)).toBe(false)
    })
  })

  describe('getFactoryStatuses', () => {
    test('returns problems before warnings when several apply at once', () => {
      factory.parts.IronIngot.satisfied = false
      factory.inSync = false

      const severities = getFactoryStatuses(factory).map(status => status.severity)
      expect(severities).toEqual(['problem', 'warning'])
    })

    test('reports every applicable status, not just the most severe', () => {
      factory.parts.IronIngot.satisfied = false
      factory.products[0].buildingGroupsHaveProblem = true
      factory.inSync = false

      expect(typesOf(factory)).toEqual(['partShortage', 'buildingGroupMismatch', 'outOfSync'])
    })
  })

  describe('hasFactoryProblem', () => {
    test('agrees with the full status list on every definition', () => {
      const cases: (() => void)[] = [
        () => { factory.parts.IronIngot.satisfied = false },
        () => {
          factory.dependencies.metrics = {
            IronIngot: { part: 'IronIngot', request: 900, supply: 0, isRequestSatisfied: false, difference: -900 },
          }
        },
        () => { factory.products[0].buildingGroupsHaveProblem = true },
        () => { factory.inSync = false },
        () => { withRequiredImport(factory, 'IronOre'); factory.parts.IronOre.amountSuppliedViaProduction = 100 },
        () => {
          createNewPart(factory, 'OreIron')
          factory.parts.OreIron.isRaw = true
          factory.parts.OreIron.satisfied = false
        },
      ]

      for (const apply of cases) {
        factory = healthyFactory()
        apply()
        expect(hasFactoryProblem(factory)).toBe(
          getFactoryStatuses(factory).some(status => status.severity === 'problem')
        )
      }
    })

    test('is false when only warnings apply', () => {
      factory.inSync = false

      expect(hasFactoryProblem(factory)).toBe(false)
      expect(getFactoryStatuses(factory)).toHaveLength(1)
    })
  })

  describe('highestSeverity and factoryStatusClass', () => {
    test('a problem alongside a warning collapses to problem', () => {
      factory.parts.IronIngot.satisfied = false
      factory.inSync = false

      const statuses = getFactoryStatuses(factory)
      expect(highestSeverity(statuses)).toBe('problem')
      expect(factoryStatusClass(statuses)).toEqual({ problem: true, warning: false })
    })

    test('a warning alone collapses to warning', () => {
      factory.inSync = false

      const statuses = getFactoryStatuses(factory)
      expect(highestSeverity(statuses)).toBe('warning')
      expect(factoryStatusClass(statuses)).toEqual({ problem: false, warning: true })
    })

    test('nothing applying leaves both classes off', () => {
      expect(highestSeverity([])).toBeNull()
      expect(factoryStatusClass([])).toEqual({ problem: false, warning: false })
    })

    // Display sites index a Map by factory id, which yields undefined before the memo populates.
    test('survives an undefined status list', () => {
      expect(factoryStatusClass()).toEqual({ problem: false, warning: false })
    })
  })

  describe('getSectionStatuses', () => {
    test('routes each status to the section header that owns it', () => {
      factory.parts.IronIngot.satisfied = false
      factory.products[0].buildingGroupsHaveProblem = true
      withRequiredImport(factory, 'IronOre')
      factory.parts.IronOre.amountSuppliedViaProduction = 100
      factory.inSync = false

      const statuses = getFactoryStatuses(factory)
      expect(getSectionStatuses(statuses, 'satisfaction').map(s => s.type)).toEqual(['partShortage'])
      expect(getSectionStatuses(statuses, 'products').map(s => s.type)).toEqual(['buildingGroupMismatch'])
      expect(getSectionStatuses(statuses, 'imports').map(s => s.type)).toEqual(['redundantImport'])
    })

    test('never routes a sectionless status anywhere', () => {
      factory.inSync = false
      const statuses = getFactoryStatuses(factory)

      for (const section of ['satisfaction', 'imports', 'products'] as const) {
        expect(getSectionStatuses(statuses, section)).toEqual([])
      }
    })
  })

  describe('tallyFactoryStatuses', () => {
    const tallyOf = (factories: Factory[]) =>
      tallyFactoryStatuses(factories.map(each => getFactoryStatuses(each)))
    const chipsOf = (factories: Factory[]) => factoryStatusTallyChips(tallyOf(factories))

    test('counts nothing for a healthy plan', () => {
      expect(chipsOf([healthyFactory(), healthyFactory()])).toEqual([])
    })

    test('counts the note tier alongside the rest, last', () => {
      const idle = healthyFactory()
      idle.parts.IronIngot.amountRequired = 0
      const short = healthyFactory()
      short.parts.IronIngot.satisfied = false

      expect(chipsOf([idle, short])).toEqual([
        expect.objectContaining({ key: 'shortages', count: 1 }),
        expect.objectContaining({ key: 'noDemand', count: 1, class: 'status-note' }),
      ])
    })

    test('counts factories, not the states inside one', () => {
      const short = healthyFactory()
      short.parts.IronIngot.satisfied = false
      createNewPart(short, 'IronOre')
      short.parts.IronOre.isRaw = true
      short.parts.IronOre.satisfied = false

      // A part shortage and a raw shortage in one factory is still one factory short.
      expect(tallyOf([short]).shortages).toBe(1)
    })

    test('adds up across a plan', () => {
      const short = healthyFactory()
      short.parts.IronIngot.satisfied = false
      const stale = healthyFactory()
      stale.inSync = false
      const both = healthyFactory()
      both.parts.IronIngot.satisfied = false
      both.inSync = false

      const tally = tallyOf([healthyFactory(), short, stale, both])
      expect(tally.shortages).toBe(2)
      expect(tally.outOfSync).toBe(2)
    })

    test('counts building group problems, which the old rollup buried', () => {
      const wonky = healthyFactory()
      wonky.products[0].buildingGroupsHaveProblem = true

      expect(chipsOf([wonky])).toEqual([
        expect.objectContaining({ key: 'buildingGroups', count: 1, icon: 'fas fa-layer-group' }),
      ])
    })

    test('names each kind rather than rolling them into "problems"', () => {
      const short = healthyFactory()
      short.parts.IronIngot.satisfied = false
      const stale = healthyFactory()
      stale.inSync = false

      expect(chipsOf([short, stale])).toEqual([
        expect.objectContaining({ key: 'shortages', count: 1, label: 'shortage' }),
        expect.objectContaining({ key: 'outOfSync', count: 1, label: 'out of sync' }),
      ])
    })

    test('pluralises the label and the tooltip together', () => {
      const factories = [healthyFactory(), healthyFactory()]
      for (const factory of factories) factory.parts.IronIngot.satisfied = false

      expect(chipsOf(factories)[0]).toMatchObject({
        label: 'shortages',
        tooltip: '2 factories are short of parts',
      })
    })

    test('lists problems before warnings, so no display site has to sort', () => {
      const factory = healthyFactory()
      factory.parts.IronIngot.satisfied = false
      factory.inSync = false

      expect(chipsOf([factory]).map(chip => chip.key)).toEqual(['shortages', 'outOfSync'])
    })
  })

  describe('the registry itself', () => {
    test('every definition renders a chip', () => {
      factory.inSync = false
      factory.parts.IronIngot.satisfied = false

      expect(getChipStatuses(getFactoryStatuses(factory))).toHaveLength(2)
    })

    test('is declared problems-first, so callers never have to sort', () => {
      const severities = factoryStatusDefinitions.map(definition => definition.severity)
      expect(severities.indexOf('warning')).toBeGreaterThan(severities.lastIndexOf('problem'))
      expect(severities.indexOf('note')).toBeGreaterThan(severities.lastIndexOf('warning'))
    })

    test('has no duplicate types', () => {
      const types = factoryStatusDefinitions.map(definition => definition.type)
      expect(new Set(types).size).toBe(types.length)
    })
  })
})
