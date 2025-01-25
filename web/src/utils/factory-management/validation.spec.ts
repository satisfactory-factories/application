import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Factory, FactoryItem } from '@/interfaces/planner/FactoryInterface'
import { newFactory } from '@/utils/factory-management/factory'
import { validateFactories } from '@/utils/factory-management/validation'
import { addInputToFactory } from '@/utils/factory-management/inputs'
import { gameData } from '@/utils/gameData'

describe('validation', () => {
  const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {})
  let mockFactory: Factory
  beforeEach(() => {
    mockFactory = newFactory('Iron Ingots')
  })

  it('should successfully detect and delete an invalid factory input', () => {
    addInputToFactory(mockFactory, {
      factoryId: 123456,
      outputPart: 'IronOre',
      amount: 123,
    })

    validateFactories([mockFactory], gameData)
    expect(mockFactory.inputs.length).toBe(0)
    expect(alertMock).toHaveBeenCalled()
  })

  it('should successfully detect and delete an invalid dependency', () => {
    mockFactory.dependencies.requests[2346] = [{
      requestingFactoryId: 123456,
      amount: 123,
      part: 'Foo',
    }]

    validateFactories([mockFactory], gameData)
    expect(mockFactory.dependencies.requests).toEqual({})
    expect(alertMock).toHaveBeenCalled()
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
    expect(alertMock).toHaveBeenCalled()
  })

  it('should not inadvertently delete valid dependencies', () => {
    const validFactory: Factory = newFactory('Some Factory')

    mockFactory.dependencies.requests[validFactory.id] = []
    mockFactory.dependencies.requests[validFactory.id].push({
      requestingFactoryId: validFactory.id,
      part: 'IronOre',
      amount: 123,
    })
    mockFactory.dependencies.requests[12345] = []
    mockFactory.dependencies.requests[12345].push({
      requestingFactoryId: 12345,
      part: 'IronOre',
      amount: 123,
    })

    validateFactories([mockFactory, validFactory], gameData)

    expect(mockFactory.dependencies.requests[validFactory.id]).toBeDefined()
    expect(mockFactory.dependencies.requests[123456]).toBeUndefined()
    expect(alertMock).toHaveBeenCalled()
  })

  it('should run validation on products when they contain a null array', () => {
    // @ts-ignore
    mockFactory.products = [null]

    validateFactories([mockFactory], gameData)

    expect(mockFactory.products).toEqual([])
    expect(alertMock).toHaveBeenCalled()
  })

  it('should run validation on products when they contain a <1 amount', () => {
    const mockInvalidProduct = {
      id: 'IronIngot',
      amount: 0,
      recipe: 'IngotIron',
    } as FactoryItem
    mockFactory.products = [mockInvalidProduct]

    validateFactories([mockFactory], gameData)

    expect(mockFactory.products[0].amount).toBe(0.1)
    expect(alertMock).toHaveBeenCalled()
  })

  it('should NOT run validation on products when they contain a >1 amount', () => {
    const mockInvalidProduct = {
      id: 'IronIngot',
      amount: 2,
      recipe: 'IngotIron',
    } as FactoryItem
    mockFactory.products = [mockInvalidProduct]

    validateFactories([mockFactory], gameData)

    expect(mockFactory.products[0].amount).toBe(2)
    expect(alertMock).toHaveBeenCalled()
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
    } as FactoryItem
    mockFactory.products = [mockInvalidProduct]

    validateFactories([mockFactory], gameData)

    expect(mockFactory.parts.MadeUpPart).toBeDefined()
    expect(alertMock).toHaveBeenCalled()
  })
})
