import { Factory } from '@/interfaces/planner/FactoryInterface'
import {
  getPartDisplayName,
  hasMetricsForPart,
} from '@/utils/helpers'
import { getTotalSomersloops } from '@/utils/factory-management/building-groups/somersloops'
import { getTotalPowerShards } from '@/utils/factory-management/building-groups/common'
// This function calculates the total number of buildings for each type
export const calculateTotalBuildingsByType = (factories: Factory[]) => {
  const buildings: Record<
    string,
    {
      name: string;
      totalAmount: number;
    }
  > = {} // Explicitly define the type

  factories.forEach(factory => {
    Object.entries(factory.buildingRequirements).forEach(
      ([key, requirement]) => {
        if (!buildings[key]) {
          // Initialize the building entry
          buildings[key] = {
            name: requirement.name,
            totalAmount: 0,
          }
        }

        // Accumulate the total amount and total power
        buildings[key].totalAmount += requirement.amount
      }
    )
  })
  // Return sorted array of buildings
  return Object.values(buildings).sort((a, b) =>
    a.name.localeCompare(b.name)
  )
}

export const calculateTotalRawResources = (factories: Factory[]) => {
  const rawResources: Record<string, { id: string; totalAmount: number; }> = {}

  factories.forEach(factory => {
    Object.values(factory.rawResources).forEach(resource => {
      if (!rawResources[resource.id]) {
        // Initialize the raw resource entry
        rawResources[resource.id] = {
          id: resource.id,
          totalAmount: 0,
        }
      }
      // Accumulate the resource amount
      rawResources[resource.id].totalAmount += resource.amount
    })
  })
  // // Calculate percentage consumed
  // worldResources.forEach(worldResource => {
  //   if (rawResources[worldResource.id]) {
  //     const totalAmount = rawResources[worldResource.id].totalAmount
  //     rawResources[worldResource.id].percentageConsumed =
  //       totalAmount > 0 ? Math.min((totalAmount / worldResource.amount) * 100, 100) : 0
  //   }
  // })

  // Convert the object to an array and sort it alphabetically by display name
  return Object.values(rawResources).sort((a, b) =>
    getPartDisplayName(a.id).localeCompare(getPartDisplayName(b.id))
  )
}

export const calculateTotalParts = (factories: Factory[]) => {
  const parts: Record<
    string,
    {
      id: string;
      amountRequired: number;
      amountSupplied: number;
      amountRemaining: number;
      satisfied: boolean;
      isRaw: boolean;
    }
  > = {}

  factories.forEach(factory => {
    Object.entries(factory.parts).forEach(([partId, partData]) => {
      if (!parts[partId]) {
        parts[partId] = {
          id: partId,
          amountRequired: 0,
          amountSupplied: 0,
          amountRemaining: 0,
          satisfied: true,
          isRaw: partData.isRaw,
        }
      }

      // Aggregate metrics
      parts[partId].amountRequired += partData.amountRequired
      parts[partId].amountSupplied += partData.amountSuppliedViaProduction
      parts[partId].amountRemaining += partData.amountRemaining
      parts[partId].satisfied &&= partData.satisfied // Combine satisfaction status
    })
  })

  // Convert to array and return sorted by part name
  return Object.values(parts).sort((a, b) => getPartDisplayName(a.id).localeCompare(getPartDisplayName(b.id)))
}

export const calculateTotalProducedItems = (factories: Factory[]) => {
  const products: Record<
      string,
      { id: string, name: string; totalAmount: number; totalDifference: number }
    > = {}

  factories.forEach(factory => {
    factory.products.forEach(product => {
      if (!products[product.id]) {
        products[product.id] = {
          id: product.id,
          name: getPartDisplayName(product.id) ?? product.id,
          totalAmount: 0,
          totalDifference: 0,
        }
      }

      // Accumulate the product amount
      products[product.id].totalAmount += product.amount

      // Add the difference if metrics exist
      if (hasMetricsForPart(factory, product.id)) {
        const difference =
            factory.dependencies.metrics[product.id]?.difference ?? 0
        products[product.id].totalDifference += difference
      }
    })
  })

  // Convert the object to an array and sort it alphabetically by display name
  return Object.values(products).sort((a, b) =>
    a.name.localeCompare(b.name)
  )
}

