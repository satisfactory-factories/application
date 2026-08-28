import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import vuetify from '@/plugins/vuetify'
import PlannerFactory from './PlannerFactory.vue'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { newFactory } from '@/utils/factory-management/factory'
import eventBus from '@/utils/eventBus'

/**
 * Only the card header is under test, so everything below it is stubbed: the point is
 * which events the header's own handlers emit, not what the sections render.
 */
const stubs = {
  FactoryDebug: true,
  FactoryGroupTray: true,
  FactoryIconDialog: true,
  FactoryIconDisplay: true,
  FactoryStatusChips: true,
  ProductsAndPower: true,
  PlannerFactorySatisfaction: true,
  PlannerFactoryTasks: true,
  PlannerFactoryNotes: true,
  Imports: true,
  RawResources: true,
  GameAsset: true,
}

describe('Component: PlannerFactory', () => {
  let factory: Factory

  const mountSubject = () =>
    mount(PlannerFactory, {
      props: { factory, helpText: false, totalFactories: 1 },
      global: {
        plugins: [vuetify],
        stubs,
        provide: {
          findFactory: () => factory,
          copyFactory: () => {},
          deleteFactory: () => {},
          moveFactory: () => {},
          navigateToFactory: () => {},
          updateFactory: () => {},
          activeFactoryId: { value: null },
          navigateToSection: () => {},
        },
      },
    })

  const buttonTitled = (subject: ReturnType<typeof mountSubject>, title: string) =>
    subject.findAll('button').find(button => button.attributes('title') === title)

  beforeEach(() => {
    setActivePinia(createPinia())
    factory = reactive(newFactory('Iron Ingots', 0, 1))
    vi.spyOn(eventBus, 'emit').mockClear()
  })

  it('writes a typed name onto the factory', async () => {
    const subject = mountSubject()

    await subject.find('input.factory-name').setValue('Steel Beams')

    expect(factory.name).toBe('Steel Beams')
  })

  // Sync treats `factoryEdited` as the user's intent and a rebase only carries touched
  // factories over, so without this an unsent rename is discarded by every recovery path.
  it('records a rename as user intent, not as a recalculation ripple', async () => {
    const subject = mountSubject()

    await subject.find('input.factory-name').setValue('Steel Beams')

    expect(eventBus.emit).toHaveBeenCalledWith('factoryUpdated', factory)
    expect(eventBus.emit).toHaveBeenCalledWith('factoryEdited', factory)
  })

  // What a collaborator's op looks like from here: the field changes underneath us. Counting
  // that as intent would make this client overlay its copy of the factory for ever.
  it('does not claim intent when the name is rewritten from outside', async () => {
    const subject = mountSubject()
    vi.mocked(eventBus.emit).mockClear()

    factory.name = 'Arrived over the wire'
    await nextTick()

    expect(subject.find<HTMLInputElement>('input.factory-name').element.value).toBe('Arrived over the wire')
    expect(eventBus.emit).not.toHaveBeenCalledWith('factoryEdited', factory)
  })

  it('collapsing the card is an edit, because the flag is stored with the plan', async () => {
    const subject = mountSubject()

    await buttonTitled(subject, 'Collapse Factory')?.trigger('click')

    expect(factory.hidden).toBe(true)
    expect(eventBus.emit).toHaveBeenCalledWith('factoryEdited', factory)
  })

  it('expanding it again is too', async () => {
    factory.hidden = true
    const subject = mountSubject()

    await buttonTitled(subject, 'Expand Factory')?.trigger('click')

    expect(factory.hidden).toBe(false)
    expect(eventBus.emit).toHaveBeenCalledWith('factoryEdited', factory)
  })

  it('does not claim intent when a peer collapses the card', async () => {
    const subject = mountSubject()
    vi.mocked(eventBus.emit).mockClear()

    factory.hidden = true
    await nextTick()

    expect(subject.exists()).toBe(true)
    expect(eventBus.emit).not.toHaveBeenCalledWith('factoryEdited', factory)
  })
})
