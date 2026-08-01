import { beforeEach, describe, expect, test } from 'vitest'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { newFactory } from '@/utils/factory-management/factory'
import { createNewPart } from '@/utils/factory-management/common'
import { mockPowerProducer, mockProduct } from '@/utils/factory-management/status-fixtures'
import {
  factoryStatusClass,
  factoryStatusDefinitions,
  getChipStatuses,
  getFactoryStatuses,
  getSectionStatuses,
  hasFactoryProblem,
  highestSeverity,
} from '@/utils/factory-management/status'

const typesOf = (factory: Factory) => getFactoryStatuses(factory).map(status => status.type)
const statusOf = (factory: Factory, type: string) =>
  getFactoryStatuses(factory).find(status => status.type === type)

// A factory with one product and one satisfied part — the baseline every case perturbs.
const healthyFactory = (): Factory => {
  const factory = newFactory('Test Factory')
  factory.products = [mockProduct('IronIngot')]
  createNewPart(factory, 'IronIngot')
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

    test('ignores raw parts — they are supplied by the world, not by this factory', () => {
      factory.parts.IronIngot.satisfied = false
      factory.parts.IronIngot.isRaw = true

      expect(typesOf(factory)).not.toContain('partShortage')
    })

    // Mirrors calculateParts, which reports requirementsSatisfied === true whenever a factory has
    // no products. Without this guard a power-only factory short of fuel would newly go red, which
    // would change hasProblem on plans people have already saved.
    test('does not fire on a factory with no products', () => {
      factory.products = []
      factory.parts.IronIngot.satisfied = false

      expect(typesOf(factory)).not.toContain('partShortage')
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

  describe('the registry itself', () => {
    test('every definition renders a chip', () => {
      factory.inSync = false
      factory.parts.IronIngot.satisfied = false

      expect(getChipStatuses(getFactoryStatuses(factory))).toHaveLength(2)
    })

    test('is declared problems-first, so callers never have to sort', () => {
      const severities = factoryStatusDefinitions.map(definition => definition.severity)
      expect(severities.indexOf('warning')).toBeGreaterThan(severities.lastIndexOf('problem'))
    })

    test('has no duplicate types', () => {
      const types = factoryStatusDefinitions.map(definition => definition.type)
      expect(new Set(types).size).toBe(types.length)
    })
  })
})
