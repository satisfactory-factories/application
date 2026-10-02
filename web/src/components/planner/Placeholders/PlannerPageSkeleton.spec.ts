import vuetify from '@/plugins/vuetify'
import { mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { describe, expect, it } from 'vitest'
import PlannerPageSkeleton from './PlannerPageSkeleton.vue'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { newFactory } from '@/utils/factory-management/factory'

const mountSkeleton = (factory: Factory | null) => mount(PlannerPageSkeleton, {
  props: { factory },
  global: { plugins: [vuetify, createTestingPinia()] },
})

// The chips' invisible labels, which are what size them to the real ones.
const chipLabels = (subject: ReturnType<typeof mountSkeleton>) =>
  subject.findAll('.flex-wrap .ghost-chip .ghost-text').map(label => label.text().replace(/\s/g, ' '))

describe('Component: PlannerPageSkeleton', () => {
  it('ghosts the chips the factory header will show, in its order', () => {
    const factory = newFactory('Copper Works', 1, 1)
    factory.notes = 'Remember the belts'
    factory.inSync = true
    factory.power = { ...factory.power, produced: 0, consumed: 440 }

    expect(chipLabels(mountSkeleton(factory))).toEqual(['See notes', 'In sync with game', '440 MW'])
  })

  it('offers to mark an unsynced factory, as the header does', () => {
    const factory = newFactory('Copper Works', 1, 1)
    factory.inSync = null

    expect(chipLabels(mountSkeleton(factory))).toEqual(['Mark as in sync with game'])
  })

  it('sizes the title and group chip from the factory', () => {
    const factory = newFactory('Copper Works', 1, 1)
    factory.group = { id: 'g1', name: 'Basics', color: '#ff0000', order: 0 }
    const subject = mountSkeleton(factory)

    expect(subject.find('.ghost-name .ghost-text').text()).toBe('Copper Works')
    expect(subject.find('.ghost-chip-tray .ghost-text').text()).toBe('Basics')
    expect(subject.find('.factory-card').classes()).toContain('grouped')
  })

  it('draws a generic outline for the overview', () => {
    const subject = mountSkeleton(null)

    expect(subject.find('.ghost-chip-tray .ghost-text').text()).toBe('Ungrouped')
    expect(subject.findAll('.ghost-row').length).toBeGreaterThan(0)
  })
})
