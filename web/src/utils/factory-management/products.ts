import { BuildingRequirement, ByProductItem, Factory, FactoryItem } from '@/interfaces/planner/FactoryInterface'
import { DataInterface } from '@/interfaces/DataInterface'
import {
  getPartDisplayNameWithoutDataStore,
  getRecipe,
} from '@/utils/factory-management/common'
import eventBus from '@/utils/eventBus'
import { addProductBuildingGroup } from '@/utils/factory-management/building-groups/product'
import { fetchGameData } from '@/utils/gameDataService'
import { calculateProductBuildings } from '@/utils/factory-management/buildings'

const gameData = await fetchGameData()

export const addProductToFactory = (
  factory: Factory,
  options: {
    id?: string,
    amount?: number,
    recipe?: string,
    requirements?: { [key: string]: { amount: number } },
    displayOrder?: number,
  }
) => {
  factory.products.push({
    id: options.id ?? '',
    amount: options.amount ?? 1,
    recipe: options.recipe ?? '',
    displayOrder: options.displayOrder ?? factory.products.length,
    requirements: options.requirements ?? {},
    buildingRequirements: {} as BuildingRequirement,
    byProducts: [],
    buildingGroups: [],
    buildingGroupsTrayOpen: false,
    buildingGroupsHaveProblem: false,
  })

  // Since we now depend upon the factory having its building requirements calculated for the building groups to be added correctly, do that now.

  calculateProductBuildings(factory, gameData)

  // Also push the first product building group
  addProductBuildingGroup(factory.products[factory.products.length - 1])
}

type Recipe = NonNullable<ReturnType<typeof getRecipe>>

// Loops through all products and figures out what they produce and what they require, then adds it to the factory.parts object.
export const calculateProducts = (factory: Factory, gameData: DataInterface) => {
  factory.products.forEach(product => {
    product.requirements = {} // Prevents orphaning

    const recipe = getRecipe(product.recipe, gameData)
    if (!recipe) {
      console.warn(`calculateProductRequirements: Recipe with ID ${product.recipe} not found. It could be the user has not yet selected one.`)
      return
    }

    if (!product.amount || product.amount < 0) {
      // If the product amount is negative, this causes issues with calculations, so force it to 0.
      product.amount = 1
      console.warn('products: calculateProducts: Product amount is <= 0, force setting to 1 to prevent calculation errors.')
      eventBus.emit('toast', {
        message: 'You cannot set a product quantity to be <=0. Setting to 1 to prevent calculation errors. <br>If you need to enter 0.x of numbers, enter a period then the number e.g. ".5".',
        type: 'warning',
      })
    }

    // Calculate the ingredients needed to make this product.
    recipe.ingredients.forEach(ingredient => {
      if (isNaN(ingredient.amount)) {
        console.error(`Invalid ingredient amount for ingredient "${ingredient.part}". Skipping.`)
        return
      }

      // === Now we need to calculate the parts required per min to make the product ===
      const productIngredientRatio = product.amount / recipe.products[0].perMin // This formula should have no rounding - the decimal points are important here for the floating point calculations
      let ingredientRequired = ingredient.perMin * productIngredientRatio
      ingredientRequired = Math.round(ingredientRequired * 1000) / 1000

      // Handle the ingredients
      // Set the amount that the individual products need for display purposes.
      if (!product.requirements[ingredient.part]) {
        product.requirements[ingredient.part] = {
          amount: 0,
        }
      }

      product.requirements[ingredient.part].amount += ingredientRequired
    })
  })

  // Now calculate byproducts
  calculateByProducts(factory, gameData)
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
    })
  })
}

export const shouldShowFix = (product: FactoryItem, factory: Factory): string | null => {
  // Calculate whether the product should be trimmed or not by checking:
  // 1. Part requirements of the item are more than internal demand
  // 2. Exported difference is more than 0

  if (!product?.id) {
    return null
  }

  const part = factory.parts[product.id]

  if (!part) {
    console.error(`Part not found for product ID ${product.id}!`)
    return null
  }

  // It's likely a new product or empty one, no need to show trim
  if (product.amount === 0 || product.amount === 1) {
    return null
  }

  // It's in demand but not enough is being produced
  if (part.amountRemaining < 0) {
    return 'deficit'
  }

  // If the part does not have a demand, we should show nothing as it could be an end product
  if (part.amountRequired === 0) {
    return null
  }

  if (part.amountRemaining > 0) {
    return 'surplus'
  }

  // Must then mean it's exactly right at remaining 0.
  return null
}

