import { afterEach, describe, expect, it, vi } from 'vitest'
import { newFactory } from '@/utils/factory-management/factory'
import { downloadPlan, serializePlan } from '@/utils/plan-backup'

describe('plan-backup', () => {
  const blob = () => ({
    name: "Mael's MegaPlan!",
    factories: [newFactory('Iron', 0, 1)],
    powerTarget: 2500,
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // The paste path reads this shape; anything else is a backup that can't be restored.
  it('serializes the shape the paste path reads', () => {
    const parsed = JSON.parse(serializePlan(blob()))

    expect(Object.keys(parsed).sort()).toEqual(['factories', 'name', 'powerTarget'])
    expect(parsed.factories[0].name).toBe('Iron')
    expect(parsed.powerTarget).toBe(2500)
  })

  // Every other group rides on a factory; these exist only on the tab, so the blob is the only
  // thing that can carry them out and back.
  it('carries memberless groups when the plan has them', () => {
    const groups = [{ id: 'g1', name: 'Empty', color: '#4caf50', order: 0 }]
    const parsed = JSON.parse(serializePlan({ ...blob(), groups }))

    expect(parsed.groups).toEqual(groups)
  })

  // Absent reads as fully researched, so a backup that dropped these restores the plan at
  // sixteen times the upload speed it was written against.
  it('carries the Depot research the plan was written against', () => {
    const parsed = JSON.parse(serializePlan({ ...blob(), depotUploadTier: 0, depotExpansionTier: 2 }))

    expect(parsed.depotUploadTier).toBe(0)
    expect(parsed.depotExpansionTier).toBe(2)
  })

  it('names the file after the plan and the day', () => {
    const link = document.createElement('a')
    const click = vi.spyOn(link, 'click').mockImplementation(() => {})
    vi.spyOn(document, 'createElement').mockReturnValue(link)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:plan')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    downloadPlan(blob(), new Date('2026-08-08T22:15:00Z'))

    expect(link.download).toBe('satisfactory-mael-s-megaplan-2026-08-08.json')
    expect(click).toHaveBeenCalledOnce()
  })

  it('falls back to a usable name when the tab has none', () => {
    const link = document.createElement('a')
    vi.spyOn(link, 'click').mockImplementation(() => {})
    vi.spyOn(document, 'createElement').mockReturnValue(link)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:plan')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    downloadPlan({ ...blob(), name: undefined }, new Date('2026-08-08T22:15:00Z'))

    expect(link.download).toBe('satisfactory-plan-2026-08-08.json')
  })
})
