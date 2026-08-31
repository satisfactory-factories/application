import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import ToastNotification from './ToastNotification.vue'
import vuetify from '@/plugins/vuetify'

/**
 * The snackbar teleports to <body>, so everything is asserted against the document
 * rather than the wrapper's own subtree.
 */
const body = () => document.body.innerHTML

const find = (selector: string) => document.querySelector(selector)

describe('ToastNotification', () => {
  const render = (props: Record<string, unknown>) =>
    mount(ToastNotification, {
      props: { modelValue: true, message: 'Something happened', ...props },
      global: { plugins: [vuetify] },
      attachTo: document.body,
    })

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('draws the draining bar for a timed toast and closes itself when it runs out', async () => {
    const wrapper = render({ variant: 'timed', duration: 4000 })
    await nextTick()

    const bar = find('[data-testid="toast-timer"]') as HTMLElement | null
    expect(bar).not.toBeNull()
    expect(bar?.style.animationDuration).toBe('4000ms')
    expect(body()).toContain('Something happened')

    vi.advanceTimersByTime(3999)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    vi.advanceTimersByTime(1)
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })

  it('waits to be dismissed when it is permanent, and shows no bar', async () => {
    const wrapper = render({ variant: 'permanent', duration: 1000 })
    await nextTick()

    expect(find('[data-testid="toast-timer"]')).toBeNull()
    expect(find('[data-testid="toast-dismiss"]')).not.toBeNull()

    vi.advanceTimersByTime(60_000)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    ;(find('[data-testid="toast-dismiss"]') as HTMLElement).click()
    await nextTick()

    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })

  it('keeps the planner\'s existing toast exactly as it was: timed out, and no bar', async () => {
    const wrapper = render({ duration: 3000 })
    await nextTick()

    expect(find('[data-testid="toast-timer"]')).toBeNull()
    expect(find('[data-testid="toast-dismiss"]')).toBeNull()

    vi.advanceTimersByTime(3000)
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })

  it('restarts the timer when the same notice arrives again', async () => {
    const wrapper = render({ variant: 'timed', duration: 4000, sequence: 1 })
    await nextTick()

    vi.advanceTimersByTime(3000)
    await wrapper.setProps({ sequence: 2 })

    vi.advanceTimersByTime(3000)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    vi.advanceTimersByTime(1000)
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })

  it('never runs a timer for a toast that is not showing', async () => {
    const wrapper = render({ modelValue: false, variant: 'timed', duration: 1000 })
    await nextTick()

    vi.advanceTimersByTime(60_000)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})