export const calculateProducedItemsDifference = (factories: Factory[]) => {
  const differences: Record<string, { id: string, name: string; totalDifference: number }> =
      {}

  factories.forEach(factory => {
    Object.entries(factory.dependencies.metrics).forEach(([partId, metric]) => {
      if (metric.difference !== 0) {
        if (!differences[partId]) {
          differences[partId] = {
            id: partId,
            name: getPartDisplayName(partId) ?? partId,
            totalDifference: 0,
          }
        }
        // Accumulate the difference
        differences[partId].totalDifference += metric.difference
      }
    })
  })

  return Object.values(differences).sort((a, b) =>
    a.name.localeCompare(b.name)
  )
}

// Total Power Shards a factory needs across all its building groups (products + power
// producers).
export const getFactoryPowerShards = (factory: Factory): number => {
  let total = 0
  for (const product of factory.products) {
    total += getTotalPowerShards(product.buildingGroups)
  }
  for (const producer of factory.powerProducers) {
    total += getTotalPowerShards(producer.buildingGroups)
  }
  return total
}

// Total Somersloops a factory consumes across all its building groups, including
// build costs (e.g. 10 per Alien Power Augmenter).
export const getFactorySomersloops = (factory: Factory): number => {
  let total = 0
  for (const product of factory.products) {
    total += getTotalSomersloops(product.buildingGroups, product.buildingRequirements?.name)
  }
  for (const producer of factory.powerProducers) {
    total += getTotalSomersloops(producer.buildingGroups, producer.building)
  }
  return total
}

// Per-factory usage list for the statistics summary — only factories actually using any.
export const calculateFactoriesUsing = (
  factories: Factory[],
  getAmount: (factory: Factory) => number,
) => factories
  .map(factory => ({ factory, amount: getAmount(factory) }))
  .filter(entry => entry.amount > 0)

// Sums the per-factory power figures (which are derived from the building groups, so they
// account for overclocking and somersloops). Peak differs from consumed only when
// variable-power buildings (Particle Accelerator etc.) are present. The circuit boost
// (Alien Power Augmenters) is part of total generation, matching the in-game power graph.
export const calculateTotalPower = (factories: Factory[]) => {
  let totalPowerConsumed = 0
  let totalPowerConsumedMin = 0
  let totalPowerConsumedMax = 0
  let totalBasePower = 0
  let totalBasePowerMin = 0
  let totalBasePowerMax = 0
  let totalPowerBoost = 0
  let totalBoostPercent = 0
  let totalBoostFueled = 0
  let totalBoostUnfueled = 0

  factories.forEach(factory => {
    const consumed = factory.power?.consumed ?? 0
    const produced = factory.power?.produced ?? 0
    totalPowerConsumed += consumed
    totalPowerConsumedMin += factory.power?.consumedMin ?? consumed
    totalPowerConsumedMax += factory.power?.consumedMax ?? consumed
    totalBasePower += produced
    totalBasePowerMin += factory.power?.producedMin ?? produced
    totalBasePowerMax += factory.power?.producedMax ?? produced
    totalPowerBoost += factory.power?.boostMw ?? 0
    totalBoostPercent += factory.power?.boostPercent ?? 0
    totalBoostFueled += factory.power?.boostFueledBuildings ?? 0
    totalBoostUnfueled += factory.power?.boostUnfueledBuildings ?? 0
  })

  // The circuit boost is a percentage of whatever the grid is generating, so it swings
  // with the variable generators.
  const totalPowerBoostMin = totalBoostPercent * totalBasePowerMin
  const totalPowerBoostMax = totalBoostPercent * totalBasePowerMax

  const totalPowerProduced = totalBasePower + totalPowerBoost
  const totalPowerProducedMin = totalBasePowerMin + totalPowerBoostMin
  const totalPowerProducedMax = totalBasePowerMax + totalPowerBoostMax
  const totalPowerDifference = totalPowerProduced - totalPowerConsumed

  return {
    totalPowerConsumed,
    totalPowerConsumedMin,
    totalPowerConsumedMax,
    totalBasePower,
    totalBasePowerMin,
    totalBasePowerMax,
    totalPowerBoost,
    totalPowerBoostMin,
    totalPowerBoostMax,
    totalBoostPercent,
    totalBoostFueled,
    totalBoostUnfueled,
    totalPowerProduced,
    totalPowerProducedMin,
    totalPowerProducedMax,
    totalPowerDifference,
  }
}
