// Calculate the remaining amount of parts required after all inputs and internal products are accounted for.
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { getRequestsForFactory } from '@/utils/factory-management/exports'
import { DataInterface } from '@/interfaces/DataInterface'
import { createNewPart } from '@/utils/factory-management/common'

export const calculateParts = (factory: Factory, gameData: DataInterface) => {
  calculatePartMetrics(factory, gameData)

  // If factory has no products there is nothing for us to do, so mark as satisfied.
  if (factory.products.length === 0) {
    factory.requirementsSatisfied = true
    return
  }

  // Now check if all requirements are satisfied and flag so if it is.
  factory.requirementsSatisfied = Object.keys(factory.parts).every(part => factory.parts[part].satisfied)

  // If we're only using raw resources flag it as such
  factory.usingRawResourcesOnly = Object.keys(factory.parts).every(part => factory.parts[part].isRaw)
}

// This is where the meat of the soup is!
// This calculates all the parts in the factory and checks if they are satisfied.
export const calculatePartMetrics = (factory: Factory, gameData: DataInterface) => {
  factory.parts = {}
  factory.rawResources = {}

  calculatePartRequirements(factory)
  calculatePartSupply(factory)
  calculatePartRaw(factory, gameData)
  calculateExportable(factory)

  // Now we calculate the remaining amount of parts required after all inputs and internal products are accounted for.
  for (const part in factory.parts) {
    const partData = factory.parts[part]

    // Sum up remaining amount
    partData.amountRemaining = partData.amountSupplied - partData.amountRequired

    // Now calculate if satisfied
    partData.satisfied = partData.amountRemaining >= 0
  }
}

export const calculatePartRequirements = (factory: Factory) => {
  // Get the amount required by production
  factory.products.forEach(product => {
    createNewPart(factory, product.id)

    // Loop through the product requirements
    for (const part in product.requirements) {
      if (!product.requirements[part]?.amount) {
        console.error('calculatePartRequirements - products: Amount is missing from product!', product)
        return
      }

      createNewPart(factory, part)

      // Loop the product requirements and pick out if it matches the part
      factory.parts[part].amountRequiredProduction += product.requirements[part].amount
    }
  })

  // Get the amount required by power production
  factory.powerProducers.forEach(producer => {
    if (producer.ingredients.length === 0) {
      console.error('calculatePartRequirements - powerProducers: Ingredients are missing from producer!', producer)
      return
    }

    producer.ingredients.forEach(ingredient => {
      createNewPart(factory, ingredient.part)
      if (!ingredient.perMin) {
        console.error('calculatePartRequirements - powerProducers: perMin is missing from ingredient!', ingredient)
        return
      }
      factory.parts[ingredient.part].amountRequiredPower += ingredient.perMin
    })
  })

  // Get requirements for export demands
  // Get the amount required by export dependencies
  const requests = getRequestsForFactory(factory)

  requests.forEach(request => {
    createNewPart(factory, request.part)
    factory.parts[request.part].amountRequiredExports += request.amount
  })

  // Sum up requirements
  for (const part in factory.parts) {
    const partData = factory.parts[part]
    partData.amountRequired =
      partData.amountRequiredProduction +
      partData.amountRequiredPower +
      partData.amountRequiredExports
  }
}

// Requires partRequirements to be run first!
export const calculatePartSupply = (factory: Factory) => {
  // Get the amount supplied by inputs
  factory.inputs.forEach(input => {
    if (!input.outputPart) {
      console.error('calculatePartSupply - inputs: Output part is missing from input!', input)
      return
    }
    createNewPart(factory, input.outputPart)
    if (!input.amount) {
      console.error('calculatePartSupply - inputs: Amount is missing from input!', input)
      return
    }
    factory.parts[input.outputPart].amountSuppliedViaInput += input.amount
  })

  // Get the amount supplied by products
  factory.products.forEach(product => {
    if (!product.amount) {
      console.error('calculatePartSupply - products: Amount is missing from product!', product)
      return
    }

    // Add up product amounts
    createNewPart(factory, product.id)
    factory.parts[product.id].amountSuppliedViaProduction += product.amount

    // And byproducts
    product.byProducts?.forEach(byProduct => {
      createNewPart(factory, byProduct.id)
      factory.parts[byProduct.id].amountSuppliedViaProduction += byProduct.amount
    })
  })

  // Get amount supplied by power producers waste
  factory.powerProducers.forEach(producer => {
    if (!producer.byproduct) {
      return
    }

    createNewPart(factory, producer.byproduct.part)
    factory.parts[producer.byproduct.part].amountSuppliedViaProduction += producer.byproduct.amount
  })

  // Sum up supply
  for (const part in factory.parts) {
    const partData = factory.parts[part]

    partData.amountSupplied =
      partData.amountSuppliedViaInput +
      partData.amountSuppliedViaProduction
      // partData.amountSuppliedViaRaw // At this particular point this metric is not calculated, it is done in calculatePartRaw
  }
}

export const calculatePartRaw = (factory: Factory, gameData: DataInterface) => {
  for (const part in factory.parts) {
    const partData = factory.parts[part]

    // Check if the part is a raw resource
    const rawItem = gameData.items.rawResources[part]
    partData.isRaw = !!rawItem

    if (!partData.isRaw) {
      continue // Nothing else to do
    }

    partData.amountSuppliedViaRaw = partData.amountRequired

    // This is purposefully additive, allows us to enable inputs from other factories should we need to.
    partData.amountSupplied =
      partData.amountSuppliedViaInput +
      partData.amountSuppliedViaProduction +
      partData.amountSuppliedViaRaw

    // Also fill the rawResources array
    if (!factory.rawResources[part]) {
      factory.rawResources[part] = {
        id: part,
        name: rawItem.name,
        amount: 0,
      }
    }
    factory.rawResources[part].amount += partData.amountRequired
  }
}

// This function calculates what is produced internally for the factory and flags it as exportable.
export const calculateExportable = (factory: Factory) => {
  for (const part in factory.parts) {
    const partData = factory.parts[part]

    if (partData.amountRequiredExports > 0) {
      partData.exportable = true
    }

    if (partData.amountSuppliedViaProduction > 0) {
      partData.exportable = true
    }
  }
}
