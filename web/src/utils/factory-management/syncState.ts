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

  checkFactorySyncState(factory)
}

export const checkFactorySyncState = (factory: Factory) => {
  // Early return for completely empty factories - nothing to sync
  if (!factory.products.length && !factory.powerProducers.length) {
    factory.inSync = false
    return
  }

  // Check if factory is fuel-only (no products but has power producers AND no product sync state)
  const isFuelOnlyFactory = factory.products.length === 0 && factory.powerProducers.length > 0 && Object.keys(factory.syncState).length === 0

  // If the number of products differs from syncState, mark as out of sync
  // Exception: fuel-only factories legitimately have no products but should remain in sync
  if (factory.products.length !== Object.keys(factory.syncState).length) {
    if (!isFuelOnlyFactory) {
      factory.inSync = false
    }
  }

  // Check product sync state
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

  // Check power producer sync state
  // If all power producers have been deleted, mark factory as out of sync
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

// Legacy function exports for backwards compatibility
export const checkProductSyncState = (factory: Factory) => {
  checkFactorySyncState(factory)
}

export const checkPowerProducerSyncState = (factory: Factory) => {
  checkFactorySyncState(factory)
}
