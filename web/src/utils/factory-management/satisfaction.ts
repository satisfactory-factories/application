// Calculate the remaining amount of parts required after all inputs and internal products are accounted for.
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { getRequestsForFactoryByProduct } from '@/utils/factory-management/exports'

export const calculatePartMetrics = (factory: Factory, part: string) => {
  const partData = factory.parts[part]

  // If supplied from raw, we always assure that it is fully supplied and satisfied
  if (partData.isRaw) {
    partData.amountSupplied = partData.amountRequired
  } else {
    partData.amountSupplied = partData.amountSuppliedViaInput + partData.amountSuppliedViaProduction
  }

  // === Part Requirements ===
  // Get the amount required by production
  partData.amountRequiredProduction = 0
  factory.products.forEach(product => {
    // It may not be available at this point
    if (product.requirements[part]?.amount) {
      partData.amountRequiredProduction += product.requirements[part].amount
    }
  })

  // Get the amount required by export dependencies
  partData.amountRequiredExports = 0
  getRequestsForFactoryByProduct(factory, part).forEach(request => {
    partData.amountRequiredExports += request.amount
  })

  // Sum up requirements
  partData.amountRequired = partData.amountRequiredProduction + partData.amountRequiredExports + partData.amountRequiredPower

  // Sum up remaining amount
  partData.amountRemaining = partData.amountSupplied - partData.amountRequired

  // Now calculate if satisfied
  partData.satisfied = partData.amountRemaining >= 0
}

export const calculateFactorySatisfaction = (factory: Factory) => {
  // Let's make absolutely sure the factory part metrics are right
  Object.keys(factory.parts).forEach(part => {
    calculatePartMetrics(factory, part)
  })

  // If factory has no products there is nothing for us to do, so mark as satisfied.
  if (factory.products.length === 0) {
    factory.requirementsSatisfied = true
    return
  }

  // Now check if all requirements are satisfied and flag so if it is.
  factory.requirementsSatisfied = Object.keys(factory.parts).every(part => factory.parts[part].satisfied)
}
