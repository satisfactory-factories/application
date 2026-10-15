import vuetify from '@/plugins/vuetify'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { VAutocomplete } from 'vuetify/components'
import RecipePicker from './RecipePicker.vue'

const mountPicker = (part: string, modelValue: string) => mount(RecipePicker, {
  props: { part, modelValue },
  global: { plugins: [vuetify] },
})

describe('Component: RecipePicker', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('lists the standard recipe first, then alternates best tier first', () => {
    const items = mountPicker('Wire', 'Wire').findComponent(VAutocomplete).props('items') as any[]

    expect(items.map(item => [item.name, item.tier ?? null])).toEqual([
      ['Wire', null],
      ['Caterium Wire', 'B'],
      ['Fused Wire', 'B'],
      ['Iron Wire', 'C'],
    ])
  })

  it('keeps the full game name searchable, so "alt" finds alternates', () => {
    const items = mountPicker('Wire', 'Wire').findComponent(VAutocomplete).props('items') as any[]

    expect(items.find(item => item.value === 'Alternate_FusedWire')?.title).toBe('Alternate: Fused Wire')
  })

  it('shows the Alt tag and tier badge on a selected alternate', () => {
    const subject = mountPicker('Wire', 'Alternate_FusedWire')

    expect(subject.text()).toContain('Fused Wire')
    expect(subject.find('[data-testid="recipe-alt-tag"]').exists()).toBe(true)
    expect(subject.find('[data-testid="recipe-tier-B"]').attributes('title')).toBe('B tier: Highly recommended')
  })

  it('shows no tags on a standard recipe', () => {
    const subject = mountPicker('Wire', 'Wire')

    expect(subject.find('[data-testid="recipe-alt-tag"]').exists()).toBe(false)
    expect(subject.find('[data-testid^="recipe-tier-"]').exists()).toBe(false)
  })

  it('fades the tags out while the field is focused, and back in after', async () => {
    const subject = mountPicker('Wire', 'Alternate_FusedWire')
    const tags = () => subject.find('.recipe-picker-selection-tags')

    expect(tags().classes()).not.toContain('hidden')
    subject.findComponent(VAutocomplete).vm.$emit('update:focused', true)
    await subject.vm.$nextTick()
    expect(tags().classes()).toContain('hidden')
    subject.findComponent(VAutocomplete).vm.$emit('update:focused', false)
    await subject.vm.$nextTick()
    expect(tags().classes()).not.toContain('hidden')
  })
})
