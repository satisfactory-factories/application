// The export side (a provider's dependencies.requests) is derived entirely from the import
// side (each consumer's inputs). A "ghost export" is what the two disagreeing looks like in
// the UI: a factory listing an export to a factory that never asked for it, or asking for a
// different amount than the importer expects.
//
// These invariants are checked at load — a plan whose derived data is already current is not
// recalculated, so drift saved by an older build would otherwise survive forever — and
// asserted throughout the test suite.

import { Factory, FactoryInput } from '@/interfaces/planner/FactoryInterface'

// Amounts are user-entered floats totalled across duplicate imports, so compare loosely.
const AMOUNT_TOLERANCE = 0.0001

// An input the user is still filling in is not yet a dependency.
const isIncomplete = (input: FactoryInput): boolean => !input.factoryId || !input.outputPart

export const findDependencyChainViolations = (factories: Factory[]): string[] => {
  const violations: string[] = []
  const byId = new Map<number, Factory>()

  factories.forEach(factory => {
    if (byId.has(factory.id)) {
      violations.push(`Factories "${byId.get(factory.id)?.name}" and "${factory.name}" share the ID ${factory.id}.`)
      return
    }
    byId.set(factory.id, factory)
  })

  factories.forEach(provider => {
    Object.entries(provider.dependencies?.requests ?? {}).forEach(([requesterId, requests]) => {
      const requester = byId.get(Number(requesterId))

      if (!requester) {
        violations.push(`"${provider.name}" (${provider.id}) holds requests for factory ${requesterId}, which does not exist in the plan.`)
        return
      }

      if (requests.length === 0) {
        violations.push(`"${provider.name}" (${provider.id}) holds an empty requests array for "${requester.name}" (${requester.id}); the key should have been deleted.`)
      }

      requests.forEach(request => {
        if (request.requestingFactoryId !== requester.id) {
          violations.push(`"${provider.name}" (${provider.id}) has a request for ${request.part} keyed under ${requester.id} but stamped with requestingFactoryId ${request.requestingFactoryId}.`)
        }

        const inputs = requester.inputs.filter(
          input => input.factoryId === provider.id && input.outputPart === request.part
        )

        if (inputs.length === 0) {
          violations.push(`GHOST EXPORT: "${provider.name}" (${provider.id}) still exports ${request.part} to "${requester.name}" (${requester.id}), which has no such import.`)
          return
        }

        if (inputs.length > 1) {
          violations.push(`"${requester.name}" (${requester.id}) has ${inputs.length} duplicate imports of ${request.part} from "${provider.name}" (${provider.id}).`)
        }

        const expected = inputs.reduce((total, input) => total + input.amount, 0)
        if (Math.abs(request.amount - expected) > AMOUNT_TOLERANCE) {
          violations.push(`"${provider.name}" (${provider.id}) exports ${request.amount}/min of ${request.part} to "${requester.name}" (${requester.id}) but the import asks for ${expected}/min.`)
        }
      })
    })
  })

  factories.forEach(requester => {
    requester.inputs.forEach(input => {
      if (isIncomplete(input)) {
        return
      }

      if (input.factoryId === requester.id) {
        violations.push(`"${requester.name}" (${requester.id}) imports ${input.outputPart} from itself.`)
        return
      }

      const provider = byId.get(input.factoryId as number)
      if (!provider) {
        violations.push(`ORPHAN IMPORT: "${requester.name}" (${requester.id}) imports ${input.outputPart} from factory ${input.factoryId}, which does not exist in the plan.`)
        return
      }

      const request = provider.dependencies?.requests?.[requester.id]
        ?.find(req => req.part === input.outputPart)

      if (!request) {
        violations.push(`ORPHAN IMPORT: "${requester.name}" (${requester.id}) imports ${input.outputPart} from "${provider.name}" (${provider.id}), which holds no matching export request.`)
      }
    })
  })

  // The per-part export totals shown on the provider are a roll-up of its requests.
  factories.forEach(provider => {
    const requests = Object.values(provider.dependencies?.requests ?? {}).flat()

    Object.entries(provider.dependencies?.metrics ?? {}).forEach(([part, metrics]) => {
      const requested = requests
        .filter(request => request.part === part)
        .reduce((total, request) => total + request.amount, 0)

      if (Math.abs(metrics.request - requested) > AMOUNT_TOLERANCE) {
        violations.push(`"${provider.name}" (${provider.id}) reports ${metrics.request}/min of ${part} requested but its requests total ${requested}/min.`)
      }
    })
  })

  return violations
}
