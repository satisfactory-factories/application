// Redistribution hubs (#46). Any factory can pass on what it imports: a part it imports is
// exportable from it as if it had produced it, so a logistics hub can collect a part from a producer
// and hand it on to consumers without making anything itself. What it can spare is what is left after
// its own use, so an over-import shows up as stock to pass on rather than a Trim warning.
//
// There used to be a per-row "redistribute" switch. Players were already doing this without one,
// and the import dialog filters well enough that the switch was only in the way.
//
// A leaf module (types only), so parts.ts, dependencies.ts and inputs-analysis.ts can all use it
// without closing an import cycle through factory.ts.
import { Factory, FactoryInput } from '@/interfaces/planner/FactoryInterface'

const findById = (id: number | null, factories: Factory[]): Factory | undefined =>
  id === null ? undefined : factories.find(fac => fac.id === id)

export const getPartInputs = (factory: Factory, part: string): FactoryInput[] =>
  factory.inputs.filter(input => input.outputPart === part && input.factoryId)

export const isPartImported = (factory: Factory, part: string): boolean =>
  getPartInputs(factory, part).length > 0

// Passing on an import it does not make itself: what reads as a hub for this part.
export const isPartRedistributed = (factory: Factory, part: string): boolean =>
  isPartImported(factory, part) &&
  !(factory.parts[part]?.amountSuppliedViaProduction > 0) &&
  Object.values(factory.dependencies?.requests ?? {}).some(requests =>
    requests.some(request => request.part === part)
  )

/**
 * Every factory a factory's imported stock of `part` ultimately comes from, following hub-to-hub
 * links. The visited set means a cycle that already exists in saved data ends the walk rather than
 * hanging it.
 */
export const getUpstreamFactoryIds = (
  hub: Factory,
  part: string,
  factories: Factory[],
  visited: Set<number> = new Set()
): Set<number> => {
  getPartInputs(hub, part).forEach(input => {
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
  const names = getPartInputs(hub, part)
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
        via: passesOn(provider, part)
          ? getRedistributionSourceNames(provider, part, factories)
          : [],
        alreadyImported: factory.inputs.some(input =>
          input.factoryId === provider.id && input.outputPart === part
        ),
      }
    })
    // A factory that only passes the part on is offered when it has some to spare, or this factory
    // already takes from it. Otherwise every factory that imports iron plates would be listed as a
    // source of them, most with nothing left over.
    .filter(source => !passesOn(source.factory, part) || source.spare > 0 || source.alreadyImported)
    .sort((a, b) => b.spare - a.spare || a.factory.name.localeCompare(b.factory.name))
}

// Its stock of this part is imported rather than made.
const passesOn = (provider: Factory, part: string): boolean =>
  isPartImported(provider, part) && !(provider.parts[part]?.amountSuppliedViaProduction > 0)

// What this factory actually consumes or has promised away. A part's amountRequired also carries
// what an AWESOME Sink takes, and a sink takes whatever is left, so counting it made every sunk
// import read as a need.
const isPartNeeded = (factory: Factory, part: string): boolean => {
  const partData = factory.parts[part]
  if (!partData) return false
  return partData.amountRequired - (partData.amountRequiredSink ?? 0) > 0
}

/**
 * The parts the import dialog offers. With `anySurplus` off, only what this factory actually needs;
 * on, any part another factory has spare, which is how a hub picks up stock it does not consume.
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
      if (!anySurplus && !isPartNeeded(factory, part)) return
      if (wouldCreateLoop(factory.id, provider, part, factories)) return
      if (passesOn(provider, part) && !(provider.parts[part].amountRemaining > 0)) return
      parts.add(part)
    })
  })

  return Array.from(parts)
}