export const shouldShowInternal = (product: FactoryItem | ByProductItem, factory: Factory) => {
  if (!factory.parts[product.id]) {
    return false
  }
  return factory.parts[product.id].amountRequiredProduction > 0 || factory.parts[product.id].amountRequiredPower > 0
}

export const shouldShowNotInDemand = (product: FactoryItem, factory: Factory) => {
  // Calculate whether the product is in demand at all
  if (!product.id) {
    return false
  }

  const partRequired = factory.parts[product.id]?.amountRequired

  return partRequired <= 0
}

export const fixProduct = (product: FactoryItem, factory: Factory): void => {
  // If the product is not found, throw
  if (!product.id) {
    const error = 'products: fixPart: Product ID is missing!'
    console.error(error)
    throw new Error(error)
  }
  // If the part is not found, throw
  if (!factory.parts[product.id]) {
    const error = `products: fixPart: Part data for "${product.id}" is missing!`
    console.error(error)
    throw new Error(error)
  }

  const partData = factory.parts[product.id]

  // If the factory is producing byproducts, we need to handle that properly. Using the part data we should be able to achieve this regardless of the product type.

  const produced = partData.amountSuppliedViaProduction
  const required = partData.amountRequired
  const diff = required - produced

  product.amount = diff + product.amount

  // updateFactory must be called!
}

export const getProduct = (
  factory: Factory,
  productId: string,
  productOnly = false,
  byProductOnly = false
): FactoryItem | ByProductItem | undefined => {
  const product = factory.products.find(product => product.id === productId)
  const byProduct = factory.byProducts.find(product => product.id === productId)

  if (productOnly) {
    return product ?? undefined
  }
  if (byProductOnly) {
    return byProduct ?? undefined
  }
  return product ?? byProduct ?? undefined
}

export const updateProductAmountViaByproduct = (product: FactoryItem, part: string, gameData: DataInterface) => {
  const byProduct = product.byProducts?.find(bp => bp.id === part)

  if (!byProduct) {
    const error = `products: updateProductAmountViaByproduct: No byproduct part ${part} found for product ${product.id}!`
    console.error(error)
    throw new Error(error)
  }

  product.amount = getProductAmountByPart(product, part, 'byproduct', byProduct.amount, gameData)

  if (product.amount <= 0) {
    console.warn('product: setProductQtyByByproduct: product amount is less than 0.1, force setting to 0.1')
    eventBus.emit('toast', {
      message: 'You cannot set a byproduct to be 0. Setting product amount to 0.1 to prevent calculation errors. <br>If you need to enter 0.x of numbers, use your cursor to do so.',
      type: 'warning',
    })
    product.amount = 0.1
  }

  // Must call update factory!
}

export const updateProductAmountViaRequirement = async (product: FactoryItem, part: string) => {
  const ingredient = product.requirements[part]

  if (!ingredient) {
    const error = `products: updateProductAmountByRequirement: No ingredient part ${part} found for product ${product.id}!`
    console.error(error)
    throw new Error(error)
  }

  product.amount = getProductAmountByPart(product, part, 'requirement', ingredient.amount, gameData)

  if (product.amount <= 0) {
    console.warn('product: setProductQtyByRequirement: product amount is less than 0, force setting to 0.1')
    eventBus.emit('toast', {
      message: 'You cannot set an ingredient to be 0. Setting product amount to 0.1 to prevent calculation errors. <br>If you need to enter 0.x of numbers, use your cursor to do so.',
      type: 'warning',
    })
    product.amount = 0.1
  }

  // Must call update factory!
}

