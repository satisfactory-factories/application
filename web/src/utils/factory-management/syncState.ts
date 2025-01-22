import { Factory } from '@/interfaces/planner/FactoryInterface'

export const calculateSyncState = (factory: Factory) => {
  // If factory has not been marked as in any form of sync, skip.
  if (factory.flags.inSync === null) {
    return
  }

  // Scan the products and determine if they are in sync with the syncState.
  // If there are no products, mark the factory out of sync, if already in sync.
  if (!factory.products.length) {
    if (factory.flags.inSync) {
      factory.flags.inSync = false
    }
  }

  // If the number of products is different from the syncState, mark the factory as out of sync.
  if (factory.products.length !== Object.keys(factory.syncState).length) {
    factory.flags.inSync = false
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
      factory.flags.inSync = false
    }

    // If the recipe has changed
    if (syncState.recipe !== product.recipe) {
      factory.flags.inSync = false
    }
  })
}
