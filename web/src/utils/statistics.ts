import { Factory } from '@/interfaces/planner/FactoryInterface'
import {
  getPartDisplayName,
  hasMetricsForPart,
} from '@/utils/helpers'
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
  const differences: Record<string, {id: string, name: string; totalDifference: number }> =
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

export const calculateTotalPower = (factories: Factory[]) => {
  const buildings: Record<
string,
{
  powerConsumed: number;
  powerProduced: number;
}
> = {} // Explicitly define the type

  factories.forEach(factory => {
    Object.entries(factory.buildingRequirements).forEach(
      ([key, requirement]) => {
        if (!buildings[key]) {
          // Initialize the building entry
          buildings[key] = {
            powerConsumed: requirement.powerConsumed || 0,
            powerProduced: requirement.powerProduced || 0,
          }
        } else {
          // Accumulate power values if the building already exists
          buildings[key].powerConsumed += requirement.powerConsumed || 0
          buildings[key].powerProduced += requirement.powerProduced || 0
        }
      }
    )
  })
  // Calculate total power consumed and produced
  let totalPowerConsumed = 0
  let totalPowerProduced = 0

  Object.values(buildings).forEach(building => {
    totalPowerConsumed += building.powerConsumed
    totalPowerProduced += building.powerProduced
  })

  return { totalPowerConsumed, totalPowerProduced }
}
