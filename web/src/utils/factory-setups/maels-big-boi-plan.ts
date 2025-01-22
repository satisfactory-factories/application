import { Factory } from '@/interfaces/planner/FactoryInterface'
import { newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'

export const createMaelsBigBoiPlan = (): { getFactories: () => Factory[] } => {
  const concreteMegaFac = newFactory('Concrete Mega Fac', 0, 1)
  addProductToFactory(concreteMegaFac, {
    id: 'Cement',
    amount: 3840,
    recipe: 'Alternate_WetConcrete',
  })
  concreteMegaFac.notes = '6000 limestone currently fed\n36.666667x water extractors required'
  concreteMegaFac.tasks = [
    {
      title: 'Choose location',
      completed: true,
    },
    {
      title: 'Place Foundations',
      completed: true,
    },
    {
      title: 'Build',
      completed: true,
    },
    {
      title: 'Dismantle old fac',
      completed: true,
    },
    {
      title: 'Redirect old trains',
      completed: true,
    },
    {
      title: 'Add power breaker switch',
      completed: false,
    },
  ]

  return {
    getFactories: () => factories, // Expose factories as a method
  }
}
