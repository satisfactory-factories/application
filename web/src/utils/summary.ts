import { FactoryDependencyRequest, FactoryInput } from '@/interfaces/planner/FactoryInterface'

export interface PartFlowSummary {
  part: string;
  totalAmount: number;
  // Source factories for imports, destination factories for exports
  factories: { factoryId: number; amount: number }[];
}

const toSortedSummaries = (
  totals: Record<string, { totalAmount: number; factories: Record<number, number> }>
): PartFlowSummary[] => {
  return Object.entries(totals)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([part, data]) => ({
      part,
      totalAmount: data.totalAmount,
      factories: Object.entries(data.factories)
        .map(([factoryId, amount]) => ({ factoryId: Number(factoryId), amount }))
        .sort((a, b) => b.amount - a.amount),
    }))
}

// Sums up the parts imported into a factory, retaining which factory each part comes from
export const calculateImports = (inputs: FactoryInput[]): PartFlowSummary[] => {
  const totals: Record<string, { totalAmount: number; factories: Record<number, number> }> = {}

  inputs.forEach(input => {
    const { outputPart, factoryId, amount } = input
    if (!outputPart || factoryId === null) return

    totals[outputPart] ??= { totalAmount: 0, factories: {} }
    totals[outputPart].totalAmount += amount
    totals[outputPart].factories[factoryId] = (totals[outputPart].factories[factoryId] ?? 0) + amount
  })

  return toSortedSummaries(totals)
}

// Sums up the parts exported from a factory, retaining which factory each part goes to
export const calculateExports = (
  requests: Record<string, FactoryDependencyRequest[]>
): PartFlowSummary[] => {
  const totals: Record<string, { totalAmount: number; factories: Record<number, number> }> = {}

  Object.values(requests).forEach(dependencyRequests => {
    dependencyRequests.forEach(request => {
      const { part, requestingFactoryId, amount } = request
      if (!part) return

      totals[part] ??= { totalAmount: 0, factories: {} }
      totals[part].totalAmount += amount
      totals[part].factories[requestingFactoryId] = (totals[part].factories[requestingFactoryId] ?? 0) + amount
    })
  })

  return toSortedSummaries(totals)
}
