import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AdoptionDialog from './AdoptionDialog.vue'
import vuetify from '@/plugins/vuetify'
import { useAppStore } from '@/stores/app-store'
import { useRoomsStore } from '@/stores/rooms-store'
import { newFactory } from '@/utils/factory-management/factory'

// v-dialog teleports its content to the body, so everything is read from there.
const body = () => document.body
const rows = () => [...body().querySelectorAll<HTMLElement>('[data-testid="adoption-candidate"]')]
const boxes = () => rows().map(row => row.querySelector('input') as HTMLInputElement)
const ticked = () => rows().map(row => row.querySelector('.v-selection-control--dirty') !== null)

const toggle = async (index: number) => {
  const input = boxes()[index]
  input.checked = !input.checked
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}

describe('AdoptionDialog', () => {
  let appStore: ReturnType<typeof useAppStore>
  let roomsStore: ReturnType<typeof useRoomsStore>
  let pinia: ReturnType<typeof createPinia>

  const addLocalTab = (name: string): string => {
    const id = crypto.randomUUID()
    appStore.addTab({ id, name, factories: [newFactory('Iron', 0)] }, { activate: false })
    return id
  }

  const open = async (names: string[]) => {
    const ids = names.map(name => addLocalTab(name))
    roomsStore.adoptionCandidates = ids
    roomsStore.adoptionOpen = true

    const wrapper = mount(AdoptionDialog, {
      global: { plugins: [vuetify, pinia] },
      attachTo: document.body,
    })
    await flushPromises()
    return { wrapper, ids }
  }

  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
    vi.clearAllMocks()
    pinia = createPinia()
    setActivePinia(pinia)

    appStore = useAppStore()
    roomsStore = useRoomsStore()
  })

  it('asks about syncing rather than about keeping things local', async () => {
    await open(['Alpha'])

    expect(body().textContent).toContain('Sync your planner tabs now?')
  })

  // The e2e suite reaches the dialog by this id, and the shared shell teleports its
  // content, so the id has to survive the trip out to the body.
  it('carries the dialog id the e2e suite anchors on', async () => {
    await open(['Alpha'])

    const dialog = body().querySelector('[data-testid="adoption-dialog"]')
    expect(dialog?.querySelector('[data-testid="adopt-submit"]')).not.toBeNull()
    expect(dialog?.querySelector('[data-testid="adoption-candidate"]')).not.toBeNull()
  })

  it('counts a one-factory plan in the singular', async () => {
    await open(['Alpha'])

    expect(rows()[0].textContent).toContain('Alpha (1 factory)')
  })

  it('starts with every plan chosen, because keeping them is the usual answer', async () => {
    await open(['Alpha', 'Beta'])

    expect(ticked()).toEqual([true, true])
    expect(boxes().map(box => box.checked)).toEqual([true, true])
  })

  it('unticks the box the user clicks and leaves the others alone', async () => {
    await open(['Alpha', 'Beta'])

    await toggle(0)

    expect(ticked()).toEqual([false, true])
    expect(boxes().map(box => box.checked)).toEqual([false, true])
  })

  it('ticks a box back on', async () => {
    await open(['Alpha', 'Beta'])

    await toggle(0)
    await toggle(0)

    expect(ticked()).toEqual([true, true])
  })

  it('submits only the plans still ticked', async () => {
    const adoptTabs = vi.spyOn(roomsStore, 'adoptTabs').mockResolvedValue()
    const { ids } = await open(['Alpha', 'Beta', 'Gamma'])

    await toggle(1)
    const submit = body().querySelector<HTMLElement>('[data-testid="adopt-submit"]')
    submit?.click()
    await flushPromises()

    expect(adoptTabs).toHaveBeenCalledWith([ids[0], ids[2]])
  })

  it('counts what is ticked on the button', async () => {
    await open(['Alpha', 'Beta'])

    expect(body().querySelector('[data-testid="adopt-submit"]')?.textContent).toContain('Sync 2 plan')

    await toggle(0)

    expect(body().querySelector('[data-testid="adopt-submit"]')?.textContent).toContain('Sync 1 plan')
  })

  it('will not submit with nothing ticked', async () => {
    await open(['Alpha'])

    await toggle(0)

    const submit = body().querySelector<HTMLElement>('[data-testid="adopt-submit"]')
    expect(submit?.querySelector('button')?.disabled ?? (submit as HTMLButtonElement).disabled).toBe(true)
  })

  it('draws the tick in the app primary colour rather than plain white', async () => {
    await open(['Alpha'])

    const wrapper = rows()[0].querySelector('.v-selection-control__wrapper')
    expect(wrapper?.className).toContain('text-primary')
  })

  /**
   * The same dialog answers two questions: the sweep of everything this browser
   * holds, at sign-in, and one plan that has just landed in it. The plural reads
   * badly for the second, and the second is the one a pasted plan raises.
   */
  describe('one plan that has just landed', () => {
    const openLanded = async () => {
      const result = await open(['Pasted from prod'])
      roomsStore.adoptionReason = 'landed'
      await flushPromises()
      return result
    }

    it('asks about that plan in the singular', async () => {
      await openLanded()

      expect(body().textContent).toContain('Send this plan to your account?')
      expect(body().textContent).toContain('This plan lives only in this browser')
      expect(body().textContent).not.toContain('These plans live only in this browser')
    })

    it('points at tab settings for the way back, not the plus button', async () => {
      await openLanded()

      expect(body().textContent).toContain('send it up any time from tab settings')
    })

    it('still asks in the plural for the sign-in sweep', async () => {
      await open(['Alpha', 'Beta'])

      expect(body().textContent).toContain('Sync your planner tabs now?')
      expect(body().textContent).toContain('These plans live only in this browser')
    })
  })

  it('leaves every plan local when declined, and remembers the answer', async () => {
    const decline = vi.spyOn(roomsStore, 'declineAdoption')
    await open(['Alpha'])

    body().querySelector<HTMLElement>('[data-testid="adopt-decline"]')?.click()
    await flushPromises()

    // remember=true: the store persists the answer so refreshes stop asking.
    expect(decline).toHaveBeenCalledWith(true)
  })
})
