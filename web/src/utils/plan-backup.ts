/**
 * The plan blob shared by "copy plan", "paste plan" and the wizard's backup download.
 *
 * The tab id is deliberately absent: restoring replaces the current tab and keeps its own id.
 * Anything written here has to stay readable by the paste path, which is the only way back in.
 */
import { Factory, FactoryGroup } from '@/interfaces/planner/FactoryInterface'

export interface PlanBlob {
  name?: string
  factories: Factory[]
  powerTarget: number
  // Groups with no member factory to carry them. Every other group rides on its factories and
  // needs nothing here; these exist only in the tab, so without this a copied or backed-up plan
  // loses them. Absent means a blob written before this, or a plan that has none.
  groups?: FactoryGroup[]
  // Whether this plan has been answered for the raw-resources change. Absent means it predates
  // it, which is the correct reading of every backup taken before v0.6.
  plannerVersion?: string
  // How far the plan's save has taken the MAM's Depot research. Absent means fully researched,
  // so a blob that dropped these would silently hand a tier-0 plan 16x the upload speed.
  depotUploadTier?: number
  depotExpansionTier?: number
}

export const serializePlan = (blob: PlanBlob): string => JSON.stringify(blob)

const fileNameFor = (name: string | undefined, now: Date): string => {
  const slug = (name ?? 'plan').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `satisfactory-${slug || 'plan'}-${now.toISOString().slice(0, 10)}.json`
}

export const downloadPlan = (blob: PlanBlob, now = new Date()) => {
  const url = URL.createObjectURL(new Blob([serializePlan(blob)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileNameFor(blob.name, now)
  link.click()
  URL.revokeObjectURL(url)
}
