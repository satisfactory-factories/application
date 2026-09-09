import { Factory } from '@/interfaces/planner/FactoryInterface'
import { TemplatePlan } from '@/utils/factory-setups/template-plan'
// `-data` rather than sharing this module's name: vite resolves `.json` before `.ts`, so a
// sibling maels-big-boi-plan.json would be what every bare import of this module got.
import planData from '@/utils/factory-setups/maels-big-boi-plan-data.json'

// To update the plan: press "Export plan" in the planner, copy to clipboard, and paste it over the whole
// of the -data.json file. Nothing else needs doing — the blob's other keys (name,
// plannerVersion, groups) are simply not read here, so it goes in exactly as it comes out.
//
// It is kept as JSON rather than a hand-maintained TypeScript literal because it is a snapshot
// of a real save, not code. Cast because the enum-valued fields (building group type, power
// producer `updated`) arrive as their string values.
const bigBoiPlan = planData.factories as unknown as Factory[]

export const createMaelsBigBoiPlan = (): TemplatePlan => {
  return {
    getFactories: () => bigBoiPlan,
    powerTarget: planData.powerTarget,
  }
}
