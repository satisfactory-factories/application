import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Factory, FactoryItem } from '@/interfaces/planner/FactoryInterface'
import { newFactory } from '@/utils/factory-management/factory'
import { validateFactories } from '@/utils/factory-management/validation'
import { addInputToFactory } from '@/utils/factory-management/inputs'
import { gameData } from '@/utils/gameData'
import { addProductToFactory } from '@/utils/factory-management/products'

describe('validation', () => {
  let mockFactory: Factory

  beforeEach(() => {
    // Every repair logs the detail for anyone debugging a shared plan; not under test here.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockFactory = newFactory('Iron Ingots')
  })

  it('should successfully detect and delete an invalid factory input', () => {
    addInputToFactory(mockFactory, {
      factoryId: 123456,
      outputPart: 'IronOre',
      amount: 123,
    })

    const repairs = validateFactories([mockFactory], gameData)

    expect(mockFactory.inputs.length).toBe(0)
    expect(repairs).toHaveLength(1)
    expect(repairs[0].factoryName).toBe('Iron Ingots')
    expect(repairs[0].summary).toContain('can no longer identify')
  })

  it('should successfully detect and delete an invalid dependency', () => {
    mockFactory.dependencies.requests[2346] = [{
      requestingFactoryId: 123456,
      amount: 123,
      part: 'Foo',
    }]

    const repairs = validateFactories([mockFactory], gameData)

    expect(mockFactory.dependencies.requests).toEqual({})
    expect(repairs).toHaveLength(1)
    expect(repairs[0].summary).toContain('can no longer identify')
  })

  it('should not inadvertently delete valid factory inputs', () => {
    const validFactory: Factory = newFactory('Some Factory')

    addInputToFactory(mockFactory, {
      factoryId: validFactory.id,
      outputPart: 'IronOre',
      amount: 123,
    })
    addInputToFactory(mockFactory, {
      factoryId: 123456,
      outputPart: 'MadeUpPart',
      amount: 123,
    })

    validateFactories([mockFactory, validFactory], gameData)

    expect(mockFactory.inputs.length).toBe(1)
    expect(mockFactory.inputs[0].factoryId).toBe(validFactory.id)
  })

  it('should not inadvertently delete valid dependencies', () => {
    const validFactory: Factory = newFactory('Some Factory')

    // A request is only valid while the factory it names is actually importing that part.
    addInputToFactory(validFactory, {
      factoryId: mockFactory.id,
      outputPart: 'IronOre',
      amount: 123,
    })
    mockFactory.dependencies.requests[validFactory.id] = [{
      requestingFactoryId: validFactory.id,
      part: 'IronOre',
      amount: 123,
    }]
    mockFactory.dependencies.requests[12345] = [{
      requestingFactoryId: 12345,
      part: 'IronOre',
      amount: 123,
    }]

    const repairs = validateFactories([mockFactory, validFactory], gameData)

    expect(mockFactory.dependencies.requests[validFactory.id]).toBeDefined()
    expect(mockFactory.dependencies.requests[12345]).toBeUndefined()
    expect(repairs).toHaveLength(1)
  })

  it('should run validation on products when they contain a null array', () => {
    // @ts-ignore
    mockFactory.products = [null]

    const repairs = validateFactories([mockFactory], gameData)

    expect(mockFactory.products).toEqual([])
    expect(repairs.map(entry => entry.summary)).toEqual([
      'Had an empty product entry, which has been removed.',
    ])
  })

  it('should run validation on products when they contain a <1 amount', () => {
    const mockInvalidProduct = {
      id: 'IronIngot',
      amount: 0,
      recipe: 'IngotIron',
    } as FactoryItem
    mockFactory.products = [mockInvalidProduct]

    const repairs = validateFactories([mockFactory], gameData)

    expect(mockFactory.products[0].amount).toBe(0.1)
    expect(repairs).toHaveLength(1)
    expect(repairs[0].summary).toContain('0.1/min')
  })

  it('should NOT run validation on products when they contain a >1 amount', () => {
    const mockInvalidProduct = {
      id: 'IronIngot',
      amount: 2,
      recipe: 'IngotIron',
    } as FactoryItem
    mockFactory.products = [mockInvalidProduct]

    const repairs = validateFactories([mockFactory], gameData)

    expect(mockFactory.products[0].amount).toBe(2)
    expect(repairs).toEqual([])
  })

  it('should run validation on products that somehow don\'t have their requirements in the part list', () => {
    const mockInvalidProduct = {
      id: 'IronIngot',
      recipe: 'IngotIron',
      amount: 2,
      displayOrder: 1,
      requirements: {
        MadeUpPart: { amount: 1 },
      },
      buildingRequirements: {} as any,
      buildingGroups: [],
      buildingGroupsTrayOpen: false,
      buildingGroupsHaveProblem: false,
      buildingGroupItemSync: true,
    } as FactoryItem
    mockFactory.products = [mockInvalidProduct]

    const repairs = validateFactories([mockFactory], gameData)

    expect(mockFactory.parts.MadeUpPart).toBeDefined()
    expect(repairs).toHaveLength(1)
    expect(repairs[0].summary).toContain('MadeUpPart')
  })

  it('should detect invalid inputs and set them to 1', () => {
    // Set up a valid factory
    const validFactory: Factory = newFactory('Some Factory')
    addProductToFactory(validFactory, {
      id: 'IronIngot',
      amount: 100,
      recipe: 'IngotIron',
    })
    addInputToFactory(mockFactory, {
      factoryId: validFactory.id,
      outputPart: 'IronIngot',
      amount: 0,
    })

    const repairs = validateFactories([mockFactory, validFactory], gameData)

    expect(mockFactory.inputs[0].amount).toBe(1)
    expect(repairs.some(entry => entry.summary.includes('set to 1/min'))).toBe(true)
  })

  // A share link is another player's JSON, so the disposal map arrives without ever having gone
  // through the setters that sanitise it.
  describe('partDisposal repair', () => {
    const withParts = (disposal: unknown): Factory => {
      const factory = newFactory('Storage')
      addProductToFactory(factory, { id: 'IronIngot', amount: 100, recipe: 'IngotIron' })
      factory.parts.IronIngot = { amountRequired: 0, amountSupplied: 100 } as never
      factory.partDisposal = disposal as never
      return factory
    }

    it('drops a null record rather than letting the power total throw on it', () => {
      const factory = withParts({ IronIngot: null })

      const repairs = validateFactories([factory], gameData)

      expect(factory.partDisposal).toEqual({})
      expect(repairs.some(entry => entry.summary.includes('whole numbers'))).toBe(true)
    })

    it('floors a negative count so it cannot subtract from the grid', () => {
      const factory = withParts({ IronIngot: { sinks: -4, depots: 2 } })

      validateFactories([factory], gameData)

      expect(factory.partDisposal).toEqual({ IronIngot: { sinks: 0, depots: 2 } })
    })

    it('coerces a string count rather than concatenating it into the total', () => {
      const factory = withParts({ IronIngot: { sinks: '3', depots: 0 } })

      validateFactories([factory], gameData)

      expect(factory.partDisposal).toEqual({ IronIngot: { sinks: 3, depots: 0 } })
    })

    it('clears settings that are not an object at all', () => {
      const factory = withParts('nonsense')

      const repairs = validateFactories([factory], gameData)

      expect(factory.partDisposal).toBeUndefined()
      expect(repairs.some(entry => entry.summary.includes('unreadable'))).toBe(true)
    })

    it('leaves a count for a part the factory no longer makes, because the map is sticky', () => {
      const factory = withParts({ CopperIngot: { sinks: 2, depots: 0 } })

      const repairs = validateFactories([factory], gameData)

      expect(factory.partDisposal).toEqual({ CopperIngot: { sinks: 2, depots: 0 } })
      expect(repairs).toEqual([])
    })

    it('leaves a valid map untouched', () => {
      const factory = withParts({ IronIngot: { sinks: 1, depots: 2 } })

      expect(validateFactories([factory], gameData)).toEqual([])
      expect(factory.partDisposal).toEqual({ IronIngot: { sinks: 1, depots: 2 } })
    })
  })

  it('should report nothing for a clean plan', () => {
    const supplier: Factory = newFactory('Some Factory')
    addProductToFactory(supplier, { id: 'IronIngot', amount: 100, recipe: 'IngotIron' })
    addInputToFactory(mockFactory, {
      factoryId: supplier.id,
      outputPart: 'IronIngot',
      amount: 50,
    })
    supplier.dependencies.requests[mockFactory.id] = [{
      requestingFactoryId: mockFactory.id,
      part: 'IronIngot',
      amount: 50,
    }]

    expect(validateFactories([mockFactory, supplier], gameData)).toEqual([])
  })
})
