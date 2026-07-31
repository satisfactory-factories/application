import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { useAppStore } from '@/stores/app-store'
import { findDependencyChainViolations } from '@/utils/factory-management/dependency-integrity'
import { create499BrokenChainPlan } from '@/utils/factory-setups/499-broken-chain-plan'
import { complexDemoPlan } from '@/utils/factory-setups/complex-demo-plan'
import { StructuralRepair } from '@/utils/factory-management/repair'

// Loading a deliberately corrupt plan: everything the loader can put right must be put
// right, and the user must be told about all of it in one go.
describe('plan repairs on load', () => {
  let appStore: ReturnType<typeof useAppStore>
  let factories: Factory[]
  let repairs: StructuralRepair[]

  const summaries = () => repairs.map(repair => `${repair.factoryName}: ${repair.summary}`)
  const reported = (factoryName: string, fragment: string) =>
    repairs.some(repair => repair.factoryName === factoryName && repair.summary.includes(fragment))

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    localStorage.removeItem('factoryTabs')
    localStorage.removeItem('preLoadFactories')
    setActivePinia(createPinia())
    appStore = useAppStore()

    factories = create499BrokenChainPlan()
    appStore.initFactories(factories)
    repairs = appStore.planRepairs.filter(
      (repair): repair is StructuralRepair => repair.kind === 'structural'
    )
  })

  it('leaves the plan consistent', () => {
    expect(findDependencyChainViolations(factories)).toEqual([])
  })

  it('tells the user something was corrected', () => {
    expect(repairs.length).toBeGreaterThan(0)
    expect(summaries().every(summary => summary.length > 0)).toBe(true)
  })

  describe('conflicting factory IDs', () => {
    it('gives the second factory an ID of its own', () => {
      const plates = factories.find(factory => factory.name === 'Iron Plates')!
      const rods = factories.find(factory => factory.name === 'Iron Rods')!

      expect(rods.id).not.toBe(plates.id)
      expect(new Set(factories.map(factory => factory.id)).size).toBe(factories.length)
    })

    it('reports it', () => {
      expect(reported('Iron Rods', 'Shared an internal ID')).toBe(true)
    })
  })

  describe('a copied factory carrying the original exports', () => {
    it('does not leave the copy claiming to supply anyone', () => {
      const clone = factories.find(factory => factory.name === 'Iron Ingots (copy)')!

      expect(clone.dependencies.requests).toEqual({})
    })

    it('reports it', () => {
      expect(reported('Iron Ingots (copy)', 'is not importing it')).toBe(true)
    })
  })

  describe('an export nobody imports', () => {
    it('removes it', () => {
      const copper = factories.find(factory => factory.name === 'Copper Ingots')!
      const plates = factories.find(factory => factory.name === 'Iron Plates')!

      expect(copper.dependencies.requests[plates.id]?.some(r => r.part === 'CopperIngot')).toBeFalsy()
    })

    it('reports it', () => {
      expect(reported('Copper Ingots', 'is not importing it')).toBe(true)
    })
  })

  describe('an export whose amount has drifted from the import', () => {
    it('corrects it to what the importer asks for', () => {
      const ingots = factories.find(factory => factory.name === 'Iron Ingots')!
      const plates = factories.find(factory => factory.name === 'Iron Plates')!
      const request = ingots.dependencies.requests[plates.id]
        .find(entry => entry.part === 'IronIngot')!

      // The two duplicate import rows (450 + 150) merge into one before the amount is checked.
      expect(request.amount).toBe(600)
      expect(plates.inputs.filter(input => input.outputPart === 'IronIngot')).toHaveLength(1)
    })

    it('reports it', () => {
      expect(reported('Iron Ingots', 'has been corrected')).toBe(true)
    })
  })

  describe('the same part imported twice from the same factory', () => {
    it('merges the rows', () => {
      const plates = factories.find(factory => factory.name === 'Iron Plates')!
      const fromIngots = plates.inputs.filter(input => input.outputPart === 'IronIngot')

      expect(fromIngots).toHaveLength(1)
      expect(fromIngots[0].amount).toBe(600)
    })

    it('reports it', () => {
      expect(reported('Iron Plates', 'on more than one row')).toBe(true)
    })
  })

  describe('an import the supplier has no record of', () => {
    it('restores the export', () => {
      const copper = factories.find(factory => factory.name === 'Copper Ingots')!
      const rods = factories.find(factory => factory.name === 'Iron Rods')!

      expect(copper.dependencies.requests[rods.id]).toEqual([{
        requestingFactoryId: rods.id,
        part: 'CopperIngot',
        amount: 60,
      }])
    })

    it('reports it', () => {
      expect(reported('Iron Rods', 'had no record of supplying it')).toBe(true)
    })
  })

  describe('an import from a factory that no longer exists', () => {
    it('removes it', () => {
      const plates = factories.find(factory => factory.name === 'Iron Plates')!

      expect(plates.inputs.some(input => input.factoryId === 8888)).toBe(false)
    })

    it('reports it', () => {
      expect(reported('Iron Plates', 'can no longer identify')).toBe(true)
    })
  })

  describe('a factory importing from itself', () => {
    it('removes it', () => {
      const copper = factories.find(factory => factory.name === 'Copper Ingots')!

      expect(copper.inputs.some(input => input.factoryId === copper.id)).toBe(false)
    })

    it('reports it', () => {
      expect(reported('Copper Ingots', 'importing Copper Ingot from itself')).toBe(true)
    })
  })

  it('drops an export entry left with no items in it', () => {
    const ingots = factories.find(factory => factory.name === 'Iron Ingots')!

    expect(ingots.dependencies.requests[9999]).toBeUndefined()
  })

  it('recalculates so the repaired figures reach the satisfaction table', () => {
    const ingots = factories.find(factory => factory.name === 'Iron Ingots')!

    // 600 to Iron Plates (the merged rows) + 300 to Iron Rods.
    expect(ingots.parts.IronIngot.amountRequiredExports).toBe(900)
    expect(ingots.dependencies.metrics.IronIngot.request).toBe(900)
  })
})

// A plan assembled in code arrives with its imports set but no exports and no part ledgers —
// they are built by the calculation that follows. Reporting that as damage put a dialog full
// of "the export has been restored" in front of anyone loading the demo plan or a template.
describe('plan repairs on a plan that has never been calculated', () => {
  it('reports nothing for the demo plan', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    localStorage.removeItem('factoryTabs')
    setActivePinia(createPinia())
    const appStore = useAppStore()

    appStore.initFactories(complexDemoPlan().getFactories())

    expect(appStore.planRepairs).toEqual([])
  })

  it('still reports a factory that does hold exports', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    localStorage.removeItem('factoryTabs')
    setActivePinia(createPinia())
    const appStore = useAppStore()

    // The broken-chain fixture is uncalculated too, but its refinery holds exports — so it
    // has been wired, and the one that went missing is a genuine fault.
    appStore.initFactories(create499BrokenChainPlan())

    expect(appStore.planRepairs.length).toBeGreaterThan(0)
  })
})

describe('plan repairs on a clean plan', () => {
  it('reports nothing and leaves the plan alone', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    localStorage.removeItem('factoryTabs')
    setActivePinia(createPinia())
    const appStore = useAppStore()

    // The same plan, built and calculated but never damaged.
    const factories = create499BrokenChainPlan()
    appStore.initFactories(factories)
    appStore.dismissPlanRepairs()

    // Loading the already-repaired plan a second time must find nothing left to do.
    appStore.initFactories(factories)

    expect(appStore.planRepairs).toEqual([])
  })
})
