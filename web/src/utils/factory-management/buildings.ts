// Calculates what buildings are required to produce the products.
import { BuildingRequirement, Factory } from '@/interfaces/planner/FactoryInterface'
import { DataInterface } from '@/interfaces/DataInterface'
import { getRecipe } from '@/utils/factory-management/common'

export const calculateBuildingRequirements = (factory: Factory, gameData: DataInterface) => {
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
        powerPerBuilding: buildingData.power,
        totalPower: (buildingData.power * wholeBuildingCount) + (buildingData.power * Math.pow(fractionalBuildingCount, 1.321928)), // Power usage = initial power usage x (clock speed / 100)1.321928
      }
    } else {
      product.buildingRequirements = {} as BuildingRequirement
    }
  })
}

export const calculateBuildingsAndPower = (factory: Factory) => {
  const sinkName = 'resourcesink'
  const sinkAmount = factory.buildingRequirements[sinkName]?.amount
  const sinkPower = factory.buildingRequirements[sinkName]?.powerPerBuilding

  factory.totalPower = 0
  factory.buildingRequirements = {} as {[key: string]: BuildingRequirement }

  // Loop through each product and sum the power requirements based off the metrics already there.
  factory.products.forEach(product => {
    const building = product.buildingRequirements

    if (Object.keys(building).length === 0) return

    if (!factory.buildingRequirements[building.name]) {
      factory.buildingRequirements[building.name] = {
        name: building.name,
        amount: 0,
        powerPerBuilding: building.powerPerBuilding,
        totalPower: 0,
      }
    }

    const facBuilding = factory.buildingRequirements[building.name]

    facBuilding.amount = facBuilding.amount + building.amount
    facBuilding.totalPower = factory.totalPower + building.totalPower

    // Sum the total power.
    factory.totalPower = factory.totalPower + building.totalPower
  })

  // Special case for 'Sinks' that aren't used in a recipe/product. They are only added manually by the user
  if (!sinkAmount || sinkAmount <= 0) return
  factory.buildingRequirements[sinkName] = {
    name: sinkName,
    amount: sinkAmount,
    powerPerBuilding: sinkPower,
    totalPower: sinkPower * sinkAmount,
  }

  // Sum adding the Sink
  factory.totalPower = factory.totalPower + (sinkPower * sinkAmount)
}
