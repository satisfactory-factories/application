import vuetify from '@/plugins/vuetify'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LoadSaveDialog from './LoadSaveDialog.vue'
import { useAppStore } from '@/stores/app-store'
import { loadSaveFixture } from '@/utils/game-save/fixtures'
import eventBus from '@/utils/eventBus'

describe('Component: LoadSaveDialog', () => {
  let subject: ReturnType<typeof mount> | null = null

  const open = () => {
    subject = mount(LoadSaveDialog, {
      props: { modelValue: true },
      global: { plugins: [vuetify] },
      attachTo: document.body,
    })
    return subject
  }
  const find = (testId: string) => document.querySelector<HTMLElement>(`[data-testid="${testId}"]`)

  // jsdom has no Worker, so this reads on the test's own thread through the same fallback a
  // browser without workers takes.
  const chooseFile = async (file: File) => {
    const input = find('load-save-input') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    input.dispatchEvent(new Event('change'))
    await vi.waitFor(() => expect(useAppStore().getCurrentTab()?.recipeUnlocks?.save).toBeTruthy(), { timeout: 10_000 })
    await flushPromises()
  }

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    subject?.unmount()
    subject = null
  })

  it('keeps the save\'s session name and its unlocked alternates on the plan', async () => {
    open()
    await chooseFile(new File([loadSaveFixture('vanilla')], 'Vanilla_autosave_0.sav'))

    const save = useAppStore().getCurrentTab()?.recipeUnlocks?.save
    expect(save?.name).toBe('Vanilla')
    // A fresh world has bought no hard drives.
    expect(save?.alternates).toEqual([])
  })

  it('says what was loaded, and closes', async () => {
    const toast = vi.fn()
    eventBus.on('toast', toast)
    const dialog = open()

    await chooseFile(new File([loadSaveFixture('vanilla')], 'Vanilla.sav'))

    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }))
    expect(dialog.emitted('update:modelValue')?.at(-1)).toEqual([false])
    eventBus.off('toast', toast)
  })

  it('reports a file that is not a save, and keeps the plan as it was', async () => {
    open()
    const input = find('load-save-input') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [new File(['not a save'], 'notes.sav')], configurable: true })
    input.dispatchEvent(new Event('change'))

    await vi.waitFor(() => expect(find('load-save-error')).not.toBeNull())
    expect(find('load-save-error')!.textContent).toBe('That save is not compatible. It is not a Satisfactory save file.')
    expect(useAppStore().getCurrentTab()?.recipeUnlocks).toBeUndefined()
  })

  it('forgets a loaded save, marks and all', async () => {
    useAppStore().getCurrentTab()!.recipeUnlocks = {
      save: { name: 'Old', readAt: '2026-10-15T00:00:00.000Z', alternates: ['Alternate_Screw'] },
      overrides: { Alternate_Wire_1: true },
    }
    open()
    await flushPromises()

    find('forget-save')!.click()
    await flushPromises()

    expect(useAppStore().getCurrentTab()?.recipeUnlocks).toEqual({ save: null, overrides: {} })
  })
})
