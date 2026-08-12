// Check for invalid factory data e.g. inputs without factories etc
import { calculateFactory, findFac, generateFactoryId } from '@/utils/factory-management/factory'
import { Factory, FactoryInput } from '@/interfaces/planner/FactoryInterface'
import { DataInterface } from '@/interfaces/DataInterface'
import { createNewPart, getPartDisplayNameWithoutDataStore, rawArray } from '@/utils/factory-management/common'
import { StructuralRepair } from '@/utils/factory-management/repair'
import { repairFactoryGroups } from '@/utils/factory-management/factory-groups'

const repair = (factory: Factory, summary: string): StructuralRepair => {
  // Kept alongside the dialog: the console line carries the IDs, which are noise to the
  // user but the first thing anyone debugging a shared plan asks for.
  console.error(`VALIDATION ERROR: "${factory.name}" (${factory.id}): ${summary}`)
  return { kind: 'structural', factoryName: factory.name, summary }
}

// Two factories sharing an ID make every dependency between them ambiguous: requests are
// keyed by ID, so one factory's exports get attributed to (and deleted with) the other.
// Plans built before IDs were issued uniquely can carry collisions, so break them on load.
// The first factory keeps the ID; anything still pointing at the reassigned one is left for
// the chain reconciliation and the recalculation that follows.
export const repairDuplicateFactoryIds = (factories: Factory[]): StructuralRepair[] => {
  const repairs: StructuralRepair[] = []
  const seen = new Set<number>()

  factories.forEach(factory => {
    if (factory.id && !seen.has(factory.id)) {
      seen.add(factory.id)
      return
    }

    factory.id = generateFactoryId(factories)
    seen.add(factory.id)
    repairs.push(repair(factory, `Shared an internal ID with another factory, which mixes up their imports and exports. It has been given an ID of its own; check its imports still point where you expect.`))
  })

  return repairs
}

// The UI blocks importing the same part from the same factory twice, but plans saved before
// it did (and hand-edited share links) can hold duplicates. Only one request is ever raised
// for a provider + part pair, so the rows have to be merged or the export understates demand.
export const mergeDuplicateInputs = (factories: Factory[], gameData: DataInterface): StructuralRepair[] => {
  const repairs: StructuralRepair[] = []
  const nameFor = (id: number) => factories.find(factory => factory.id === id)?.name ?? `factory ${id}`
  const partName = (part: string) => getPartDisplayNameWithoutDataStore(part, gameData)

  factories.forEach(factory => {
    const seen = new Map<string, FactoryInput>()
    const kept: FactoryInput[] = []

    factory.inputs.forEach(input => {
      // A row the user never finished isn't a duplicate of anything.
      if (!input.factoryId || !input.outputPart) {
        kept.push(input)
        return
      }

      const key = `${input.factoryId}-${input.outputPart}`
      const existing = seen.get(key)

      if (existing) {
        existing.amount += input.amount
        repairs.push(repair(factory, `Imported ${partName(input.outputPart)} from ${nameFor(input.factoryId)} on more than one row, which understated what that factory had to make. The rows have been merged into one asking for ${existing.amount}/min.`))
        return
      }

      seen.set(key, input)
      kept.push(input)
    })

    if (kept.length !== factory.inputs.length) {
      factory.inputs = rawArray(kept)
    }
  })

  return repairs
}

// A provider's dependency requests are derived from its consumers' inputs, so the two must
// agree exactly. A plan whose figures look current is loaded without being recalculated,
// which means drift saved by an older build would otherwise never be flushed — hence
// repairing it here rather than leaving it to the recalculation.
export const repairDependencyChain = (factories: Factory[], gameData: DataInterface): StructuralRepair[] => {
  const repairs: StructuralRepair[] = []
  const byId = new Map(factories.map(factory => [factory.id, factory]))
  const partName = (part: string) => getPartDisplayNameWithoutDataStore(part, gameData)

  factories.forEach(provider => {
    if (!provider.dependencies?.requests) {
      provider.dependencies = { requests: {}, metrics: {} }
      return
    }

    Object.keys(provider.dependencies.requests).forEach(requesterId => {
      const requests = provider.dependencies.requests[requesterId]
      const requester = byId.get(Number(requesterId))

      if (!requester) {
        delete provider.dependencies.requests[requesterId]
        repairs.push(repair(provider, `Was exporting to a factory the plan can no longer identify. The export has been removed.`))
        return
      }

      const kept = requests.filter(request => {
        const inputs = requester.inputs.filter(
          input => input.factoryId === provider.id && input.outputPart === request.part
        )

        if (inputs.length === 0) {
          repairs.push(repair(provider, `Was exporting ${partName(request.part)} to "${requester.name}", which is not importing it. The export has been removed.`))
          return false
        }

        const expected = inputs.reduce((total, input) => total + input.amount, 0)
        if (request.amount !== expected) {
          repairs.push(repair(provider, `Was set to export ${request.amount}/min of ${partName(request.part)} to "${requester.name}" while that factory asks for ${expected}/min. The export has been corrected.`))
          request.amount = expected
        }

        request.requestingFactoryId = requester.id
        return true
      })

      // An empty array still renders as an export against the requesting factory's name.
      if (kept.length === 0) {
        delete provider.dependencies.requests[requesterId]
      } else if (kept.length !== requests.length) {
        provider.dependencies.requests[requesterId] = rawArray(kept)
      }
    })
  })

  // A factory with no exports recorded and no part ledger has never been calculated. Its
  // links are not missing, they have simply not been built yet — a template, or a plan
  // assembled in code, arrives in exactly that state and there is nothing to report.
  const isWired = (factory: Factory): boolean =>
    Object.keys(factory.dependencies?.requests ?? {}).length > 0 ||
    Object.keys(factory.parts ?? {}).length > 0

  // The other direction: an import the provider has no record of. The recalculation rebuilds
  // the request from the input, so this only needs reporting — but silently is not an option,
  // since until it runs the supplying factory is not making anything for it.
  factories.forEach(requester => {
    requester.inputs.forEach(input => {
      if (!input.factoryId || !input.outputPart) {
        return
      }

      const provider = byId.get(input.factoryId)
      if (!provider || !isWired(provider)) {
        return
      }

      const hasRequest = provider.dependencies?.requests?.[requester.id]
        ?.some(request => request.part === input.outputPart)

      if (!hasRequest) {
        repairs.push(repair(requester, `Imports ${partName(input.outputPart)} from "${provider.name}", which had no record of supplying it. The export has been restored.`))
      }
    })
  })

  return repairs
}

