import { BuildingRequirement, Factory, FactoryItem } from '@/interfaces/planner/FactoryInterface'
import { DataInterface } from '@/interfaces/DataInterface'
import { createNewPart, getRecipe } from '@/utils/factory-management/common'
import { calculatePartMetrics } from '@/utils/factory-management/satisfaction'

export const addProductToFactory = (
  factory: Factory,
  options: {
    id?: string,
    amount?: number,
    recipe?: string,
    requirements?: { [key: string]: { amount: number } },
  }
) => {
  factory.products.push({
    id: options.id ?? '',
    amount: options.amount ?? 1,
    recipe: options.recipe ?? '',
    displayOrder: factory.products.length,
    requirements: options.requirements ?? {},
    buildingRequirements: {} as BuildingRequirement,
    byProducts: [],
  })

  // Also add the part record to the factory
  createNewPart(factory, options.id ?? '')
}

// For internal testing use
export const addPowerProducerToFactory = (
  factory: Factory,
  options: {
    building?: string,
    buildingAmount?: number,
    powerAmount?: number,
    ingredientAmount?: number,
    recipe: string;
    updated: string // Supply one of 'power', 'ingredient', 'building', needed so the power generation can be recalculated.
  },
) => {
  factory.powerProducers.push({
    building: options.building ?? '',
    buildingAmount: options.buildingAmount ?? 0,
    buildingCount: 0, // Calculated later
    ingredients: [], // Calculated later
    ingredientAmount: options.ingredientAmount ?? 0,
    powerAmount: options.powerAmount ?? 0,
    powerProduced: 0, // Calculated later
    recipe: options.recipe,
    byproduct: null,
    displayOrder: factory.powerProducers.length,
    updated: options.updated,
  })
}

// Loops through all products and figures out what they produce and what they require, then adds it to the factory.parts object.
export const calculateProducts = (factory: Factory, gameData: DataInterface) => {
  factory.products.forEach(product => {
    product.requirements = {} // Prevents orphaning

    const recipe = getRecipe(product.recipe, gameData)
    if (!recipe) {
      console.warn(`calculateProductRequirements: Recipe with ID ${product.recipe} not found. It could be the user has not yet selected one.`)
      return
    }
    const recipePart = recipe.products[0].part

    if (product.amount < 0) {
      // If the product amount is negative, this causes issues with calculations, so force it to 0.
      product.amount = 0
      return // Nothing else to do
    }

    // Get the recipe of the product, as the product ID can no longer be used when there's multiple recipes involved for the same part.

    // Add the output of the product to the parts array
    createNewPart(factory, recipePart)
    factory.parts[recipePart].amountSuppliedViaProduction += product.amount
    calculatePartMetrics(factory, recipePart)

    // Calculate the ingredients needed to make this product.
    recipe.ingredients.forEach(ingredient => {
      if (isNaN(ingredient.amount)) {
        console.warn(`Invalid ingredient amount for ingredient "${ingredient.part}". Skipping.`)
        return
      }

      // === Now we need to calculate the parts required per min to make the product ===
      const productIngredientRatio = product.amount / recipe.products[0].perMin // This formula should have no rounding - the decimal points are important here for the floating point calculations
      let ingredientRequired = ingredient.perMin * productIngredientRatio
      ingredientRequired = Math.round(ingredientRequired * 1000) / 1000

      // Handle the ingredients
      createNewPart(factory, ingredient.part)
      factory.parts[ingredient.part].amountRequired += ingredientRequired

      // Raw resource handling
      if (gameData.items.rawResources[ingredient.part]) {
        if (!factory.rawResources[ingredient.part]) {
          factory.rawResources[ingredient.part] = {
            id: ingredient.part,
            name: gameData.items.rawResources[ingredient.part].name,
            amount: 0,
          }
        }

        // Mark the part as raw which will eventually be marked as fully satisfied.
        factory.parts[ingredient.part].isRaw = true
        factory.rawResources[ingredient.part].amount += ingredientRequired
      }

      // Set the amount that the individual products need for display purposes.
      if (!product.requirements[ingredient.part]) {
        product.requirements[ingredient.part] = {
          amount: 0,
        }
      }

      product.requirements[ingredient.part].amount += ingredientRequired

      // Finally calculate the part metrics now we have the details for the ingredient.
      calculatePartMetrics(factory, ingredient.part)
    })
  })
}

