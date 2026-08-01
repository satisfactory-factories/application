import { Factory } from '@/interfaces/planner/FactoryInterface'
import { hasFactoryProblem } from '@/utils/factory-management/status'

// One detection path: the status registry decides what a problem is, this just rolls it up into
// the persisted flag. hasFactoryProblem short-circuits and skips the warning tier entirely, which
// matters because this runs O(n²) times per full recalculation.
export const calculateHasProblem = (factory: Factory) => {
  factory.hasProblem = hasFactoryProblem(factory)
}
