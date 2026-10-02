import vuetify from '@/plugins/vuetify'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PlannerFactoryPager from './PlannerFactoryPager.vue'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { newFactory } from '@/utils/factory-management/factory'
import { OVERVIEW } from '@/utils/factory-management/planner-view'

const iron = { id: 'g1', name: 'Iron Works', color: '#ff0000', order: 0 }
const copper = { id: 'g2', name: 'Copper', color: '#00ff00', order: 1 }

const grouped = (name: string, id: number, group?: typeof iron): Factory => {
  const factory = newFactory(name, id, id)
  if (group) factory.group = group
  return factory
}

const mountPager = (props: {
  direction: 'previous' | 'next',
  target: Factory | typeof OVERVIEW,
  from: Factory | null,
}) => mount(PlannerFactoryPager, {
  props,
  global: { plugins: [vuetify] },
})

const caption = (subject: ReturnType<typeof mountPager>) =>
  subject.find('.pager-caption').text()

describe('Component: PlannerFactoryPager', () => {
  it('names the factory it goes to', () => {
    const subject = mountPager({ direction: 'next', target: grouped('Rods', 2), from: grouped('Ingots', 1) })

    expect(subject.find('.pager-title').text()).toContain('Rods')
    expect(caption(subject)).toBe('Next factory')
  })

  it('says when the next factory is in the same group', () => {
    const subject = mountPager({
      direction: 'next',
      target: grouped('Rods', 2, iron),
      from: grouped('Ingots', 1, iron),
    })

    expect(caption(subject)).toBe('Next in Iron Works')
    expect(subject.find('[data-testid="factory-pager-group"]').text()).toBe('Iron Works')
  })

  // The pane has nothing else to mark a group boundary, so crossing one is said out loud.
  it('says when the factory starts a different group', () => {
    const subject = mountPager({
      direction: 'previous',
      target: grouped('Wire', 2, copper),
      from: grouped('Rods', 3, iron),
    })

    expect(caption(subject)).toBe('Previous group: Copper')
  })

  it('leads back to the overview from the first factory', () => {
    const subject = mountPager({ direction: 'previous', target: OVERVIEW, from: grouped('Ingots', 1) })

    expect(caption(subject)).toBe('Back to the plan overview')
    expect(subject.find('.pager-title').text()).toContain('Overview')
    expect(subject.find('[data-testid="factory-pager-group"]').exists()).toBe(false)
  })

  it('leads into the plan from the overview', () => {
    const subject = mountPager({ direction: 'next', target: grouped('Ingots', 1, iron), from: null })

    expect(caption(subject)).toBe('First factory')
  })

  it('asks to go to its target when clicked', async () => {
    const target = grouped('Rods', 2)
    const subject = mountPager({ direction: 'next', target, from: grouped('Ingots', 1) })

    await subject.find('[data-testid="factory-pager-next"]').trigger('click')

    expect(subject.emitted('go')).toEqual([[target]])
  })
})
