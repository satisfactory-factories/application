import { Factory } from '@/interfaces/planner/FactoryInterface'

export const setSyncState = (factory: Factory) => {
  // Reset all state
  factory.syncState = {}
  factory.syncStatePower = {}

  // Get the current products of the factory and set them
  factory.products.forEach(product => {
    factory.syncState[product.id] = {
      amount: product.amount,
      recipe: product.recipe,
    }
  })

  // Get the current power producers of the factory and set them
  factory.powerProducers.forEach(powerProducer => {
    factory.syncStatePower[powerProducer.building] = {
      powerAmount: powerProducer.powerAmount,
      buildingAmount: powerProducer.buildingAmount,
      recipe: powerProducer.recipe,
      ingredientAmount: powerProducer.ingredientAmount,
    }
  })

  factory.inSync = true
}

export const calculateSyncState = (factory: Factory) => {
  // If factory has not been marked as in any form of sync, skip.
  if (factory.inSync === null) {
    return
  }

  checkProductSyncState(factory)
  checkPowerProducerSyncState(factory)
}

export const checkProductSyncState = (factory: Factory) => {
  // Scan the products and determine if they are in sync with the syncState.
  // If there are no products, mark the factory out of sync, if already in sync.
  // Exception: fuel-only factories (no products but have power producers) should remain in sync.
  if (!factory.products.length) {
    // Only mark as out of sync if this is not a fuel-only factory.
    // Fuel-only factories (coal plants, nuclear plants, etc.) legitimately have no products
    // but do have power producers. They consume fuel inputs and produce only power, not items.
    // We check if there are no power producers to distinguish between:
    // 1. A genuinely empty factory (should be out of sync)
    // 2. A fuel-only factory (should remain in sync)
    if (factory.inSync && !factory.powerProducers.length) {
      factory.inSync = false
    }
  }

  // If the number of products is different from the syncState, mark the factory as out of sync.
  // Exception: fuel-only factories can have 0 products and 0 syncState entries, which is valid.
  if (factory.products.length !== Object.keys(factory.syncState).length) {
    // Only mark as out of sync if this is not a valid fuel-only factory scenario.
    // A valid fuel-only factory has:
    // - 0 products (they don't produce items, only power)
    // - 0 syncState entries (no product sync state to track)
    // - 1+ power producers (coal plants, nuclear plants, biomass burners, etc.)
    // This condition allows fuel-only factories to remain in sync when they have
    // no products and no product sync state, which is their normal operational state.
    if (!(factory.products.length === 0 && Object.keys(factory.syncState).length === 0 && factory.powerProducers.length > 0)) {
      factory.inSync = false
    }
  }

  factory.products.forEach(product => {
    // If the product has no syncState, skip.
    if (!factory.syncState[product.id]) {
      return
    }

    // If the product has a sync state, check if the state has differed from the new product data.
    const syncState = factory.syncState[product.id]

    // If the sync state does not match the product amount, mark the factory as out of sync.
    if (syncState.amount !== product.amount) {
      factory.inSync = false
    }

    // If the recipe has changed
    if (syncState.recipe !== product.recipe) {
      factory.inSync = false
    }
  })
}

export const checkPowerProducerSyncState = (factory: Factory) => {
  // If all power producers have been deleted, OOS the factory.
  if (!factory.powerProducers.length && Object.keys(factory.syncStatePower).length) {
    factory.inSync = false
    return // Nothing else to do
  }

  // If the number of producers doesn't match (added or deleted)
  if (factory.powerProducers.length !== Object.keys(factory.syncStatePower).length) {
    factory.inSync = false
  }

  factory.powerProducers.forEach(powerProducer => {
    const syncState = factory.syncStatePower[powerProducer.building]

    // If no sync state, mark it OOS because the user may have swapped the power producer.
    if (!syncState) {
      factory.inSync = false
      return // Can't check anything else
    }

    // If building count doesn't match
    if (syncState.buildingAmount !== powerProducer.buildingAmount) {
      factory.inSync = false
    }

    // If recipe doesn't match
    if (syncState.recipe !== powerProducer.recipe) {
      factory.inSync = false
    }

    // If power amount doesn't match
    if (syncState.powerAmount !== powerProducer.powerAmount) {
      factory.inSync = false
    }

    // If fuel ingredient amount doesn't match
    if (syncState.ingredientAmount !== powerProducer.ingredientAmount) {
      factory.inSync = false
    }
  })
}
