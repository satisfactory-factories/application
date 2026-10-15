import vuetify from '@/plugins/vuetify'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { VAutocomplete } from 'vuetify/components'
import RecipePicker from './RecipePicker.vue'
import { useAppStore } from '@/stores/app-store'

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

  describe('with a save loaded', () => {
    let opened: ReturnType<typeof mount> | null = null

    // Opened, so the list rows render; they are teleported, so they are read from the document.
    const openPicker = (modelValue: string) => {
      opened = mount(RecipePicker, {
        props: { part: 'Wire', modelValue },
        attrs: { menu: true },
        global: { plugins: [vuetify] },
        attachTo: document.body,
      })
      return opened
    }
    const lock = (recipe: string) => document.querySelector<HTMLElement>(`[data-testid="recipe-lock-${recipe}"]`)
    const row = (recipe: string) => document.querySelector(`[data-recipe="${recipe}"] .recipe-picker-row`)

    const loadSave = (alternates: string[]) => {
      useAppStore().getCurrentTab()!.recipeUnlocks = {
        save: { name: 'My World', readAt: '2026-10-15T00:00:00.000Z', alternates },
        overrides: {},
      }
    }

    afterEach(() => {
      opened?.unmount()
      opened = null
    })

    it('shows no padlocks until a save is loaded', async () => {
      openPicker('Wire')
      await opened!.vm.$nextTick()

      expect(document.querySelector('[data-testid^="recipe-lock-"]')).toBeNull()
    })

    it('no longer ticks the selected recipe', async () => {
      openPicker('Wire')
      await opened!.vm.$nextTick()

      expect(document.querySelector('.recipe-picker-check')).toBeNull()
    })

    it('padlocks and greys out an alternate the save has not unlocked', async () => {
      loadSave(['Alternate_FusedWire'])
      openPicker('Wire')
      await opened!.vm.$nextTick()

      expect(lock('Alternate_Wire_2')?.classList).toContain('locked')
      expect(row('Alternate_Wire_2')?.classList).toContain('locked')
      expect(lock('Alternate_FusedWire')?.classList).not.toContain('locked')
      // Standard recipes are never locked, so they carry no padlock to click.
      expect(lock('Wire')).toBeNull()
    })

    it('marks a locked alternate unlocked by hand without selecting it', async () => {
      loadSave([])
      const subject = openPicker('Wire')
      await subject.vm.$nextTick()

      lock('Alternate_Wire_2')!.click()
      await subject.vm.$nextTick()

      expect(useAppStore().getCurrentTab()?.recipeUnlocks?.overrides).toEqual({ Alternate_Wire_2: true })
      expect(lock('Alternate_Wire_2')?.classList).not.toContain('locked')
      expect(subject.emitted('update:modelValue')).toBeUndefined()
    })

    it('padlocks the field itself when the chosen recipe is locked', () => {
      loadSave([])
      const subject = mountPicker('Wire', 'Alternate_Wire_2')

      expect(subject.find('[data-testid="recipe-selection-locked"]').exists()).toBe(true)
    })
  })
})
