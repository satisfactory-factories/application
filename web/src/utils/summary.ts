import { FactoryDependencyRequest, FactoryInput } from '@/interfaces/planner/FactoryInterface'

// This function finds out which items are being imported into the factory and their quantity
export const calculateTotalDependencies = (inputs: FactoryInput[]) => {
  const totals: Record<string, number> = {}

  inputs.forEach(input => {
    const { outputPart, amount } = input
    if (outputPart) {
      if (!totals[outputPart]) {
        totals[outputPart] = 0
      }
      totals[outputPart] += amount
    }
  })

  return Object.entries(totals)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({ outputPart: key, totalAmount: value }))
}

// This function finds out which items are being exported from the factory and their quantity
export const calculateTotalDependencyRequests = (
  requests: Record<string, FactoryDependencyRequest[]>
) => {
  const totals: Record<string, number> = {}

  Object.values(requests).forEach(dependencyRequests => {
    dependencyRequests.forEach(request => {
      const { part, amount } = request

      if (part) {
        if (!totals[part]) {
          totals[part] = 0
        }
        totals[part] += amount
      }
    })
  })

  return Object.entries(totals)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({ part: key, totalAmount: value }))
}
