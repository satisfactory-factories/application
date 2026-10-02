// Redistribution hubs (#46). A factory can flag an import row as "redistribute", which makes the
// imported quantity exportable from that factory as if it had produced it. That lets a logistics
// hub collect a part from a producer and pass it on to consumers without making anything itself.
//
// Only a flagged row counts. An ordinary factory that over-imports keeps its surplus to itself, as
// it always has: otherwise every Trim warning in a plan would turn into an export candidate.
//
// A leaf module (types only), so parts.ts, dependencies.ts and inputs-analysis.ts can all use it
// without closing an import cycle through factory.ts.
import { Factory, FactoryInput } from '@/interfaces/planner/FactoryInterface'

const findById = (id: number | null, factories: Factory[]): Factory | undefined =>
  id === null ? undefined : factories.find(fac => fac.id === id)

export const getRedistributedInputs = (factory: Factory, part: string): FactoryInput[] =>
  factory.inputs.filter(input => input.redistribute && input.outputPart === part && input.factoryId)

export const isPartRedistributed = (factory: Factory, part: string): boolean =>
  getRedistributedInputs(factory, part).length > 0

export const redistributedAmount = (factory: Factory, part: string): number =>
  getRedistributedInputs(factory, part).reduce((acc, input) => acc + (input.amount ?? 0), 0)

export const hasAnyRedistribution = (factory: Factory): boolean =>
  factory.inputs.some(input => input.redistribute && input.outputPart && input.factoryId)

/**
 * Every factory a hub's stock of `part` ultimately comes from, following hub-to-hub links.
 *
 * Only redistributed rows are followed: those are the only ones that pass the part on. The visited
 * set means a cycle that already exists in saved data ends the walk rather than hanging it.
 */
export const getUpstreamFactoryIds = (
  hub: Factory,
  part: string,
  factories: Factory[],
  visited: Set<number> = new Set()
): Set<number> => {
  getRedistributedInputs(hub, part).forEach(input => {
    const sourceId = input.factoryId as number
    if (visited.has(sourceId)) return
    visited.add(sourceId)

    const source = findById(sourceId, factories)
    if (source) {
      getUpstreamFactoryIds(source, part, factories, visited)
    }
  })

  return visited
}

/**
 * The names a hub's stock of `part` comes from, for "Hub (via Iron Factory)". The direct sources
 * only: a hub fed by another hub reads "via Hub B", and Hub B's own entry names its producers.
 */
export const getRedistributionSourceNames = (hub: Factory, part: string, factories: Factory[]): string[] => {
  const names = getRedistributedInputs(hub, part)
    .map(input => findById(input.factoryId, factories)?.name)
    .filter((name): name is string => !!name)

  return Array.from(new Set(names))
}

/**
 * Would `consumer` importing `part` from `provider` close a loop? It does when the consumer is
 * one of the places the provider's stock comes from: the part would chase its own tail.
 */
export const wouldCreateLoop = (
  consumerId: number,
  provider: Factory,
  part: string,
  factories: Factory[]
): boolean => {
  if (consumerId === provider.id) return true
  return getUpstreamFactoryIds(provider, part, factories).has(consumerId)
}

/**
 * Can this import row be flagged to redistribute? Not when the factory it imports from is itself
 * fed by this factory's redistribution of the same part, because flagging it would close a loop.
 */
export const canRedistributeInput = (factory: Factory, input: FactoryInput, factories: Factory[]): boolean => {
  if (!input.factoryId || !input.outputPart) return false
  if (input.redistribute) return true // Always allow turning it off.

  const provider = findById(input.factoryId, factories)
  if (!provider) return false

  return !wouldCreateLoop(factory.id, provider, input.outputPart, factories)
}

export interface ImportSource {
  factory: Factory
  // What the provider has left after its own use and every promise it has already made.
  spare: number
  // Set when the provider is a hub: the factories its stock of this part comes from.
  via: string[]
  // This factory already imports this part from the provider on another row.
  alreadyImported: boolean
}

/**
 * Every factory this one could import `part` from, for the import dialog. A hub is listed like any
 * other provider, with where its stock comes from. Factories that would close a loop are left out.
 */
export const getImportSources = (
  factory: Factory,
  part: string,
  factories: Factory[]
): ImportSource[] => {
  return factories
    .filter(provider =>
      provider.id !== factory.id &&
      provider.parts[part]?.exportable &&
      !wouldCreateLoop(factory.id, provider, part, factories)
    )
    .map(provider => {
      const partData = provider.parts[part]
      // amountRemaining has this factory's own request taken off already; add it back so a row
      // being re-pointed does not count against itself.
      const ownRequest = (provider.dependencies?.requests?.[factory.id] ?? [])
        .filter(request => request.part === part)
        .reduce((acc, request) => acc + request.amount, 0)

      return {
        factory: provider,
        spare: Math.max(0, partData.amountRemaining + ownRequest),
        via: isPartRedistributed(provider, part)
          ? getRedistributionSourceNames(provider, part, factories)
          : [],
        alreadyImported: factory.inputs.some(input =>
          input.factoryId === provider.id && input.outputPart === part
        ),
      }
    })
    .sort((a, b) => b.spare - a.spare || a.factory.name.localeCompare(b.factory.name))
}

/**
 * The parts the import dialog offers. By default, only what this factory actually needs. With
 * `anySurplus` on, any part another factory has spare, which is how a hub picks up stock it does
 * not consume itself.
 */
export const getImportableParts = (
  factory: Factory,
  factories: Factory[],
  anySurplus: boolean
): string[] => {
  const parts = new Set<string>()

  factories.forEach(provider => {
    if (provider.id === factory.id) return
    Object.keys(provider.parts).forEach(part => {
      if (!provider.parts[part].exportable) return
      if (!anySurplus && !(factory.parts[part]?.amountRequired > 0)) return
      if (wouldCreateLoop(factory.id, provider, part, factories)) return
      parts.add(part)
    })
  })

  return Array.from(parts)
}
