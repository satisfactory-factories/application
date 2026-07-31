import { expect } from 'vitest'
import { Factory } from '../src/interfaces/planner/FactoryInterface'
import { findDependencyChainViolations } from '../src/utils/factory-management/dependency-integrity'

// Re-exported so specs assert against exactly the invariants the app checks at load time.
export const findIntegrityViolations = findDependencyChainViolations

export const expectIntegrity = (factories: Factory[]) => {
  expect(findDependencyChainViolations(factories)).toEqual([])
}
