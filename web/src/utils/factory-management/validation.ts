// Check for invalid factory data e.g. inputs without factories etc
import { calculateFactory, findFac } from '@/utils/factory-management/factory'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { DataInterface } from '@/interfaces/DataInterface'
import { createNewPart } from '@/utils/factory-management/common'

export const validateFactories = (factories: Factory[], gameData: DataInterface) => {
  let hasErrors = false

  factories.forEach(factory => {
    factory.inputs.forEach(input => {
      const inputFac = findFac(Number(input.factoryId), factories)
      if (!inputFac?.id) {
        hasErrors = true
        console.error(`VALIDATION ERROR: Factory "${factory.name}" (${factory.id}) has an input for ${input.factoryId} with part ${input.outputPart} where which the factory does not exist!`)

        // Remove the input
        const index = factory.inputs.findIndex(i => i.factoryId === input.factoryId)
        if (index !== -1) {
          factory.inputs.splice(index, 1)
        }
      }
    })

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
}
