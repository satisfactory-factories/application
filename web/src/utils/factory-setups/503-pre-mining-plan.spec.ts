import { beforeEach, describe, expect, it } from 'vitest'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, findFacByName } from '@/utils/factory-management/factory'
import { gameData } from '@/utils/gameData'
import { collectRawWizardRows } from '@/utils/factory-management/raw-wizard'
import { resolveFactoryIcon } from '@/utils/factory-icons'
import { create503PreMiningPlan } from '@/utils/factory-setups/503-pre-mining-plan'

describe('#503 pre-mining plan', () => {
  let factories: Factory[]

  beforeEach(() => {
    factories = create503PreMiningPlan().getFactories()
    calculateFactories(factories, gameData)
  })

  it('should give every factory an icon the registry knows', () => {
    factories.forEach(factory => {
      expect(resolveFactoryIcon(factory.icon).kind, `${factory.name}: ${factory.icon}`).not.toBe('default')
    })
  })

  it('should number displayOrder as the index into the array', () => {
    factories.forEach((factory, index) => {
      expect(factory.displayOrder, factory.name).toBe(index)
    })
  })

  // The whole point of the plan: nothing in it digs anything up.
  it('should extract nothing', () => {
    factories.forEach(factory => {
      factory.products.forEach(product => {
        expect(factory.parts[product.id]?.isRaw, `${factory.name}: ${product.id}`).toBe(false)
      })
    })
  })

  it('should be short of a spread of raw resources', () => {
    const rows = collectRawWizardRows(factories)
    const parts = [...new Set(rows.map(row => row.partId))].sort()

    expect(parts).toEqual(['Coal', 'LiquidOil', 'OreBauxite', 'OreCopper', 'OreIron', 'Stone', 'Water'])
  })

  // Two factories short of the same ore is what gives the wizard's one-mine-per-resource
  // behaviour something to demonstrate.
  it('should be short of iron in two separate factories', () => {
    const ironRows = collectRawWizardRows(factories).filter(row => row.partId === 'OreIron')

    expect(ironRows).toHaveLength(2)
    expect(ironRows.map(row => row.factoryName).sort()).toEqual(['Iron Ingots', 'Steel Works'])
  })

  it('should default water to on-site extraction and ore to a shared mine', () => {
    const rows = collectRawWizardRows(factories)

    expect(rows.find(row => row.partId === 'Water')?.choice).toBe('onsite')
    expect(rows.find(row => row.partId === 'OreBauxite')?.choice).toBe('mine')
  })

  it('should keep its one dependency link intact', () => {
    const plates = findFacByName('Iron Plates', factories)

    expect(plates.inputs).toHaveLength(1)
    expect(plates.inputs[0].outputPart).toBe('IronIngot')
  })
})
