import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UNGROUPED_ID } from '@/utils/factory-management/factory-groups'

const STORAGE_KEY = 'factoryGroupsCollapsed'

// The module holds its state at module scope — one store shared by both mounted sidebars and the
// planner — so each test imports it fresh, which is also the only way to exercise what it reads
// back from storage on load.
const load = async (plan = 'tab-1') => {
  vi.resetModules()
  const collapse = (await import('@/composables/useGroupCollapse')).useGroupCollapse()
  collapse.usePlan(plan)
  return collapse
}

beforeEach(() => localStorage.clear())
afterEach(() => localStorage.clear())

describe('useGroupCollapse', () => {
  it('collapses and expands by group id, Ungrouped included', async () => {
    const { isCollapsed, setCollapsed, toggleCollapsed } = await load()

    expect(isCollapsed('g1')).toBe(false)
    setCollapsed('g1', true)
    expect(isCollapsed('g1')).toBe(true)

    // Ungrouped is synthesised and has no id of its own, so it keys off the sentinel.
    toggleCollapsed(null)
    expect(isCollapsed(null)).toBe(true)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({ 'tab-1': ['g1', UNGROUPED_ID] })
  })

  it('survives a reload without going near the plan', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ 'tab-1': ['g1'] }))
    const { isCollapsed } = await load()

    expect(isCollapsed('g1')).toBe(true)
    expect(isCollapsed('g2')).toBe(false)
  })

  it('shrugs off storage it cannot read, and discards the old unnamespaced shape', async () => {
    localStorage.setItem(STORAGE_KEY, 'not json')
    expect((await load()).isCollapsed('g1')).toBe(false)

    // An array cannot be attributed to a plan, so it is dropped rather than adopted by the first.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['g1']))
    expect((await load()).isCollapsed('g1')).toBe(false)
  })

  // The whole point of the namespacing: a copied plan keeps its group ids, and Ungrouped has none.
  describe('per plan', () => {
    it('keeps two plans apart, even for the same group id', async () => {
      const collapse = await load('tab-1')
      collapse.setCollapsed('g1', true)
      collapse.setCollapsed(null, true)

      collapse.usePlan('tab-2')

      expect(collapse.isCollapsed('g1')).toBe(false)
      expect(collapse.isCollapsed(null)).toBe(false)

      collapse.usePlan('tab-1')
      expect(collapse.isCollapsed('g1')).toBe(true)
    })

    it('does not write anything until a plan is named', async () => {
      vi.resetModules()
      const { isCollapsed, setCollapsed } = (await import('@/composables/useGroupCollapse')).useGroupCollapse()

      setCollapsed('g1', true)

      expect(isCollapsed('g1')).toBe(false)
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    })
  })

  describe('what is mounted', () => {
    // The point of the whole composable: a collapse must not tear down the factory cards, because
    // rebuilding forty of them is what made a large group take seconds to reopen.
    it('keeps a group mounted once it has been on screen', async () => {
      const { isMounted, setCollapsed } = await load()

      setCollapsed('g1', true)

      expect(isMounted('g1')).toBe(true)
    })

    it('leaves a group shut at load unmounted until it is opened', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ 'tab-1': ['g1'] }))
      const { isMounted, setCollapsed } = await load()

      expect(isMounted('g1')).toBe(false)

      setCollapsed('g1', false)
      expect(isMounted('g1')).toBe(true)

      // And it stays mounted from then on.
      setCollapsed('g1', true)
      expect(isMounted('g1')).toBe(true)
    })

    it('applies that per plan too, so switching tabs does not mount a shut group', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ 'tab-1': [], 'tab-2': ['g1'] }))
      const collapse = await load('tab-1')

      expect(collapse.isMounted('g1')).toBe(true)

      collapse.usePlan('tab-2')
      expect(collapse.isMounted('g1')).toBe(false)
    })
  })

  it('forgets a deleted group rather than leaving its id in storage', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ 'tab-1': ['g1', 'g2'] }))
    const { forgetGroup, isCollapsed, isMounted } = await load()

    forgetGroup('g1')

    expect(isCollapsed('g1')).toBe(false)
    expect(isMounted('g1')).toBe(true)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({ 'tab-1': ['g2'] })
  })
})