export const calculateByProducts = (factory: Factory, gameData: DataInterface): void => {
  factory.byProducts = [] // Prevents orphaning / duplication
  factory.products.forEach(product => {
    product.byProducts = [] // Prevents orphaning / duplication

    const recipe = getRecipe(product.recipe, gameData)

    if (!recipe) {
      console.warn('getByProduct: Could not get recipe, user may not have picked one yet.')
      return
    }

    const byProducts = recipe.products.filter(p => p.isByProduct)

    if (byProducts.length === 0) {
      return
    }

    byProducts.forEach(byProduct => {
      // We need to get ratio of product to byProduct by looking at the recipe's original product amount and the byProduct amount.
      const byProductRatio = byProduct.amount / recipe.products[0].amount

      // Now we compare the product.amount (the amount being produced) and times by the ratio to get the byProduct amount.
      const byProductAmount = product.amount * byProductRatio

      if (!product.byProducts) {
        product.byProducts = []
      }

      // Add to the byProducts of the product
      product.byProducts.push({
        id: byProduct.part,
        byProductOf: product.id,
        amount: byProductAmount,
      })

      // Now we need to add the byProduct to the factory's byProducts array for use by the Exports array purposes
      const byProductExists = factory.byProducts.find(p => p.id === byProduct.part)

      if (!byProductExists) {
        factory.byProducts.push({
          id: byProduct.part,
          amount: byProductAmount,
          byProductOf: product.id,
        })
      } else {
        byProductExists.amount += byProductAmount
      }

      // Now also add the part that the Byproduct creates to the parts list
      createNewPart(factory, byProduct.part)
      factory.parts[byProduct.part].amountSuppliedViaProduction += byProductAmount
      calculatePartMetrics(factory, byProduct.part)
    })
  })
}

// Loop through each product, and check if the parts produced by a recipe match a product requirement. If so, we mark that as an internal product and recalculate the remainder.
export const calculateInternalProducts = (factory: Factory, gameData: DataInterface) => {
  factory.internalProducts = {}

  factory.products.forEach(product => {
    const recipe = getRecipe(product.recipe, gameData)
    if (!recipe) {
      console.warn(`calculateFactoryInternalSupply: Recipe with ID ${product.recipe} not found. It could be the user has not yet selected one.`)
      return
    }

    // Calculate the ingredients needed to make this product.
    recipe.ingredients.forEach(ingredient => {
      // If the part is a requirement, mark it as an internal product.
      const foundProduct = factory.products.find(p => p.id === ingredient.part)

      if (foundProduct) {
        factory.internalProducts[ingredient.part] = {
          id: foundProduct.id,
          amount: foundProduct.amount,
        }
      }
    })
  })
}

export const shouldShowTrim = (product: FactoryItem, factory: Factory) => {
  // Calculate whether the product should be trimmed or not by checking:
  // 1. Part requirements of the item are more than internal demand
  // 2. Exported difference is more than 0

  if (!product.id) {
    return false
  }

  const part = factory.parts[product.id]

  if (!part) {
    console.error(`Part not found for product ID ${product.id}!`)
    return false
  }

  if (product.amount === 1) {
    return false // It's likely a new product, no need to show trim
  }

  if (part.amountRemaining <= 0) {
    return false // It's in demand internally or it's exactly right
  }

  // Must then mean there's a surplus
  return true
}

export const trimProduct = (product: FactoryItem, factory: Factory) => {
  // Using exports we can figure out the remaining surplus
  const partData = factory.parts[product.id]

  if (!partData) {
    // Nothing to do
    return
  }

  // Trim the product
  product.amount = partData.amountRequired
}

export const shouldShowNotInDemand = (product: FactoryItem, factory: Factory) => {
  // Calculate whether the product is in demand at all
  if (!product.id) {
    return false
  }

  if (product.amount === 0) {
    // Product is not being produced
    return true
  }

  const partRequired = factory.parts[product.id]?.amountRequired

  return partRequired <= 0
}
