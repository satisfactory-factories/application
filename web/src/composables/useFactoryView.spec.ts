import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OVERVIEW } from '@/utils/factory-management/planner-view'

const STORAGE_KEY = 'plannerView'

// Module-scope state, so each test imports it fresh — which is also the only way to exercise what
// it reads back from storage on load.
const load = async (plan = 'tab-1') => {
  vi.resetModules()
  const view = (await import('@/composables/useFactoryView')).useFactoryView()
  view.usePlan(plan)
  return view
}

beforeEach(() => localStorage.clear())
afterEach(() => localStorage.clear())

describe('useFactoryView', () => {
  it('starts on the overview', async () => {
    const { view } = await load()

    expect(view.value).toBe(OVERVIEW)
  })

  it('remembers the open factory across a reload', async () => {
    const first = await load()
    first.setView(7)

    const second = await load()

    expect(second.view.value).toBe(7)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({ 'tab-1': 7 })
  })

  // Factory ids are only unique within a plan, so one plan's open factory must not open another's.
  it('keeps each plan to its own view', async () => {
    const subject = await load('tab-1')
    subject.setView(7)

    subject.usePlan('tab-2')
    expect(subject.view.value).toBe(OVERVIEW)
    subject.setView(3)

    subject.usePlan('tab-1')
    expect(subject.view.value).toBe(7)
  })

  it('discards stored views it cannot read', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ 'tab-1': 'nonsense', 'tab-2': 4 }))

    const subject = await load('tab-1')
    expect(subject.view.value).toBe(OVERVIEW)

    subject.usePlan('tab-2')
    expect(subject.view.value).toBe(4)
  })

  it('survives a corrupt stored value', async () => {
    localStorage.setItem(STORAGE_KEY, '{not json')

    const { view } = await load()

    expect(view.value).toBe(OVERVIEW)
  })
})