// Repairs everything wrong with a loaded plan that can be put right automatically, and
// returns what it corrected so the user can be told. An empty list means the plan was clean.
export const validateFactories = (factories: Factory[], gameData: DataInterface): StructuralRepair[] => {
  const partName = (part: string) => getPartDisplayNameWithoutDataStore(part, gameData)

  // Both run before anything reads a factory by ID or pairs an input with a request.
  const repairs: StructuralRepair[] = [
    ...repairDuplicateFactoryIds(factories),
    ...mergeDuplicateInputs(factories, gameData),
  ]

  factories.forEach(factory => {
    // Filtered rather than spliced mid-loop: splicing by the first matching factoryId
    // removes whichever input happens to match first and skips the next one along.
    factory.inputs = rawArray(factory.inputs.filter(input => {
      if (input.amount <= 0) {
        repairs.push(repair(factory, `Had an import of ${input.outputPart ? partName(input.outputPart) : 'an item'} set to ${input.amount}/min, which cannot be planned against. It has been set to 1/min.`))
        input.amount = 1
      }

      // A row the user was still filling in when the plan was saved. Harmless, and the
      // Imports UI needs it to keep showing the half-made selection.
      if (!input.factoryId) {
        return true
      }

      const inputFac = findFac(input.factoryId, factories)
      if (!inputFac?.id) {
        repairs.push(repair(factory, `Imported ${input.outputPart ? partName(input.outputPart) : 'an item'} from a factory the plan can no longer identify. The import has been removed — add it again if you still need it.`))
        return false
      }

      if (inputFac.id === factory.id) {
        repairs.push(repair(factory, `Was importing ${input.outputPart ? partName(input.outputPart) : 'an item'} from itself, which is not possible. The import has been removed.`))
        return false
      }

      return true
    }))

    // Check for invalid products and remove them from factories
    // For instance if somehow a product has an amount of 0, which should not be possible, remove the product and recalculate.
    factory.products.forEach((product, productIndex) => {
      let needsRecalc = false
      if (product === null) {
        repairs.push(repair(factory, `Had an empty product entry, which has been removed.`))
        factory.products.splice(productIndex, 1)
        needsRecalc = true
      }

      if (product && product.amount <= 0) {
        repairs.push(repair(factory, `Was making ${partName(product.id)} at ${product.amount}/min, which cannot be planned against. It has been set to 0.1/min.`))
        product.amount = 0.1
        needsRecalc = true
      }

      // Ensure all the product requirements have parts in the factory
      if (product?.requirements) {
        Object.keys(product.requirements).forEach(part => {
          if (!factory.parts[part]) {
            repairs.push(repair(factory, `Was missing the satisfaction entry for ${partName(part)}, an ingredient of ${partName(product.id)}. It has been added back.`))
            createNewPart(factory, part)
          }
        })
      }

      if (needsRecalc) {
        console.warn(`validation: Recalculating Factory "${factory.name}" (${factory.id}) due to product validation errors.`)
        // Recalculate right now
        calculateFactory(factory, factories, gameData)
      }
    })
  })

  // Last, once every factory has a unique ID and its inputs are sane, so the chain is being
  // reconciled against data that can be trusted.
  repairs.push(...repairDependencyChain(factories, gameData))

  // Converges disagreeing copies of a group record and re-establishes the group ordering
  // invariant. Silent by design: a group that has drifted is cosmetic, and nothing here can
  // lose a factory, so it does not deserve a line in the plan-repair dialog.
  repairFactoryGroups(factories)

  return repairs
}
