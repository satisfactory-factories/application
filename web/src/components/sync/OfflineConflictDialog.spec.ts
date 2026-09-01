import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import OfflineConflictDialog from './OfflineConflictDialog.vue'
import vuetify from '@/plugins/vuetify'
import type { ConflictFactory, ConflictProductRow } from '@/sync/offline-conflict'
import { useRoomSyncStore } from '@/stores/room-sync-store'

const ROOM = 'room-1'

// The shared dialog shell teleports its content to the body, so everything is read there.
const body = () => document.body
const sections = () => [...body().querySelectorAll<HTMLElement>('[data-testid="conflict-factory"]')]
const at = (testid: string) => body().querySelector<HTMLElement>(`[data-testid="${testid}"]`)
const within = (section: HTMLElement, testid: string) =>
  [...section.querySelectorAll<HTMLElement>(`[data-testid="${testid}"]`)]

const winner = (factoryId: number, which: 'mine' | 'live') =>
  body().querySelector<HTMLElement>(`[data-testid="winner-${which}"][data-factory-id="${factoryId}"]`)

const chosen = (factoryId: number): 'mine' | 'live' | null => {
  for (const which of ['mine', 'live'] as const) {
    if (winner(factoryId, which)?.classList.contains('v-btn--active')) return which
  }
  return null
}

const click = async (element: HTMLElement | null | undefined) => {
  element?.click()
  await flushPromises()
}

const product = (row: Partial<ConflictProductRow> = {}): ConflictProductRow => ({
  itemId: 'IronIngot',
  live: 60,
  mine: 45,
  recipeChanged: false,
  ...row,
})

const clash = (row: Partial<ConflictFactory> = {}): ConflictFactory => ({
  factoryId: 1,
  name: 'Smelters',
  liveDeleted: false,
  mineDeleted: false,
  products: [product()],
  otherChanges: false,
  ...row,
})

