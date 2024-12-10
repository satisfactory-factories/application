import { Factory } from '@/interfaces/planner/FactoryInterface'

export const calculateHasProblem = (factories: Factory[]) => {
  // Loop all factories to detect if they have problems
  factories.forEach(factory => {
    factory.hasProblem = false

    if (!factory.requirementsSatisfied) {
      factory.hasProblem = true
      return // Nothing else to do, if the requirements are unsatisfied the exports will be unsatisfied as well.
    }

    // Loop through all the dependency metrics of a factory and ensure all requests are satisfied.
    Object.keys(factory.dependencies.metrics).forEach(part => {
    // We need to have !hasProblem because we don't want to overwrite the hasProblem flag if it's already set.
      if (!factory.dependencies.metrics[part].isRequestSatisfied) {
        factory.hasProblem = true
      }
    })
  })
}
