import { Factory } from '@/interfaces/planner/FactoryInterface'
import { TemplatePlan } from '@/utils/factory-setups/template-plan'
// `-data` rather than sharing this module's name: vite resolves `.json` before `.ts`, so a
// sibling complex-demo-plan.json would be what every bare import of this module got.
import planData from '@/utils/factory-setups/complex-demo-plan-data.json'

/**
 * The Demo plan, as shipped to anyone who picks "Load the demo plan".
 *
 * To update it: build the plan in the planner, press "Export plan" and copy to clipboard, then paste over
 * the whole of the -data.json file. Nothing else needs doing — the blob's other keys (name,
 * plannerVersion, groups) are simply not read here, so it goes in exactly as it comes out.
 *
 * It was a hand-written TypeScript builder until v0.6. That made it a second implementation of
 * the planner's own construction logic, which had to be kept in step with every engine change,
 * and it could only express what the builder functions exposed — a real save can hold anything
 * the app can produce. Same shape as maels-big-boi-plan now.
 *
 * Cast because the enum-valued fields (building group type, power producer `updated`) arrive as
 * their string values.
 *
 * What the plan deliberately leaves broken, so the planner has something to show:
 *   - Copper Basics is short of Copper Ingots, and over-produces Cable by 40.
 *   - Uranium Power has no supplier for Stators, High-Speed Connectors or Encased Beams.
 *   - Alien Power is short 10/min of Alien Power Matrix across its two fueled augmenters.
 *   - Plutonium Processing is short of Silica, Nitric Acid and Sulfuric Acid: a half-built branch.
 *   - Oil Processing keeps a Heavy Oil Residue surplus, which would block the line untreated.
 *   - Singularity Cells has no supplier for any of its four ingredients: another half-built branch.
 *     Its output feeds the Portal Hub, whose ten Main Portals are custom buildings — 2.5 GW and
 *     20 Singularity Cells a minute for a factory that produces nothing at all.
 */
export const complexDemoPlan = (): TemplatePlan => {
  return {
    // Cloned per call. Unlike the MegaPlan this is loaded, edited and reloaded in the same
    // session, and every spec that touches it calculates over the result — a shared array would
    // hand the next caller whatever the last one left behind.
    getFactories: () => structuredClone(planData.factories) as unknown as Factory[],
    // 40 GW: comfortably above the plan's generation, so the demo also shows off the
    // power-target (bullseye) deficit feature.
    powerTarget: planData.powerTarget,
  }
}
