import { Factory } from '@/interfaces/planner/FactoryInterface'
import { createMaelsBigBoiPlan } from '@/utils/factory-setups/maels-big-boi-plan'

// Builds a very large stress-test plan by replicating Mael's real-world MegaPlan
// `copies` times with remapped factory ids, so every copy keeps valid cross-factory
// imports/dependencies. 4 copies is 144 factories at the MegaPlan's current size, with
// hundreds of products, imports and power producers — used by perf specs and the browser
// stress harness. The count moves with the MegaPlan, which is the point: it is whatever
// four of the largest real plan we have comes to.
export const createStressPlan = (copies = 4): Factory[] => {
  const plan: Factory[] = []

  for (let copy = 0; copy < copies; copy++) {
    const offset = (copy + 1) * 1_000_000
    const factories = structuredClone(createMaelsBigBoiPlan().getFactories())

    factories.forEach(factory => {
      factory.id += offset
      if (copy > 0) {
        factory.name = `${factory.name} (copy ${copy + 1})`
      }
      factory.inputs.forEach(input => {
        if (input.factoryId !== null) input.factoryId += offset
      })
      factory.previousInputs.forEach(input => {
        if (input.factoryId !== null) input.factoryId += offset
      })

      const remappedRequests: Factory['dependencies']['requests'] = {}
      Object.keys(factory.dependencies.requests).forEach(requesterId => {
        const requests = factory.dependencies.requests[requesterId]
        requests.forEach(request => {
          request.requestingFactoryId += offset
        })
        remappedRequests[String(Number(requesterId) + offset)] = requests
      })
      factory.dependencies.requests = remappedRequests
    })

    plan.push(...factories)
  }

  // Give every factory a unique display order across the whole plan.
  plan.forEach((factory, index) => {
    factory.displayOrder = index
  })

  return plan
}
