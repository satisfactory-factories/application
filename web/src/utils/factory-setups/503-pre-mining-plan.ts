import { Factory } from '@/interfaces/planner/FactoryInterface'
import { newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { addInputToFactory } from '@/utils/factory-management/inputs'
import { TemplatePlan } from '@/utils/factory-setups/template-plan'

/**
 * A plan built the way plans were before mining existed: nothing digs anything up, so every raw
 * resource it needs is now a shortage. Loading it re-arms the one-time breaking-change notice.
 *
 * Deliberately not the Simple template, which is two factories and has to stay that way. This one
 * is sized for a demo: seven factories short of seven different resources, and iron short in two
 * places at once so the wizard's one-mine-per-resource behaviour has something to show.
 */
export const create503PreMiningPlan = (): TemplatePlan => {
  const ironIngotFac = newFactory('Iron Ingots', 0, 1)
  const ironPlateFac = newFactory('Iron Plates', 1, 2)
  const steelFac = newFactory('Steel Works', 2, 3)
  const concreteFac = newFactory('Concrete', 3, 4)
  const copperFac = newFactory('Copper Basics', 4, 5)
  const plasticFac = newFactory('Plastics', 5, 6)
  const aluminaFac = newFactory('Alumina Solution', 6, 7)

  const factories: Factory[] = [
    ironIngotFac, ironPlateFac, steelFac, concreteFac, copperFac, plasticFac, aluminaFac,
  ]

  ironIngotFac.icon = 'iron-ingot'
  ironPlateFac.icon = 'iron-plate'
  steelFac.icon = 'steel-beam'
  concreteFac.icon = 'concrete'
  copperFac.icon = 'wire'
  plasticFac.icon = 'plastic'
  aluminaFac.icon = 'alumina-solution'

  const addProducts = () => {
    // Iron is short in two places on purpose: the wizard builds ONE mine for it, sized to both.
    addProductToFactory(ironIngotFac, { id: 'IronIngot', amount: 300, recipe: 'IngotIron' })
    addProductToFactory(ironPlateFac, { id: 'IronPlate', amount: 200, recipe: 'IronPlate' })

    addProductToFactory(steelFac, { id: 'SteelIngot', amount: 240, recipe: 'IngotSteel' })
    addProductToFactory(steelFac, { id: 'SteelPipe', amount: 120, recipe: 'SteelPipe' })

    addProductToFactory(concreteFac, { id: 'Cement', amount: 300, recipe: 'Concrete' })

    addProductToFactory(copperFac, { id: 'CopperIngot', amount: 200, recipe: 'IngotCopper' })
    addProductToFactory(copperFac, { id: 'Wire', amount: 200, recipe: 'Wire' })

    addProductToFactory(plasticFac, { id: 'Plastic', amount: 300, recipe: 'Plastic' })

    // Bauxite and Water together, so the wizard has one row defaulting to a shared mine and one
    // defaulting to on-site extraction in the same factory.
    addProductToFactory(aluminaFac, { id: 'AluminaSolution', amount: 240, recipe: 'AluminaSolution' })
  }

  const addImports = () => {
    addInputToFactory(ironPlateFac, {
      factoryId: ironIngotFac.id,
      outputPart: 'IronIngot',
      amount: 300,
    })
  }

  addProducts()
  addImports()

  return {
    getFactories: () => factories,
    // No generators in it, so any positive target would flag it as a permanent deficit.
    powerTarget: 0,
  }
}
