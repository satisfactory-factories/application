import { Factory } from '@/interfaces/planner/FactoryInterface'
import { newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { addInputToFactory } from '@/utils/factory-management/inputs'

// https://github.com/satisfactory-factories/application/issues/594
//
// The Quantum Encoder's Synthetic Power Shard recipe is the case the issue reports: it makes
// Power Shards (`CrystalShard`) as its main product, with Dark Matter Residue as an unavoidable
// byproduct. Named and shaped after the linked plan: 25/min of shards made, 10/min fed to the
// Power Augmenters, leaving a 15/min surplus with nowhere to go — the residue is a fluid (never
// sinkable), and the shards themselves cannot be sunk in game either, even though they are an
// ordinary solid.
export const create594Scenario = (): { getFactories: () => Factory[] } => {
  const shardFac = newFactory('Alen Power Factory', 0)
  const augmenterFac = newFactory('Power Augmenters', 1)

  const factories = [shardFac, augmenterFac]

  addProductToFactory(shardFac, {
    id: 'CrystalShard',
    amount: 25,
    recipe: 'SyntheticPowerShard',
  })

  addInputToFactory(augmenterFac, {
    factoryId: shardFac.id,
    outputPart: 'CrystalShard',
    amount: 10,
  })

  return {
    getFactories: () => factories,
  }
}