describe('OfflineConflictDialog', () => {
  let roomSync: ReturnType<typeof useRoomSyncStore>
  let pinia: ReturnType<typeof createPinia>

  const open = async (factories: ConflictFactory[]) => {
    roomSync.conflicts[ROOM] = { roomId: ROOM, factories }

    const wrapper = mount(OfflineConflictDialog, {
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

    roomSync = useRoomSyncStore()
  })

  afterEach(() => {
    roomSync.dispose()
  })

  it('says what happened and how many factories it is about', async () => {
    await open([clash(), clash({ factoryId: 2, name: 'Constructors' })])

    expect(body().textContent).toContain('Your offline changes clash with newer ones')
    expect(at('conflict-blurb')?.textContent).toContain(
      'While this device was offline, 2 factories you edited here were also changed by others',
    )
    expect(at('conflict-blurb')?.textContent).toContain('Everything else syncs safely either way')
  })

  it('counts one clashing factory in the singular', async () => {
    await open([clash()])

    expect(at('conflict-blurb')?.textContent).toContain('1 factory you edited here was also changed')
    expect(at('conflict-blurb')?.textContent).toContain('Pick which version wins.')
  })

  // The e2e suite reaches the dialog and its rows by these ids, and the shared shell
  // teleports its content, so they have to survive the trip out to the body.
  it('carries the ids the e2e suite anchors on', async () => {
    await open([clash()])

    const dialog = body().querySelector('[data-testid="offline-conflict-dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog!.querySelector('[data-testid="conflict-factory"]')).not.toBeNull()
    expect(dialog!.querySelector('[data-testid="apply-choices"]')).not.toBeNull()
  })

  it('gives every clashing factory a section of its own, named', async () => {
    await open([clash(), clash({ factoryId: 2, name: 'Constructors' })])

    expect(sections()).toHaveLength(2)
    expect(sections().map(section => within(section, 'conflict-name')[0].textContent?.trim()))
      .toEqual(['Smelters', 'Constructors'])
  })

  describe('the evidence per product', () => {
    it('puts the two amounts side by side when one moved', async () => {
      await open([clash()])

      const row = within(sections()[0], 'conflict-product')[0]
      expect(row.textContent).toContain('Iron Ingot')
      expect(row.querySelector('[data-testid="evidence-live"]')?.textContent).toContain('live: 60/min')
      expect(row.querySelector('[data-testid="evidence-mine"]')?.textContent).toContain('mine: 45/min')
      expect(row.querySelector('[data-testid="evidence-recipe"]')).toBeNull()
    })

    it('says when the recipe moved as well as the amount', async () => {
      await open([clash({ products: [product({ recipeChanged: true })] })])

      const row = within(sections()[0], 'conflict-product')[0]
      expect(row.querySelector('[data-testid="evidence-recipe"]')?.textContent).toContain('recipe changed')
    })

    it('reads a product only the live plan has as removed here', async () => {
      await open([clash({ products: [product({ live: 60, mine: null })] })])

      const row = within(sections()[0], 'conflict-product')[0]
      expect(row.querySelector('[data-testid="evidence-live"]')?.textContent).toContain('live: 60/min')
      expect(row.querySelector('[data-testid="evidence-mine"]')?.textContent).toContain('mine: removed')
    })

    it('reads a product only this device has as none live', async () => {
      await open([clash({ products: [product({ live: null, mine: 45 })] })])

      const row = within(sections()[0], 'conflict-product')[0]
      expect(row.querySelector('[data-testid="evidence-live"]')?.textContent).toContain('live: none')
      expect(row.querySelector('[data-testid="evidence-mine"]')?.textContent).toContain('mine: 45/min')
    })

    // One line rather than a diff of everything: the products are the evidence people
    // recognise, and the rest only has to be admitted to.
    it('admits to changes the product rows cannot show', async () => {
      await open([clash({ otherChanges: true })])

      expect(within(sections()[0], 'conflict-other')[0].textContent)
        .toContain('other changes in this factory as well')
    })

    it('says nothing about other changes when there are none', async () => {
      await open([clash()])

      expect(within(sections()[0], 'conflict-other')).toHaveLength(0)
    })
  })

  describe('a factory deleted by somebody else', () => {
    const deleted = clash({ liveDeleted: true, products: [product({ live: null, mine: 45 })] })

    it('states the deletion as the live side and still offers the choice', async () => {
      await open([deleted])

      expect(within(sections()[0], 'conflict-live-deleted')[0].textContent)
        .toContain('deleted in the live plan')
      expect(within(sections()[0], 'evidence-mine')[0].textContent).toContain('mine: 45/min')
      expect(within(sections()[0], 'evidence-live')).toHaveLength(0)
      expect(chosen(1)).toBe('mine')
    })

    it('hands the deletion back as a live winner', async () => {
      const resolve = vi.spyOn(roomSync, 'resolveConflict').mockReturnValue(true)
      await open([deleted])

      await click(winner(1, 'live'))
      await click(at('apply-choices'))

      expect(resolve).toHaveBeenCalledWith(ROOM, { liveWinners: [1], keepCopy: true })
    })
  })

  describe('choosing', () => {
    it('starts every factory on this device\'s version', async () => {
      await open([clash(), clash({ factoryId: 2 })])

      expect([chosen(1), chosen(2)]).toEqual(['mine', 'mine'])
    })

    it('flips every control with the two text actions', async () => {
      await open([clash(), clash({ factoryId: 2 })])

      await click(at('all-live'))
      expect([chosen(1), chosen(2)]).toEqual(['live', 'live'])

      await click(at('all-mine'))
      expect([chosen(1), chosen(2)]).toEqual(['mine', 'mine'])
    })

    it('sends a mixed answer exactly as it was chosen', async () => {
      const resolve = vi.spyOn(roomSync, 'resolveConflict').mockReturnValue(true)
      await open([clash(), clash({ factoryId: 2 }), clash({ factoryId: 3 })])

      await click(winner(2, 'live'))
      await click(at('apply-choices'))

      expect(resolve).toHaveBeenCalledWith(ROOM, { liveWinners: [2], keepCopy: true })
    })

    it('keeps a copy of this device\'s version unless the box is cleared', async () => {
      const resolve = vi.spyOn(roomSync, 'resolveConflict').mockReturnValue(true)
      await open([clash()])

      const box = at('kept-copy')?.querySelector('input') as HTMLInputElement
      expect(box.checked).toBe(true)

      box.checked = false
      box.dispatchEvent(new Event('input', { bubbles: true }))
      await flushPromises()
      await click(at('apply-choices'))

      expect(resolve).toHaveBeenCalledWith(ROOM, { liveWinners: [], keepCopy: false })
    })
  })

  it('goes away on its own when the clash it was asking about does', async () => {
    await open([clash()])
    expect(at('offline-conflict-dialog')).not.toBeNull()

    delete roomSync.conflicts[ROOM]
    await flushPromises()

    expect(sections()).toHaveLength(0)
  })

  it('keeps a choice already made when a newer snapshot re-measures the rows', async () => {
    await open([clash(), clash({ factoryId: 2 })])
    await click(winner(2, 'live'))

    // The engine re-measures against the newest server content and rewrites the rows.
    roomSync.conflicts[ROOM].factories = [clash({ products: [product({ live: 90 })] }), clash({ factoryId: 2 })]
    await flushPromises()

    expect([chosen(1), chosen(2)]).toEqual(['mine', 'live'])
    expect(within(sections()[0], 'evidence-live')[0].textContent).toContain('live: 90/min')
  })
})
