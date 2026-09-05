import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ImportPlanDialog from './ImportPlanDialog.vue'
import vuetify from '@/plugins/vuetify'

const body = () => document.body
const at = (testId: string) => body().querySelector<HTMLElement>(`[data-testid="${testId}"]`)

describe('ImportPlanDialog', () => {
  const render = (props: Record<string, unknown> = {}) => mount(ImportPlanDialog, {
    global: { plugins: [vuetify] },
    props: { modelValue: true, ...props },
    attachTo: document.body,
  })

  beforeEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  it('offers both ways back in', () => {
    render()

    expect(at('import-from-file')).not.toBeNull()
    expect(at('import-from-clipboard')).not.toBeNull()
  })

  it('says up front that this replaces the tab you are on', () => {
    render()

    expect(at('import-plan-dialog')?.textContent).toContain('replaces the plan in the tab you are on')
  })

  /**
   * Reading the clipboard is a permission, and some browsers ask for it with a prompt
   * the planner can neither see nor explain afterwards. Saying so next to the button
   * that triggers it is the only place it helps.
   */
  it('warns that the browser may ask for the paste itself', () => {
    render()

    const clipboard = at('import-from-clipboard')?.textContent
    expect(clipboard).toContain('browser may ask you to confirm')
    expect(clipboard).toContain('Firefox')
  })

  it('asks for the clipboard when that half is chosen', async () => {
    const wrapper = render()

    at('import-from-clipboard')!.click()
    await flushPromises()

    expect(wrapper.emitted('clipboard')).toHaveLength(1)
    expect(wrapper.emitted('file')).toBeUndefined()
  })

  it('hands over the file the input was given', async () => {
    const wrapper = render()
    const input = at('import-file-input') as HTMLInputElement
    const file = new File(['{}'], 'plan.json', { type: 'application/json' })
    Object.defineProperty(input, 'files', { value: [file], configurable: true })

    input.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    expect(wrapper.emitted('file')?.at(-1)).toEqual([file])
  })

  // Same file twice in a row is a real thing to do (re-exported, re-imported), and a
  // file input fires no change event when its value has not moved.
  it('clears the input so the same file can be chosen twice', async () => {
    const wrapper = render()
    const input = at('import-file-input') as HTMLInputElement
    const file = new File(['{}'], 'plan.json', { type: 'application/json' })
    Object.defineProperty(input, 'files', { value: [file], configurable: true })

    input.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    expect(input.value).toBe('')
    expect(wrapper.emitted('file')).toHaveLength(1)
  })

  it('emits nothing when the file picker is dismissed', async () => {
    const wrapper = render()
    const input = at('import-file-input') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [], configurable: true })

    input.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    expect(wrapper.emitted('file')).toBeUndefined()
  })

  // The dialog is where the other way in still is, so a failure has to stay in it.
  it('shows the reason it was given, in the dialog', () => {
    render({ error: 'That does not look like a plan the planner wrote.' })

    expect(at('import-error')?.textContent).toContain('does not look like a plan')
  })

  it('shows nothing of the sort when there is no error', () => {
    render()

    expect(at('import-error')).toBeNull()
  })

  it('shuts both choices while an import is running', () => {
    render({ busy: true })

    for (const testId of ['import-from-file', 'import-from-clipboard']) {
      expect(at(testId)?.className).toContain('v-card--disabled')
      expect(at(testId)?.getAttribute('tabindex')).toBe('-1')
    }
  })
})
