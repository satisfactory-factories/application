import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import CopyPlanDialog from './CopyPlanDialog.vue'
import vuetify from '@/plugins/vuetify'

// The dialog teleports its content out of the wrapper, so everything is read from
// the body, exactly as a person sees it.
const body = () => document.body
const at = (testId: string) => body().querySelector<HTMLElement>(`[data-testid="${testId}"]`)

describe('CopyPlanDialog', () => {
  const render = () => mount(CopyPlanDialog, {
    global: { plugins: [vuetify] },
    props: { modelValue: true },
    attachTo: document.body,
  })

  beforeEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  it('offers both ways out of the planner', () => {
    render()

    expect(at('copy-to-file')).not.toBeNull()
    expect(at('copy-to-clipboard')).not.toBeNull()
  })

  it('says what each one gives you', () => {
    render()

    expect(at('copy-to-file')?.textContent).toContain('.json')
    expect(at('copy-to-clipboard')?.textContent).toContain('clipboard')
  })

  it.each([
    ['copy-to-file', 'file'],
    ['copy-to-clipboard', 'clipboard'],
  ])('emits the choice behind %s', async (testId, choice) => {
    const wrapper = render()

    at(testId)!.click()
    await flushPromises()

    expect(wrapper.emitted('choose')?.at(-1)).toEqual([choice])
  })

  // The cards are the whole dialog, and a v-card with a click handler is not a button:
  // without this a keyboard cycles straight past both choices to Cancel.
  it.each(['copy-to-file', 'copy-to-clipboard'])('puts %s in the tab order as a button', testId => {
    render()

    expect(at(testId)?.getAttribute('role')).toBe('button')
    expect(at(testId)?.getAttribute('tabindex')).toBe('0')
  })

  it('takes a choice from the keyboard too', async () => {
    const wrapper = render()

    at('copy-to-file')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flushPromises()

    expect(wrapper.emitted('choose')?.at(-1)).toEqual(['file'])
  })

  it('closes without choosing anything', async () => {
    const wrapper = render()

    const cancel = [...body().querySelectorAll('button')].find(button => button.textContent?.includes('Cancel'))
    cancel!.click()
    await flushPromises()

    expect(wrapper.emitted('choose')).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })
})
