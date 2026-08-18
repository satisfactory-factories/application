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

  /**
   * Keyed by the producer's own id, NOT by its building.
   *
   * A factory can hold several producers of the same building: three geothermal generators on an
   * impure, a normal and a pure node, or a bank of coal generators at different clocks. Keying by
   * building collapsed all of them into one entry, and the count check below then compared three
   * producers against one key — so such a factory could never be marked in sync at all, whatever
   * the user did. Geothermal Power in the MegaPlan template was exactly that.
   */
  factory.powerProducers.forEach(powerProducer => {
    factory.syncStatePower[powerProducer.id] = {
      powerAmount: powerProducer.powerAmount,
      buildingAmount: powerProducer.buildingAmount,
      recipe: powerProducer.recipe,
      ingredientAmount: powerProducer.fuelAmount,
      building: powerProducer.building,
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
  // Only check factories that are currently marked as in sync - we only care about factories dropping OUT of sync
  if (!factory.inSync) {
    return
  }

  // Early return for completely empty factories - nothing to sync
  if (!factory.products.length && !factory.powerProducers.length) {
    factory.inSync = false
    return
  }

  // Step 1: Check if products or power producers no longer match their syncState object counts

  // Check if the number of products differs from syncState
  // Exception: fuel-only factories legitimately have no products but should remain in sync
  if (factory.products.length !== Object.keys(factory.syncState).length) {
    const isFuelOnlyFactory = factory.products.length === 0 && factory.powerProducers.length > 0 && Object.keys(factory.syncState).length === 0
    if (!isFuelOnlyFactory) {
      factory.inSync = false
      return // Count mismatch detected, no need to check individual items
    }
  }

  // Check if all power producers have been deleted
  if (!factory.powerProducers.length && Object.keys(factory.syncStatePower).length) {
    factory.inSync = false
    return
  }

  // Check if the number of power producers doesn't match (added or deleted)
  if (factory.powerProducers.length !== Object.keys(factory.syncStatePower).length) {
    factory.inSync = false
    return // Count mismatch detected, no need to check individual items
  }

  // Step 2: Check if the sync objects match current reality on a per-product and per-powerProducer basis

  // Check individual product sync state
  for (const product of factory.products) {
    // If the product has no syncState, skip.
    if (!factory.syncState[product.id]) {
      continue
    }

    // If the product has a sync state, check if the state has differed from the new product data.
    const syncState = factory.syncState[product.id]

    // If the sync state does not match the product amount, mark the factory as out of sync.
    if (syncState.amount !== product.amount) {
      factory.inSync = false
      return
    }

    // If the recipe has changed
    if (syncState.recipe !== product.recipe) {
      factory.inSync = false
      return
    }
  }

  // Check individual power producer sync state
  for (const powerProducer of factory.powerProducers) {
    // Plans marked in sync before producers were keyed by id carry building-keyed state, so fall
    // back to that rather than dropping every one of them out of sync on first open. Those plans
    // can only have one producer per building — a plan with two never held a usable state anyway.
    const syncState = factory.syncStatePower[powerProducer.id] ??
      factory.syncStatePower[powerProducer.building]

    // If no sync state, mark it OOS because the user may have swapped the power producer.
    if (!syncState) {
      factory.inSync = false
      return
    }

    // If the building itself was swapped for another. Only when the state records one: a plan
    // marked in sync before that was stored has nothing to compare, and an absent value must not
    // read as a change.
    if (syncState.building && syncState.building !== powerProducer.building) {
      factory.inSync = false
      return
    }

    // If building count doesn't match
    if (syncState.buildingAmount !== powerProducer.buildingAmount) {
      factory.inSync = false
      return
    }

    // If recipe doesn't match
    if (syncState.recipe !== powerProducer.recipe) {
      factory.inSync = false
      return
    }

    // If power amount doesn't match
    if (syncState.powerAmount !== powerProducer.powerAmount) {
      factory.inSync = false
      return
    }

    // If fuel ingredient amount doesn't match
    if (syncState.ingredientAmount !== powerProducer.fuelAmount) {
      factory.inSync = false
      return
    }
  }
}
