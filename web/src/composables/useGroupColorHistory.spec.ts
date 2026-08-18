import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { groupPalette } from '@/utils/colors'

const STORAGE_KEY = 'factoryGroupCustomColors'

// Module scope state shared by every picker in the app, so each test imports it fresh — which is
// also the only way to exercise what it reads back from storage on load.
const load = async () => {
  vi.resetModules()
  return (await import('@/composables/useGroupColorHistory')).useGroupColorHistory()
}

beforeEach(() => localStorage.clear())
afterEach(() => localStorage.clear())

describe('useGroupColorHistory', () => {
  it('remembers a custom colour, most recent first', async () => {
    const { customColors, remember } = await load()

    remember('#8e44ad')
    remember('#16a085')

    expect(customColors.value).toEqual(['#16a085', '#8e44ad'])
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(['#16a085', '#8e44ad'])
  })

  it('moves a repeat pick back to the front rather than duplicating it', async () => {
    const { customColors, remember } = await load()

    remember('#8e44ad')
    remember('#16a085')
    remember('#8e44ad')

    expect(customColors.value).toEqual(['#8e44ad', '#16a085'])
  })

  // The presets have a row of their own; echoing them into the custom row is noise.
  it('ignores the palette', async () => {
    const { customColors, remember } = await load()

    remember(groupPalette[0].value)
    remember(groupPalette[0].value.toUpperCase())

    expect(customColors.value).toEqual([])
  })

  it('drops the alpha the colour picker appends', async () => {
    const { customColors, remember } = await load()

    remember('#8e44adff')

    expect(customColors.value).toEqual(['#8e44ad'])
  })

  it('caps the list rather than growing forever', async () => {
    const { customColors, remember } = await load()

    for (let index = 0; index < 20; index++) {
      remember(`#${index.toString(16).padStart(6, '0')}`)
    }

    expect(customColors.value).toHaveLength(12)
    // Newest kept, oldest dropped.
    expect(customColors.value[0]).toBe('#000013')
    expect(customColors.value).not.toContain('#000000')
  })

  it('survives a reload, and shrugs off storage it cannot read', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['#8e44ad', 42, 'nonsense']))
    expect((await load()).customColors.value).toEqual(['#8e44ad'])

    localStorage.setItem(STORAGE_KEY, 'not json')
    expect((await load()).customColors.value).toEqual([])
  })

  it('forgets everything when asked', async () => {
    const { customColors, forget, remember } = await load()

    remember('#8e44ad')
    forget()

    expect(customColors.value).toEqual([])
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