export const getProductAmountByPart = (
  product: FactoryItem,
  part: string,
  type: 'byproduct' | 'requirement',
  newAmount: number | undefined,
  gameData: DataInterface
) => {
  if (!newAmount || newAmount < 0) {
    return 0
  }
  const recipe = getRecipe(product.recipe, gameData)
  if (!recipe) {
    const error = `products: getProductQtyByAmount: No recipe found for product ${product.id}!`
    console.error(error)
    throw new Error(error)
  }

  let recipeAmount: number

  if (type === 'byproduct') {
    recipeAmount = recipeByproductPerMin(part, recipe)
  } else {
    recipeAmount = recipeIngredientPerMin(part, recipe)
  }

  if (!recipeAmount || recipeAmount <= 0) {
    return 0.1
  }

  return recipe.products[0].perMin * newAmount / recipeAmount
}

export const recipeByproductPerMin = (part: string, recipe: Recipe) => {
  // Seems byproduct is used in power recipes
  const byproduct = [...recipe.products, ...(recipe.byproduct ?? [])].find(bp => bp.part === part)
  if (!byproduct) {
    const error = `products: recipeByproductPerMin: No byproduct found for part ${part} in recipe ${recipe.id}!`
    console.error(error)
    throw new Error(error)
  }
  return byproduct.perMin
}

export const recipeIngredientPerMin = (ingredientPart: string, recipe: Recipe) => {
  const ingredient = recipe.ingredients.find(i => i.part === ingredientPart)
  if (!ingredient) {
    const error = `products: recipeIngredientPerMin: No ingredient found for part ${ingredientPart} in recipe ${recipe.id}!`
    console.error(error)
    throw new Error(error)
  }
  return ingredient.perMin
}

export const isPartByProductOfRecipe = (part: string, recipeId: string, gameData: DataInterface) => {
  const recipe = getRecipe(recipeId, gameData)

  if (!recipe) {
    console.warn(`isPartByProductOfRecipe: Recipe with ID ${recipeId} not found. It could be the user has not yet selected one.`)
    return false
  }

  return recipe.products.some(p => p.part === part && p.isByProduct)
}

// Takes the byproduct and swaps it for the product recipe otherwise the planner does real dumb shit
export const byProductAsProductCheck = (product: FactoryItem, gameData: DataInterface) => {
  // Check if a swap is required
  const required = isPartByProductOfRecipe(product.id, product.recipe, gameData)

  if (!required) {
    return
  }

  // Get what should be the correct product recipe combo. We do this by getting the recipeId and simply replacing the product's productId with that instead and updating the factory.
  const recipe = getRecipe(product.recipe, gameData)
  const oldPartName = getPartDisplayNameWithoutDataStore(product.id, gameData)

  if (!recipe) {
    console.warn(`isPartByProductOfRecipe: Recipe with ID ${product.recipe} not found. It could be the user has not yet selected one.`)
    return false
  }

  const newProductId = recipe.products[0].part

  console.log(`products: swapByProductRecipeForProduct: Replacing byproduct ${product.id} with ${newProductId}`)
  eventBus.emit('toast', {
    message: `The chosen Byproduct <b>${oldPartName}</b> was swapped for the producing Product <b>${recipe.displayName}</b>.<br>Update the Byproduct ingredient on <b>${recipe.displayName}</b> for the desired item quantity.`,
    type: 'info',
    timeout: 10000,
  })
  product.id = recipe.products[0].part
}

// Get what is now the new buildingRequirement for the product
export const increaseProductQtyViaBuilding = (product: FactoryItem, gameData: DataInterface) => {
  const newVal = product.buildingRequirements.amount

  if (newVal < 0 || !newVal) {
    product.buildingRequirements.amount = 0 // Prevents the product being totally deleted
    return
  }

  // Get the recipe for the product in order to get the new quantity
  const recipe = getRecipe(product.recipe, gameData)

  if (!recipe) {
    console.error('No recipe found for product!', product)
    throw new Error('No recipe found for product!')
  }

  // Set the new quantity of the product
  product.amount = recipe.products[0].perMin * newVal

  // Must call updateFactory!
}
