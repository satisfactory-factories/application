import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { VTooltip } from 'vuetify/components'
import vuetify from '@/plugins/vuetify'
import Tooltip from './tooltip.vue'

/**
 * A factory carries around a hundred of these, so the overlay behind each one is only mounted
 * the first time it is hovered or focused.
 */
describe('Component: tooltip', () => {
  const mountSubject = (props: { text: string, disabled?: boolean }) =>
    mount(Tooltip, {
      props,
      slots: { default: '<button>Go</button>' },
      global: { plugins: [vuetify] },
      attachTo: document.body,
    })

  it('mounts no overlay until it is hovered', () => {
    const subject = mountSubject({ text: 'A hint' })

    expect(subject.find('button').exists()).toBe(true)
    expect(subject.findComponent(VTooltip).exists()).toBe(false)
    subject.unmount()
  })

  it('opens on hover and closes when the pointer leaves', async () => {
    const subject = mountSubject({ text: 'A hint' })

    await subject.find('span').trigger('mouseenter')
    expect(subject.findComponent(VTooltip).props('modelValue')).toBe(true)

    await subject.find('span').trigger('mouseleave')
    expect(subject.findComponent(VTooltip).props('modelValue')).toBe(false)
    subject.unmount()
  })

  it('opens on keyboard focus too', async () => {
    const subject = mountSubject({ text: 'A hint' })

    await subject.find('button').trigger('focusin')
    expect(subject.findComponent(VTooltip).props('modelValue')).toBe(true)
    subject.unmount()
  })

  it('stays shut while disabled', async () => {
    const subject = mountSubject({ text: 'A hint', disabled: true })

    await subject.find('span').trigger('mouseenter')
    expect(subject.findComponent(VTooltip).exists()).toBe(false)
    subject.unmount()
  })
})
