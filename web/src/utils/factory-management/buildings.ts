// Calculates what buildings are required to produce the products.
import { BuildingRequirement, Factory } from '@/interfaces/planner/FactoryInterface'
import { DataInterface } from '@/interfaces/DataInterface'
import { getPowerRecipe, getRecipe } from '@/utils/factory-management/common'
import { formatNumberFully } from '@/utils/numberFormatter'

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
    const recipe = getPowerRecipe(producer.recipe, gameData)

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

    const buildingData = factory.buildingRequirements[producer.building]
    // Update the building count so the math works
    buildingData.amount += Math.ceil(producer.buildingAmount)
    // Satisfy typescript even though it's defined...
    if (!buildingData.powerProduced) buildingData.powerProduced = 0

    const wholeBuildingCount = Math.floor(producer.buildingAmount)
    const fractionalBuildingCount = producer.buildingCount - wholeBuildingCount

    const powerProduced = ((recipe.building.power ?? 0) * wholeBuildingCount) + (recipe.building.power * Math.pow(fractionalBuildingCount, 1.321928)) // Power usage = initial power usage x (clock speed / 100)1.321928

    buildingData.powerProduced += Number(powerProduced.toFixed(3)) // Fucky wuky floating point numbers
  })
}

// Sums up all building data to create an aggregate value of power and building requirements
export const calculateFactoryBuildingsAndPower = (factory: Factory, gameData: DataInterface) => {
  factory.buildingRequirements = {}
  // First tot up all building and power requirements for products and power generators
  calculateProductBuildings(factory, gameData)
  calculatePowerProducerBuildings(factory, gameData)
}

// This is called later on in the calculation process to get the final values using the building groups, which will be actually what the player needs to build.
export const calculateFinalBuildingsAndPower = (factory: Factory) => {
  factory.power = {
    consumed: 0,
    produced: 0,
    difference: 0,
  }

  // Sum up the power consumption using the building groups.
  const products = factory.products
  let consumed = 0

  products.forEach(product => {
    product.buildingGroups.forEach(group => {
      if (!group.buildingCount) return

      consumed += group.powerUsage
    })
  })

  factory.power.consumed = formatNumberFully(consumed, 1)

  // Sum up all power production
  const powerProducers = factory.powerProducers
  let produced = 0

  powerProducers.forEach(producer => {
    producer.buildingGroups.forEach(group => {
      if (!group.buildingCount) return

      produced += group.powerProduced
    })
  })

  factory.power.produced = formatNumberFully(produced, 1)

  // Set all factory building counts to 0.
  Object.keys(factory.buildingRequirements).forEach(key => {
    factory.buildingRequirements[key].amount = 0
  })

  // Sum up the buildings
  products.forEach(product => {
    product.buildingGroups.forEach(group => {
      if (!group.buildingCount) return

      const building = product.buildingRequirements.name

      const buildingData = factory.buildingRequirements[building] // It should be present by the time this is run (from calculateFactoryBuildingsAndPower)
      if (!buildingData) {
        throw new Error(`buildings: calculateFinalBuildingsAndPower: Building data not found for ${building} when it should exist!`)
      }

      buildingData.amount += group.buildingCount
    })
  })
}
