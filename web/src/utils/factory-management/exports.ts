import {
  Factory,
  FactoryDependencyRequest,
} from '@/interfaces/planner/FactoryInterface'

export const getRequestsForFactory = (factory: Factory): FactoryDependencyRequest[] => {
  // Return an object containing the requests of all factories, regardless of part.
  const factoryRequests = factory.dependencies.requests

  if (!factoryRequests || Object.keys(factoryRequests).length === 0) {
    return []
  }

  return Object.entries(factoryRequests)
    .map(([, requests]) => {
      return requests
    })
    .flat()
}

export const getRequestsForFactoryByPart = (
  factory: Factory,
  part: string
): FactoryDependencyRequest[] => {
  const requests = getRequestsForFactory(factory)
  // Filter by the part
  return requests.filter(request => request.part === part)
}

export const getExportableFactories = (factories: Factory[]): Factory[] => {
  const exportableFacs: Factory[] = []
  // Loop through all the factory parts and if one is exportable, we add it to the list.

  factories.forEach(factory => {
    Object.values(factory.parts).forEach(part => {
      if (part.exportable) {
        exportableFacs.push(factory)
      }
    })
  })

  return exportableFacs
}
