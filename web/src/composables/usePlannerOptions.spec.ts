import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

// Module scope means the ref is built on first import and reads localStorage as it goes, so each
// case has to seed storage before pulling in a fresh copy of the module.
const load = async () => {
  vi.resetModules()
  return (await import('@/composables/usePlannerOptions')).usePlannerOptions()
}

describe('usePlannerOptions', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('should hide group internal products until asked otherwise', async () => {
    const options = await load()

    expect(options.value.showInternalGroupProducts).toBe(false)
  })

  it('should show the group product row by default', async () => {
    const options = await load()

    expect(options.value.showGroupProducts).toBe(true)
  })

  it('should leave group power off until asked for', async () => {
    const options = await load()

    expect(options.value.showGroupPower).toBe(false)
  })

  it('should restore what was stored', async () => {
    localStorage.setItem('plannerOptions', JSON.stringify({ showInternalGroupProducts: true }))
    const options = await load()

    expect(options.value.showInternalGroupProducts).toBe(true)
  })

  it('should persist a change', async () => {
    const options = await load()
    options.value.showInternalGroupProducts = true
    await nextTick()

    expect(JSON.parse(localStorage.getItem('plannerOptions')!)).toEqual({
      showGroupProducts: true,
      showInternalGroupProducts: true,
      showGroupPower: false,
      balanceTolerancePercent: 1,
    })
  })

  // Whatever else is in there, the planner still has to draw. A single bad key must not take the
  // rest of the settings down with it, and nothing here is worth throwing over.
  it.each([
    ['not json', 'nonsense{'],
    ['an array', '[]'],
    ['a bare string', '"true"'],
    ['a wrongly typed key', '{"showInternalGroupProducts":"yes"}'],
  ])('should fall back to the defaults given %s', async (_label, stored) => {
    localStorage.setItem('plannerOptions', stored)
    const options = await load()

    expect(options.value.showInternalGroupProducts).toBe(false)
  })

  it('should keep a known key when an unknown one sits beside it', async () => {
    localStorage.setItem('plannerOptions', JSON.stringify({
      showInternalGroupProducts: true,
      somethingARetiredVersionWrote: 42,
    }))
    const options = await load()

    expect(options.value.showInternalGroupProducts).toBe(true)
    expect('somethingARetiredVersionWrote' in options.value).toBe(false)
  })

  // A setting added after someone last used the app has no entry in their stored object, and
  // must take its default rather than arriving undefined.
  it('should default a key the stored object predates', async () => {
    localStorage.setItem('plannerOptions', JSON.stringify({ showInternalGroupProducts: true }))
    const options = await load()

    expect(options.value.showGroupProducts).toBe(true)
    expect(options.value.showGroupPower).toBe(false)
  })

  it('should default the balance tolerance to 1%', async () => {
    const options = await load()

    expect(options.value.balanceTolerancePercent).toBe(1)
  })

  it('should keep a stored tolerance that is in range', async () => {
    localStorage.setItem('plannerOptions', JSON.stringify({ balanceTolerancePercent: 5 }))
    const options = await load()

    expect(options.value.balanceTolerancePercent).toBe(5)
  })

  // typeof alone passes all of these, and a zero or negative tolerance would paint every plan
  // red with nothing on screen to say why.
  it.each([
    ['zero', 0],
    ['negative', -1],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['absurdly large', 5000],
  ])('should reject a %s tolerance', async (_label, stored) => {
    localStorage.setItem('plannerOptions', JSON.stringify({ balanceTolerancePercent: stored }))
    const options = await load()

    expect(options.value.balanceTolerancePercent).toBe(1)
  })
})
