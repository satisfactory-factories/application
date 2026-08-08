// The guarantee that #506 did not change which factories read as broken.
//
// The status registry replaced the hand-rolled calculateHasProblem, so this pins the new rollup
// against a verbatim copy of the old algorithm across real plans. The one intended divergence is
// power producers: the old version never looked at them, which is the bug #506 fixes.
import { describe, expect, it, vi } from 'vitest'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories } from '@/utils/factory-management/factory'
import { gameData } from '@/utils/gameData'
import { complexDemoPlan } from '@/utils/factory-setups/complex-demo-plan'
import { createMaelsBigBoiPlan } from '@/utils/factory-setups/maels-big-boi-plan'
import { hasFactoryProblem } from '@/utils/factory-management/status'
import { mockPowerProducer } from '@/utils/factory-management/status-fixtures'

vi.mock('@/utils/gameDataService', async () => {
  const { gameData } = await import('@/utils/gameData')
  return { fetchGameData: async () => gameData }
})

// problems.ts exactly as it stood before the status registry landed.
const legacyHasProblem = (factory: Factory): boolean => {
  if (!factory.requirementsSatisfied) {
    return true
  }

  let hasProblem = false

  Object.keys(factory.dependencies.metrics).forEach(part => {
    if (!factory.dependencies.metrics[part].isRequestSatisfied) {
      hasProblem = true
    }
  })

  factory.products.forEach(product => {
    if (product.buildingGroupsHaveProblem) {
      hasProblem = true
    }
  })

  return hasProblem
}

// `expectsProblems` keeps each case honest: two empty lists agreeing is not evidence of anything.
// Both plans now carry raw shortages — they draw ore they do not mine, and that stopped being
// assumed — so the work is done by comparing WHICH factories each rollup flags, name for name,
// rather than by one plan being clean.
const plans: [string, () => Factory[], boolean][] = [
  ['Mael\'s big boi plan', () => createMaelsBigBoiPlan().getFactories(), true],
  ['complex demo plan', () => complexDemoPlan().getFactories(), true],
]

describe('status regression vs the pre-#506 rollup', () => {
  it.each(plans)('flags exactly the same factories on %s', (_name, build, expectsProblems) => {
    const factories = build()
    calculateFactories(factories, gameData)

    // No power producer in these plans has broken groups, so the two must agree outright.
    expect(factories.some(factory => factory.powerProducers.some(p => p.buildingGroupsHaveProblem))).toBe(false)
    expect(factories.length).toBeGreaterThan(1)

    const legacy = factories.filter(legacyHasProblem).map(factory => factory.name).sort()
    const current = factories.filter(hasFactoryProblem).map(factory => factory.name).sort()

    expect(legacy.length > 0).toBe(expectsProblems)
    expect(current).toEqual(legacy)
    // And the persisted flag the engine wrote agrees with both.
    expect(factories.filter(factory => factory.hasProblem).map(factory => factory.name).sort()).toEqual(legacy)
  })

  it('diverges only where the old rollup ignored power producers', () => {
    const factories = createMaelsBigBoiPlan().getFactories()
    calculateFactories(factories, gameData)

    const clean = factories.find(factory => !factory.hasProblem && factory.powerProducers.length === 0)
    expect(clean).toBeDefined()

    // Give it a power producer whose building groups do not add up. The old rollup would still
    // call this factory healthy; the new one does not.
    clean!.powerProducers.push(mockPowerProducer('generatorcoal', { buildingGroupsHaveProblem: true }))

    expect(legacyHasProblem(clean!)).toBe(false)
    expect(hasFactoryProblem(clean!)).toBe(true)
  })
})
