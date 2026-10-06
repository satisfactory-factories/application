// Pure predicates over a factory's import rows. They live here rather than in inputs.ts so
// status.ts can use them: inputs.ts imports factory.ts, which imports problems.ts, so a status
// module reaching into inputs.ts would close the cycle. Re-exported from inputs.ts for callers.
import { Factory } from '@/interfaces/planner/FactoryInterface'

export const isImportRedundant = (importIndex: number, factory: Factory): boolean | null => {
  const input = factory.inputs[importIndex]
  if (!input?.outputPart) {
    return null
  }

  if (input.amount === 0) {
    return null // If the amount is 0, it's technically redundant, but it could also be the user hasn't chosen anything yet. They already get a chip saying no amount is set.
  }

  const partData = factory.parts[input.outputPart]

  if (!partData) {
    console.error(`inputs: isImportRedundant: Part data for part ${input.outputPart} not found in factory ${factory.id}!`)
    return null
  }

  // If the factory is producing the products internally, and the amount that it produces exceeds the amount imported, then the import is redundant.

  const required = partData.amountRequired
  const produced = partData.amountSuppliedViaProduction

  // The remainder of the part that needs to be imported
  const importsNeeded = required - produced

  // If there's no requirement, then the import is redundant.
  if (required <= 0) {
    return true
  }

  // If there is sufficient internal production, then all imports are redundant
  if (importsNeeded <= 0) {
    return true
  }

  // Now, we also need to take into account other imports. If other imports fully satisfy the requirement, then this import is redundant.
  // Loop through all the inputs and see if the other imports fully satisfy the requirement.
  const otherImports = factory.inputs.filter((_, index) =>
    index !== importIndex &&
    factory.inputs[index].outputPart === input.outputPart
  )
  const otherImportsValues: number[] = []
  otherImports.forEach(input => {
    if (!input.outputPart) return 0
    otherImportsValues.push(input.amount ?? 0)
  })
  const otherImportsTotal = otherImportsValues.reduce((acc, val) => acc + val, 0)

  // If there are no other imports then the import is required.
  if (otherImports.length === 0) return false

  // In a multi-input scenario, if there's an over supply, inform the user one of their imports are redundant.
  // Try to be deterministic by favouring the largest import.
  const largestOtherImport = Math.max(...otherImportsValues)

  // If the current import is the largest, then it's not redundant.
  // This does annoyingly mean that if they are both EXACTLY the same, both will be redundant. Can't really get around it.
  if (input.amount >= largestOtherImport) return false

  const requirementAfterOtherImports = importsNeeded - otherImportsTotal

  // If the other imports don't fully satisfy the requirement, then the import is not redundant.
  return requirementAfterOtherImports <= 0
}

// Two rows importing the same part from the same factory collapse into a single export
// request, so the provider only ever sees one of them. Reports whether the row at
// inputIndex has become such a duplicate.
export const isDuplicateImport = (factory: Factory, inputIndex: number): boolean => {
  const input = factory.inputs[inputIndex]

  if (!input?.factoryId || !input.outputPart) {
    return false // Still being filled in.
  }

  return factory.inputs.some((other, index) =>
    index !== inputIndex &&
    other.factoryId === input.factoryId &&
    other.outputPart === input.outputPart
  )
}

// The DOM id of one import row, shared by the row itself and by everything that jumps to it —
// notably the exporting factory's satisfaction table, which sends the user to the row consuming
// its export rather than to the destination factory's card.
//
// Half-configured rows get no id: they would all read the same and collide with each other.
export const importRowId = (
  factoryId: number | string,
  sourceFactoryId: number | string | null,
  part: string | null
): string | null => {
  if (!sourceFactoryId || !part) return null

  return `${factoryId}-import-${sourceFactoryId}-${part}`
}
