/**
 * The plan blob shared by "copy plan", "paste plan" and the wizard's backup download.
 *
 * The tab id is deliberately absent: restoring replaces the current tab and keeps its own id.
 * Anything written here has to stay readable by the paste path, which is the only way back in.
 */
import { Factory } from '@/interfaces/planner/FactoryInterface'

export interface PlanBlob {
  name?: string
  factories: Factory[]
  powerTarget: number
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
