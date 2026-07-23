import { Factory } from '@/interfaces/planner/FactoryInterface'

// The shape every loadable template plan exports: its factories plus the plan-level
// settings that live on the factory tab rather than inside the factories (currently
// just the power target). Loading a template applies both — see Templates.vue.
export interface TemplatePlan {
  getFactories: () => Factory[]
  // The plan's grid generation target in MW (see usePowerTarget); 0 = no target.
  powerTarget: number
}
