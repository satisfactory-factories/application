// Check for invalid factory data e.g. inputs without factories etc
import { calculateFactory, findFac, generateFactoryId } from '@/utils/factory-management/factory'
import { Factory, FactoryInput } from '@/interfaces/planner/FactoryInterface'
import { DataInterface } from '@/interfaces/DataInterface'
import { createNewPart, rawArray } from '@/utils/factory-management/common'
import { findDependencyChainViolations } from '@/utils/factory-management/dependency-integrity'

// Two factories sharing an ID make every dependency between them ambiguous: requests are
// keyed by ID, so one factory's exports get attributed to (and deleted with) the other.
// Plans built before IDs were issued uniquely can carry collisions, so break them on load.
// The first factory keeps the ID; anything still pointing at the reassigned one is left for
// the chain reconciliation and the recalculation that follows.
export const repairDuplicateFactoryIds = (factories: Factory[]): string[] => {
  const repairs: string[] = []
  const seen = new Set<number>()

  factories.forEach(factory => {
    if (factory.id && !seen.has(factory.id)) {
      seen.add(factory.id)
      return
    }

    const oldId = factory.id
    factory.id = generateFactoryId(factories)
    seen.add(factory.id)
    repairs.push(`Factory "${factory.name}" shared the ID ${oldId} with another factory and has been reassigned ${factory.id}.`)
  })

  return repairs
}

// The UI blocks importing the same part from the same factory twice, but plans saved before
// it did (and hand-edited share links) can hold duplicates. Only one request is ever raised
// for a provider + part pair, so the rows have to be merged or the export understates demand.
export const mergeDuplicateInputs = (factories: Factory[]): string[] => {
  const repairs: string[] = []

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
        repairs.push(`Factory "${factory.name}" (${factory.id}) imported ${input.outputPart} from factory ${input.factoryId} more than once; the imports have been merged into ${existing.amount}/min.`)
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

// Returns true when the plan needs a full recalculation to become self-consistent again.
export const validateFactories = (factories: Factory[], gameData: DataInterface): boolean => {
  let hasErrors = false

  // Both run before anything reads a factory by ID or pairs an input with a request.
  const structuralRepairs = [
    ...repairDuplicateFactoryIds(factories),
    ...mergeDuplicateInputs(factories),
  ]
  structuralRepairs.forEach(repair => console.error(`VALIDATION ERROR: ${repair}`))
  hasErrors = hasErrors || structuralRepairs.length > 0

  factories.forEach(factory => {
    // Filtered rather than spliced mid-loop: splicing by the first matching factoryId
    // removes whichever input happens to match first and skips the next one along.
    factory.inputs = rawArray(factory.inputs.filter(input => {
      if (input.amount <= 0) {
        hasErrors = true
        console.error(`VALIDATION ERROR: Factory "${factory.name}" (${factory.id}) has an input with an amount of 0 or less. Setting to 1.`)

        input.amount = 1
      }

      // A row the user was still filling in when the plan was saved. Harmless, and the
      // Imports UI needs it to keep showing the half-made selection.
      if (!input.factoryId) {
        return true
      }

      const inputFac = findFac(input.factoryId, factories)
      if (!inputFac?.id) {
        hasErrors = true
        console.error(`VALIDATION ERROR: Factory "${factory.name}" (${factory.id}) has an input for ${input.factoryId} with part ${input.outputPart} where which the factory does not exist!`)
        return false
      }

      if (inputFac.id === factory.id) {
        hasErrors = true
        console.error(`VALIDATION ERROR: Factory "${factory.name}" (${factory.id}) has an input importing ${input.outputPart} from itself!`)
        return false
      }

      return true
    }))

    // Check the dependencies to ensure the factories they're requesting exist
    Object.keys(factory.dependencies.requests).forEach(depFacId => {
      const inputFac = findFac(depFacId, factories)

      if (!inputFac.id) {
        hasErrors = true
        console.error(`VALIDATION ERROR: Factory "${factory.name}" (${factory.id}) has a dependency for factory ID ${depFacId} which does not exist!`)

        const requests = factory.dependencies.requests[depFacId]
        // Loop the requests and split out the parts
        requests.forEach(request => {
          console.error(`Part ${request.part} with amount ${request.amount}`)
        })

        // Remove the dependency
        delete factory.dependencies.requests[depFacId]
      }
    })

    // Check for invalid products and remove them from factories
    // For instance if somehow a product has an amount of 0, which should not be possible, remove the product and recalculate.
    factory.products.forEach((product, productIndex) => {
      let needsRecalc = false
      if (product === null) {
        console.error(`VALIDATION ERROR: Factory "${factory.name}" (${factory.id}) has a product that is somehow null. Removing the product.`)
        factory.products.splice(productIndex, 1)
        needsRecalc = true
      }

      if (product && product.amount <= 0) {
        hasErrors = true
        console.error(`VALIDATION ERROR: Factory "${factory.name}" (${factory.id}) has a product with an amount of 0 or less. Setting to 0.1.`)

        product.amount = 0.1
        needsRecalc = true
      }

      // Ensure all the product requirements have parts in the factory
      if (product?.requirements) {
        Object.keys(product.requirements).forEach(part => {
          if (!factory.parts[part]) {
            console.error(`VALIDATION ERROR: Factory "${factory.name}" (${factory.id}) has a product with a requirement for part "${part}" which does not exist in the factory's part list. Adding the part now.`)
            createNewPart(factory, part)
            hasErrors = true
          }
        })
      }

      if (needsRecalc) {
        console.warn(`validation: Recalculating Factory "${factory.name}" (${factory.id}) due to product validation errors.`)
        // Recalculate right now
        calculateFactory(factory, factories, gameData)
        hasErrors = true
      }
    })
  })

  if (hasErrors) {
    alert('There were errors loading your factory data. Please check the browser console for more details. Firefox: Control + Shift + K, Chrome: Control + Shift + J. Look for "VALIDATION ERROR:".\n\nThe planner has made corrections so you can continue planning.')
  }

  // A plan whose derived data looks current is loaded without being recalculated, so a
  // ghost export saved by an older build would never be flushed. Report the drift instead
  // of alerting: the recalculation this triggers is what actually clears it, and it is not
  // something the user did wrong.
  const drift = findDependencyChainViolations(factories)
  if (drift.length > 0) {
    console.warn(
      `validation: The import/export chain is inconsistent in ${drift.length} place(s); recalculating the plan to repair it.`,
      drift
    )
  }

  return hasErrors || drift.length > 0
}
