import vuetify from '@/plugins/vuetify'
import { mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { describe, expect, it } from 'vitest'
import PlannerGroupBand from './PlannerGroupBand.vue'
import { newFactory } from '@/utils/factory-management/factory'

const group = { id: 'g1', name: 'Basics', color: '#ff0000', order: 0 }
const factories = ['Iron', 'Copper', 'Concrete'].map((name, index) => {
  const factory = newFactory(name, index, index + 1)
  factory.group = group
  return factory
})

const mountBand = (currentId: number) => mount(PlannerGroupBand, {
  props: { group, position: currentId, factories, currentId },
  global: { plugins: [vuetify, createTestingPinia()] },
})

describe('Component: PlannerGroupBand', () => {
  it('lists every factory in the group, in order', () => {
    const subject = mountBand(2)

    expect(subject.findAll('.band-factory').map(chip => chip.text())).toEqual(['Iron', 'Copper', 'Concrete'])
  })

  it('jumps to a factory when its chip is clicked', async () => {
    const subject = mountBand(2)

    await subject.find('[data-testid="group-band-factory-3"]').trigger('click')

    expect(subject.emitted('go')).toEqual([[factories[2]]])
  })

  it('marks the factory on screen and does not jump to it', async () => {
    const subject = mountBand(2)
    const current = subject.find('[data-testid="group-band-factory-2"]')

    await current.trigger('click')

    expect(current.classes()).toContain('band-factory-current')
    expect(subject.emitted('go')).toBeUndefined()
  })
})
