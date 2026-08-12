import { Factory } from '@/interfaces/planner/FactoryInterface'
import { TemplatePlan } from '@/utils/factory-setups/template-plan'
// `-data` rather than sharing this module's name: vite resolves `.json` before `.ts`, so a
// sibling maels-big-boi-plan.json would be what every bare import of this module got.
import planData from '@/utils/factory-setups/maels-big-boi-plan-data.json'

// The plan data is an exported plan, kept verbatim as JSON rather than hand-maintained as a
// TypeScript literal — it is a snapshot of a real save, not code. Cast because the enum-valued
// fields (building group type, power producer `updated`) arrive as their string values.
const bigBoiPlan = planData.factories as unknown as Factory[]

export const createMaelsBigBoiPlan = (): TemplatePlan => {
  return {
    getFactories: () => bigBoiPlan,
    powerTarget: planData.powerTarget,
  }
}
