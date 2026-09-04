import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { RoomListEntry } from 'common'
import PlanChooserDialog from './PlanChooserDialog.vue'
import vuetify from '@/plugins/vuetify'
import { useRoomsStore } from '@/stores/rooms-store'

// v-dialog teleports its content to the body, so everything is read from there.
const body = () => document.body
const rows = () => [...body().querySelectorAll<HTMLElement>('[data-testid="chooser-candidate"]')]
const boxes = () => rows().map(row => row.querySelector('input') as HTMLInputElement)
const ticked = () => rows().map(row => row.querySelector('.v-selection-control--dirty') !== null)

const toggle = async (index: number) => {
  const input = boxes()[index]
  input.checked = !input.checked
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}

const entry = (roomId: string, overrides: Partial<RoomListEntry> = {}): RoomListEntry => ({
  roomId,
  name: 'Plan',
  slug: null,
  shared: false,
  hasPassword: false,
  revision: 3,
  role: 'owner',
  order: 0,
  lastActivityAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  factoryCount: 2,
  ...overrides,
})

describe('PlanChooserDialog', () => {
  let roomsStore: ReturnType<typeof useRoomsStore>
  let pinia: ReturnType<typeof createPinia>

  const open = async (plans: RoomListEntry[]) => {
    for (const plan of plans) roomsStore.entries[plan.roomId] = plan
    roomsStore.chooserCandidates = plans.map(plan => plan.roomId)
    roomsStore.chooserOpen = true

    const wrapper = mount(PlanChooserDialog, {
      global: { plugins: [vuetify, pinia] },
      attachTo: document.body,
    })
    await flushPromises()
    return wrapper
  }

  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
    vi.clearAllMocks()
    pinia = createPinia()
    setActivePinia(pinia)

    roomsStore = useRoomsStore()
  })

  it('asks about opening plans, not about syncing anything up', async () => {
    await open([entry('room-1', { name: 'Alpha' })])

    expect(body().textContent).toContain('Open your cloud plans?')
  })

  // The e2e suite reaches the dialog by this id, and the shared shell teleports its
  // content, so the id has to survive the trip out to the body.
  it('carries the dialog id the e2e suite anchors on', async () => {
    await open([entry('room-1')])

    const dialog = body().querySelector('[data-testid="plan-chooser-dialog"]')
    expect(dialog?.querySelector('[data-testid="chooser-submit"]')).not.toBeNull()
    expect(dialog?.querySelector('[data-testid="chooser-candidate"]')).not.toBeNull()
  })

  it('shows each plan\'s name, size and last change', async () => {
    await open([entry('room-1', { name: 'Alpha', factoryCount: 3 })])

    const row = rows()[0]
    expect(row.textContent).toContain('Alpha')
    expect(row.querySelector('[data-testid="chooser-factory-count"]')?.textContent).toBe('3 factories')
    expect(row.querySelector('[data-testid="chooser-last-changed"]')?.textContent).toBe('5m ago')
  })

  it('counts a one-factory plan in the singular', async () => {
    await open([entry('room-1', { factoryCount: 1 })])

    expect(rows()[0].textContent).toContain('1 factory')
  })

  it('starts with every plan chosen, because opening them is the usual answer', async () => {
    await open([entry('room-1'), entry('room-2')])

    expect(ticked()).toEqual([true, true])
    expect(boxes().map(box => box.checked)).toEqual([true, true])
  })

  it('unticks the box the user clicks and leaves the others alone', async () => {
    await open([entry('room-1'), entry('room-2')])

    await toggle(0)

    expect(ticked()).toEqual([false, true])
    expect(boxes().map(box => box.checked)).toEqual([false, true])
  })

  it('submits only the plans still ticked', async () => {
    const openChosen = vi.spyOn(roomsStore, 'openChosenPlans').mockResolvedValue()
    await open([entry('room-1'), entry('room-2'), entry('room-3')])

    await toggle(1)
    body().querySelector<HTMLElement>('[data-testid="chooser-submit"]')?.click()
    await flushPromises()

    expect(openChosen).toHaveBeenCalledWith(['room-1', 'room-3'])
  })

  it('counts what is ticked on the button', async () => {
    await open([entry('room-1'), entry('room-2')])

    expect(body().querySelector('[data-testid="chooser-submit"]')?.textContent).toContain('Open 2 plans')

    await toggle(0)

    expect(body().querySelector('[data-testid="chooser-submit"]')?.textContent).toContain('Open 1 plan')
  })

  it('will not submit with nothing ticked', async () => {
    await open([entry('room-1')])

    await toggle(0)

    const submit = body().querySelector<HTMLElement>('[data-testid="chooser-submit"]')
    expect(submit?.querySelector('button')?.disabled ?? (submit as HTMLButtonElement).disabled).toBe(true)
  })

  it('"Not now" answers the chooser without opening anything', async () => {
    const close = vi.spyOn(roomsStore, 'closeChooser')
    const openChosen = vi.spyOn(roomsStore, 'openChosenPlans')
    await open([entry('room-1')])

    body().querySelector<HTMLElement>('[data-testid="chooser-decline"]')?.click()
    await flushPromises()

    // No argument: the default is a real answer, so the parked adoption offer runs.
    expect(close).toHaveBeenCalledWith()
    expect(openChosen).not.toHaveBeenCalled()
  })

  // Ticking or unticking a dozen plans one at a time is the difference between a
  // welcome and a chore, so both ends of the range are one click.
  describe('the bulk controls', () => {
    const press = async (testId: string) => {
      body().querySelector<HTMLElement>(`[data-testid="${testId}"]`)?.click()
      await flushPromises()
    }

    it('clears every tick with Select none', async () => {
      await open([entry('room-1'), entry('room-2')])

      await press('chooser-select-none')

      expect(ticked()).toEqual([false, false])
      expect(boxes().map(box => box.checked)).toEqual([false, false])
    })

    it('puts every tick back with Select all', async () => {
      await open([entry('room-1'), entry('room-2'), entry('room-3')])

      await press('chooser-select-none')
      await toggle(1)
      await press('chooser-select-all')

      expect(ticked()).toEqual([true, true, true])
    })

    it('submits what the buttons left behind', async () => {
      const openChosen = vi.spyOn(roomsStore, 'openChosenPlans').mockResolvedValue()
      await open([entry('room-1'), entry('room-2'), entry('room-3')])

      await press('chooser-select-none')
      await toggle(2)
      await press('chooser-submit')

      expect(openChosen).toHaveBeenCalledWith(['room-3'])
    })

    // Each one is spent at its own end of the range; a disabled button says so.
    it('disables whichever button would change nothing', async () => {
      await open([entry('room-1'), entry('room-2')])
      const button = (testId: string) =>
        body().querySelector<HTMLButtonElement>(`button[data-testid="${testId}"]`)

      expect(button('chooser-select-all')?.disabled).toBe(true)
      expect(button('chooser-select-none')?.disabled).toBe(false)

      await press('chooser-select-none')

      expect(button('chooser-select-all')?.disabled).toBe(false)
      expect(button('chooser-select-none')?.disabled).toBe(true)
    })

    it('leaves them off a single plan, which has no "all" to speak of', async () => {
      await open([entry('room-1')])

      expect(body().querySelector('[data-testid="chooser-select-all"]')).toBeNull()
      expect(body().querySelector('[data-testid="chooser-select-none"]')).toBeNull()
    })
  })
})
