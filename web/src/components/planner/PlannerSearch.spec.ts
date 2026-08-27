import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { fireEvent } from '@testing-library/vue'
import { createTestingPinia } from '@pinia/testing'
import PlannerSearch from './PlannerSearch.vue'
import { vuetifyRender } from '@/utils/ui-test-bootstrap'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { addInputToFactory } from '@/utils/factory-management/inputs'
import { gameData } from '@/utils/gameData'
import eventBus from '@/utils/eventBus'

// The route is only read to decide whether the planner is on screen to receive the jump; the
// component is mounted on its own here, so there is no router to ask.
const push = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/' }),
  useRouter: () => ({ push }),
}))

const buildPlan = (): Factory[] => {
  const smelter = newFactory('Ingot Smelter', 0, 1)
  addProductToFactory(smelter, { id: 'IronIngot', amount: 240, recipe: 'IngotIron' })

  const plates = newFactory('Plate Works', 1, 2)
  addProductToFactory(plates, { id: 'IronPlate', amount: 120, recipe: 'IronPlate' })
  addInputToFactory(plates, { factoryId: smelter.id, outputPart: 'IronIngot', amount: 180 })

  const plan = [smelter, plates]
  calculateFactories(plan, gameData)
  return plan
}

// The menu teleports its panel to the body, so everything is read from there.
const body = () => document.body
const rows = () => [...body().querySelectorAll<HTMLElement>('.result-row')]
const rowLabels = () => rows().map(row => [
  row.querySelector('.row-name')?.textContent?.trim(),
  row.querySelector('.row-usage')?.textContent?.replace(/\s+/g, ' ').trim(),
].filter(Boolean).join(' — '))
const headings = () =>
  [...body().querySelectorAll('.group-heading, .role-heading')]
    .map(heading => heading.textContent?.trim())

// The search runs a beat behind the keystroke — see the debounce in PlannerSearch.
const settle = async () => {
  await new Promise(resolve => setTimeout(resolve, 250))
  await nextTick()
}

// Part names come from the game data store, which the default testing Pinia stubs out.
const renderSearch = (factories: Factory[]) =>
  vuetifyRender(PlannerSearch, {
    props: { factories },
    pinia: createTestingPinia({ stubActions: false }),
  })

const search = async (term: string, factories = buildPlan()) => {
  renderSearch(factories)
  const input = body().querySelector<HTMLInputElement>('#planner-search-field')!
  await fireEvent.click(input)
  await fireEvent.update(input, term)
  await settle()
}

describe('PlannerSearch', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    push.mockClear()
    vi.spyOn(eventBus, 'emit')
  })

  it('renders the search bar in the tab bar', () => {
    renderSearch(buildPlan())

    expect(body().querySelector('#planner-search-field')).toBeTruthy()
  })

  it('says what it searches before anything is typed', async () => {
    renderSearch(buildPlan())
    await fireEvent.click(body().querySelector('#planner-search-field')!)
    await nextTick()

    expect(body().textContent).toContain('Type a factory name')
  })

  it('finds a factory by name', async () => {
    await search('plate wo')

    expect(headings()).toContain('Factories')
    expect(rowLabels()).toContain('Plate Works')
  })

  it('lists a part\'s factories production first, then its other usage', async () => {
    await search('iron ingot')

    expect(headings()).toEqual(expect.arrayContaining(['Production', 'Other usage']))
    expect(rowLabels()).toEqual(expect.arrayContaining([
      'Ingot Smelter — Produces 240/min',
      'Plate Works — Imports 180/min',
    ]))
  })

  it('says so when nothing in the plan matches', async () => {
    await search('plutonium')

    expect(body().textContent).toContain('Nothing in this plan matches')
    expect(rows()).toHaveLength(0)
  })

  it('jumps to the product row when a production result is clicked', async () => {
    await search('iron ingot')
    await fireEvent.click(rows().find(row => row.textContent?.includes('Ingot Smelter'))!)

    expect(eventBus.emit).toHaveBeenCalledWith('jumpToFactory', {
      factoryId: 1,
      targets: ['1-products-item-IronIngot'],
      fallback: '1-products',
    })
  })

  it('jumps to the import row when an import result is clicked', async () => {
    await search('iron ingot')
    await fireEvent.click(rows().find(row => row.textContent?.includes('Plate Works'))!)

    expect(eventBus.emit).toHaveBeenCalledWith('jumpToFactory', {
      factoryId: 2,
      targets: ['2-import-1-IronIngot'],
      fallback: '2-imports',
    })
  })

  it('jumps to the factory itself when a name result is clicked', async () => {
    await search('plate wo')
    await fireEvent.click(rows()[0])

    expect(eventBus.emit).toHaveBeenCalledWith('jumpToFactory', {
      factoryId: 2,
      targets: [],
      fallback: undefined,
    })
  })

  it('walks the results with the arrow keys and opens one with Enter', async () => {
    await search('iron ingot')
    const input = body().querySelector<HTMLInputElement>('#planner-search-field')!

    await fireEvent.keyDown(input, { key: 'ArrowDown' })
    await nextTick()
    expect(rows()[1].classList).toContain('active')

    await fireEvent.keyDown(input, { key: 'Enter' })

    expect(eventBus.emit).toHaveBeenCalledWith('jumpToFactory', expect.objectContaining({
      factoryId: 2,
    }))
  })
})
