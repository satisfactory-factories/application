// Calculates what buildings are required to produce the products.
import { BuildingRequirement, Factory } from '@/interfaces/planner/FactoryInterface'
import { DataInterface } from '@/interfaces/DataInterface'
import { getPowerRecipeById, getRecipe } from '@/utils/factory-management/common'

export const calculateProductBuildings = (factory: Factory, gameData: DataInterface) => {
  factory.products.forEach(product => {
    if (product.recipe) {
      const recipe = getRecipe(product.recipe, gameData)

      if (!recipe) {
        console.warn(`calculateBuildingRequirements: Recipe with ID ${product.recipe} not found. It could be the user has not yet selected one.`)
        return
      }

      const productInRecipe = recipe.products.filter(p => p.part === product.id)[0]

      if (!productInRecipe) {
        product.buildingRequirements = {} as BuildingRequirement
        return
      }

      const buildingData = recipe.building
      const buildingCount = product.amount / productInRecipe.perMin
      // When calculating the building power cost, we need to apply a special formula when overclocking or underclocking.
      // Initially we will handle underclocking, which requires us to only run the formula on the fractional part of the building count
      // See the official wiki for details: https://satisfactory.wiki.gg/wiki/Clock_speed
      const wholeBuildingCount = Math.floor(buildingCount)
      const fractionalBuildingCount = buildingCount - wholeBuildingCount

      product.buildingRequirements = {
        name: buildingData.name,
        amount: buildingCount,
        powerConsumed: (buildingData.power * wholeBuildingCount) + (buildingData.power * Math.pow(fractionalBuildingCount, 1.321928)), // Power usage = initial power usage x (clock speed / 100)1.321928
      }

      // Add it to the factory building requirements
      if (!factory.buildingRequirements[buildingData.name]) {
        factory.buildingRequirements[buildingData.name] = {
          name: buildingData.name,
          amount: 0,
          powerConsumed: 0,
        }
      }

      const facBuilding = factory.buildingRequirements[buildingData.name]
      const powerConsumed = (facBuilding.powerConsumed ?? 0) + (product.buildingRequirements.powerConsumed ?? 0)
      facBuilding.amount += Math.ceil(buildingCount)
      facBuilding.powerConsumed = Number(powerConsumed.toFixed(3)) // Fucky wuky floating point numbers
    } else {
      product.buildingRequirements = {} as BuildingRequirement
    }
  })
}

export const calculatePowerProducerBuildings = (factory: Factory, gameData: DataInterface) => {
  // Loop through each power producer and add up the buildings
  factory.powerProducers.forEach(producer => {
    const recipe = getPowerRecipeById(producer.recipe, gameData)

    if (!recipe) {
      console.warn(`calculatePowerProducerBuildingRequirements: Recipe with ID ${producer.recipe} not found. It could be the user has not yet selected one.`)
      return
    }

    if (!factory.buildingRequirements[producer.building]) {
      factory.buildingRequirements[producer.building] = {
        name: producer.building,
        amount: 0,
        powerProduced: 0,
      }
    }

    const facBuilding = factory.buildingRequirements[producer.building]
    const wholeBuildingCount = Math.floor(producer.buildingCount)
    const fractionalBuildingCount = producer.buildingCount - wholeBuildingCount

    const powerProduced = ((recipe.building.power ?? 0) * wholeBuildingCount) + (recipe.building.power * Math.pow(fractionalBuildingCount, 1.321928)) // Power usage = initial power usage x (clock speed / 100)1.321928

    facBuilding.amount = facBuilding.amount + Math.ceil(producer.buildingCount) // Total buildings regardless of clocks
    facBuilding.powerProduced = Number(powerProduced.toFixed(3)) // Fucky wuky floating point numbers
  })
}

// Sums up all of the building data to create an aggregate value of power and building requirements
export const calculateFactoryBuildingsAndPower = (factory: Factory, gameData: DataInterface) => {
  factory.buildingRequirements = {}
  // First tot up all building and power requirements for products and power generators
  calculateProductBuildings(factory, gameData)
  calculatePowerProducerBuildings(factory, gameData)

  factory.power = {
    consumed: 0,
    produced: 0,
    difference: 0,
  }

  // Then sum up the total power
  Object.keys(factory.buildingRequirements).forEach(key => {
    const building = factory.buildingRequirements[key]
    factory.power.consumed += building.powerConsumed ?? 0
    factory.power.produced += building.powerProduced ?? 0
  })

  factory.power.difference = factory.power.produced - factory.power.consumed
}
