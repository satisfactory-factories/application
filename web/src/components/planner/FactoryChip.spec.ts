import vuetify from '@/plugins/vuetify'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import FactoryChip from './FactoryChip.vue'
import { newFactory } from '@/utils/factory-management/factory'

const render = (props: Record<string, unknown> = {}) => mount(FactoryChip, {
  props: { factory: newFactory('Phase Three', 0, 2), ...props },
  global: { plugins: [vuetify] },
})

describe('FactoryChip', () => {
  it('draws no tick when checklist mode is off', () => {
    const wrapper = render()

    expect(wrapper.find('input.checklist-tick').exists()).toBe(false)
    expect(wrapper.text()).toContain('Phase Three')
  })

  it('draws the tick inside the chip, in its checked state', () => {
    const wrapper = render({ checked: true, desynced: true })
    const tick = wrapper.find('.v-chip input.checklist-tick')

    expect(tick.exists()).toBe(true)
    expect((tick.element as HTMLInputElement).checked).toBe(true)
    expect(tick.classes()).toContain('desynced')
  })

  // The tick, the chip and the jump button share one chip, so each click has to reach only its
  // own handler: a tick that also opened the calculator was #592.
  it('a tick click toggles without opening the chip', async () => {
    const wrapper = render({ checked: false })

    await wrapper.find('input.checklist-tick').trigger('click')

    expect(wrapper.emitted('toggle')).toHaveLength(1)
    expect(wrapper.emitted('open')).toBeUndefined()
  })

  it('a jump click jumps without opening the chip', async () => {
    const wrapper = render({ checked: false })

    await wrapper.find('.chip-jump-btn').trigger('click')

    expect(wrapper.emitted('jump')).toHaveLength(1)
    expect(wrapper.emitted('open')).toBeUndefined()
    expect(wrapper.emitted('toggle')).toBeUndefined()
  })

  it('a click on the chip itself opens it', async () => {
    const wrapper = render({ checked: false })

    await wrapper.find('.v-chip').trigger('click')

    expect(wrapper.emitted('open')).toHaveLength(1)
  })

  it('renders the slot in place of the name', () => {
    const wrapper = mount(FactoryChip, {
      props: { factory: newFactory('Phase Three', 0, 2) },
      slots: { default: '<b>Phase Three</b>: 900/min' },
      global: { plugins: [vuetify] },
    })

    expect(wrapper.text()).toContain('Phase Three: 900/min')
  })

  // Every reference to a factory carries its group's colour on its left edge; an ungrouped one gets
  // a neutral grey, so the chip is the same shape either way.
  it("wears the factory's group colour, or grey when ungrouped", () => {
    const factory = newFactory('Phase Three', 0, 2)
    expect(render({ factory }).find('.v-chip').attributes('style')).toContain('--group-color: #6c6c6c')

    factory.group = { id: 'g1', name: 'Smelting', color: '#e57373', order: 0 }
    const wrapper = render({ factory })
    expect(wrapper.find('.v-chip').attributes('style')).toContain('--group-color: #e57373')
    expect(wrapper.find('.v-chip').attributes('title')).toBe('Group: Smelting')
  })

  it('leaves the jump button off when it is not jumpable', () => {
    expect(render({ jumpable: false }).find('.chip-jump-btn').exists()).toBe(false)
  })
})
