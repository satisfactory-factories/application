import vuetify from '@/plugins/vuetify'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GameOptionsDialog from './GameOptionsDialog.vue'
import { useAppStore } from '@/stores/app-store'
import { loadSaveFixture } from '@/utils/game-save/fixtures'
import eventBus from '@/utils/eventBus'

describe('Component: GameOptionsDialog', () => {
  let subject: ReturnType<typeof mount> | null = null

  const find = (testId: string) => document.querySelector<HTMLElement>(`[data-testid="${testId}"]`)

  const open = async () => {
    subject = mount(GameOptionsDialog, { global: { plugins: [vuetify] }, attachTo: document.body })
    await subject.find('[data-testid="game-options"]').trigger('click')
    await flushPromises()
    return subject
  }

  const tab = () => useAppStore().getCurrentTab()!

  // jsdom has no Worker, so this reads on the test's own thread through the same fallback a
  // browser without workers takes.
  const chooseFile = async (file: File) => {
    const input = find('load-save-input') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    input.dispatchEvent(new Event('change'))
  }

  const loaded = (overrides: Record<string, boolean> = {}) => ({
    save: { name: 'Old', readAt: '2026-10-15T00:00:00.000Z', recipes: ['Alternate_Screw'], buildings: ['blender'], tiers: [1, 2] },
    overrides,
  })

  // The app store restores its tabs from localStorage, so a save one test loads would reach the next.
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    subject?.unmount()
    subject = null
  })

  it('keeps the save\'s session name, unlocked recipes, buildings and tiers on the plan', async () => {
    await open()
    await chooseFile(new File([loadSaveFixture('vanilla')], 'Vanilla_autosave_0.sav'))
    await vi.waitFor(() => expect(tab().recipeUnlocks?.save).toBeTruthy(), { timeout: 10_000 })

    const save = tab().recipeUnlocks?.save
    expect(save?.name).toBe('Vanilla')
    // A fresh world has bought no hard drives, but it can already make Iron Plate.
    expect(save?.recipes).toContain('IronPlate')
    expect(save?.recipes).not.toContain('Alternate_Screw')
    expect(save?.buildings.length).toBeGreaterThan(0)
    expect(save?.tiers).toEqual([])
  })

  it('says what was loaded, and stays open on the save', async () => {
    const toast = vi.fn()
    eventBus.on('toast', toast)
    await open()

    await chooseFile(new File([loadSaveFixture('vanilla')], 'Vanilla.sav'))
    await vi.waitFor(() => expect(find('loaded-save')).not.toBeNull(), { timeout: 10_000 })

    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }))
    eventBus.off('toast', toast)
  })

  it('says a file is not compatible, and why, keeping the plan as it was', async () => {
    await open()
    await chooseFile(new File(['not a save'], 'notes.sav'))

    await vi.waitFor(() => expect(find('load-save-error')).not.toBeNull())
    expect(find('load-save-error')!.textContent).toBe('That save is not compatible. It is not a Satisfactory save file.')
    expect(tab().recipeUnlocks).toBeUndefined()
  })

  it('asks for a save before listing alternates', async () => {
    await open()

    expect(find('alternates-need-save')).not.toBeNull()
    expect(find('alternate-list')).toBeNull()
  })

  it('lists the alternates, and clicking one marks it by hand', async () => {
    tab().recipeUnlocks = loaded()
    await open()

    const row = (id: string) => document.querySelector<HTMLElement>(`[data-recipe="${id}"]`)
    expect(row('Alternate_Screw')?.classList).not.toContain('locked')
    expect(row('Alternate_Wire_1')?.classList).toContain('locked')

    row('Alternate_Wire_1')!.click()
    await flushPromises()

    expect(tab().recipeUnlocks?.overrides).toEqual({ Alternate_Wire_1: true })
    expect(row('Alternate_Wire_1')?.classList).not.toContain('locked')
  })

  it('shows the tiers the save has reached', async () => {
    tab().recipeUnlocks = loaded()
    await open()

    const reached = [...find('loaded-save-tiers')!.querySelectorAll('.tier-chip.reached')].map(chip => chip.textContent)
    expect(reached).toEqual(['1', '2'])
  })

  it('forgets a loaded save, marks and all', async () => {
    tab().recipeUnlocks = loaded({ Alternate_Wire_1: true })
    await open()

    find('forget-save')!.click()
    await flushPromises()

    expect(tab().recipeUnlocks).toEqual({ save: null, overrides: {} })
  })
})
