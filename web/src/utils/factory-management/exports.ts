import {
  Factory,
  FactoryDependencyRequest,
} from '@/interfaces/planner/FactoryInterface'

export const getRequestsForFactory = (factory: Factory): FactoryDependencyRequest[] => {
  // Return an object containing the requests of all factories requesting a particular part
  // We need to get all requests set upon by other factories and check their part names
  // If the part name matches the one we're looking for, we add it to the list.
  const factoryRequests = factory.dependencies.requests

  if (!factoryRequests || Object.keys(factoryRequests).length === 0) {
    return []
  }

  // Return all requests
  return Object.entries(factoryRequests)
    .map(([, requests]) => {
      return requests
    })
    .flat()
}

export const getRequestsForFactoryByProduct = (
  factory: Factory,
  part: string
): FactoryDependencyRequest[] => {
  // Return an object containing the requests of all factories requesting a particular part
  // We need to get all requests set upon by other factories and check their part names
  // If the part name matches the one we're looking for, we add it to the list.
  const factoryRequests = factory.dependencies.requests

  if (!factoryRequests || Object.keys(factoryRequests).length === 0) {
    return []
  }

  // Return all requests for a particular part
  return Object.entries(factoryRequests)
    .map(([, requests]) => {
      return requests.filter(request => request.part === part)
    })
    .flat()
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
