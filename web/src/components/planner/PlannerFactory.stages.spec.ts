import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import vuetify from '@/plugins/vuetify'
import PlannerFactory from './PlannerFactory.vue'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { newFactory } from '@/utils/factory-management/factory'

const stubs = {
  FactoryDebug: true,
  FactoryGroupTray: true,
  FactoryIconDialog: true,
  FactoryIconDisplay: true,
  FactoryStatusChips: true,
  ProductsAndPower: true,
  FactoryImports: true,
  PlannerFactorySatisfaction: true,
  PlannerFactoryTasks: true,
  PlannerFactoryNotes: true,
  GameAsset: true,
}

/**
 * The planner fades a factory in once the top of the card is ready, so the sections below it
 * wait for `revealRest` and then arrive a stage per frame. Every other caller gets the whole
 * card at once.
 */
describe('Component: PlannerFactory (render stages)', () => {
  let factory: Factory

  const mountSubject = (revealRest?: boolean) =>
    mount(PlannerFactory, {
      props: { factory, totalFactories: 1, ...(revealRest === undefined ? {} : { revealRest }) },
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

  const sections = (subject: ReturnType<typeof mountSubject>) => ({
    products: subject.findComponent({ name: 'ProductsAndPower' }).exists(),
    imports: subject.findComponent({ name: 'FactoryImports' }).exists(),
    satisfaction: subject.findComponent({ name: 'PlannerFactorySatisfaction' }).exists(),
    tasks: subject.findComponent({ name: 'PlannerFactoryTasks' }).exists(),
  })

  beforeEach(() => {
    setActivePinia(createPinia())
    factory = reactive(newFactory('Iron Ingots', 0, 1))
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      setTimeout(() => callback(performance.now()), 0)
      return 0
    })
  })

  it('renders the whole card at once by default, and says so', () => {
    const subject = mountSubject()

    expect(sections(subject)).toEqual({ products: true, imports: true, satisfaction: true, tasks: true })
    expect(subject.emitted('rendered')).toHaveLength(1)
  })

  it('holds back everything below the products until told to reveal it', async () => {
    const subject = mountSubject(false)
    await flushPromises()

    expect(sections(subject)).toEqual({ products: true, imports: false, satisfaction: false, tasks: false })
    expect(subject.emitted('rendered')).toBeUndefined()
  })

  it('mounts the rest once revealed, then reports the card rendered', async () => {
    const subject = mountSubject(false)
    await subject.setProps({ revealRest: true })

    await vi.waitFor(() => expect(subject.emitted('rendered')).toHaveLength(1))
    expect(sections(subject)).toEqual({ products: true, imports: true, satisfaction: true, tasks: true })
  })
})
