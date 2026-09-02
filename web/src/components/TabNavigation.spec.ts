import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import draggable from 'vuedraggable'
import type { RoomListEntry } from 'common'
import TabNavigation from './TabNavigation.vue'
import vuetify from '@/plugins/vuetify'
import * as api from '@/api/client'
import { ApiError } from '@/api/client'
import { useAppStore } from '@/stores/app-store'
import { useAuthStore } from '@/stores/auth-store'
import { usePlanActivityStore } from '@/stores/plan-activity-store'
import { useRoomSyncStore } from '@/stores/room-sync-store'
import { useRoomsStore } from '@/stores/rooms-store'
import eventBus from '@/utils/eventBus'

vi.mock('@/api/client', async importOriginal => {
  const actual = await importOriginal<typeof import('@/api/client')>()
  return { ...actual, listRooms: vi.fn(), reorderRooms: vi.fn() }
})

const entry = (roomId: string, name: string, order: number): RoomListEntry => ({
  roomId,
  name,
  slug: null,
  shared: false,
  hasPassword: false,
  revision: 1,
  role: 'owner',
  order,
  lastActivityAt: '2026-08-31T11:00:00.000Z',
  factoryCount: 0,
})

describe('Component: TabNavigation', () => {
  let pinia: ReturnType<typeof createPinia>
  let appStore: ReturnType<typeof useAppStore>
  let roomsStore: ReturnType<typeof useRoomsStore>
  let roomSync: ReturnType<typeof useRoomSyncStore>

  /** The bar the specs drag on: one local tab, then two synced rooms. */
  const mixedBar = async () => {
    const local = appStore.getCurrentTab()
    local.name = 'Local'
    appStore.addTab({ id: 'room-a', name: 'A', factories: [] }, { activate: false })
    appStore.addTab({ id: 'room-b', name: 'B', factories: [] }, { activate: false })
    vi.mocked(api.listRooms).mockResolvedValue({
      roomsRevision: 1,
      rooms: [entry('room-a', 'A', 0), entry('room-b', 'B', 1)],
    })
    await roomsStore.refresh()
    return local.id
  }

  // Sortable has already moved the DOM by the time it reports; the component's job
  // is to make the model and the server agree with it.
  const drag = (wrapper: VueWrapper, oldIndex: number, newIndex: number) =>
    wrapper.findComponent(draggable).vm.$emit('change', { moved: { oldIndex, newIndex } })

  // Handed the pinia rather than left to pick up `activePinia`: every store action
  // call re-points that global, so a listener or timer left behind by an earlier
  // test can hand this mount that test's dead stores instead of these ones.
  const render = () => mount(TabNavigation, { global: { plugins: [vuetify, pinia] } })

  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    pinia = createPinia()
    setActivePinia(pinia)

    appStore = useAppStore()
    appStore.isLoaded = true
    roomSync = useRoomSyncStore()
    roomsStore = useRoomsStore()

    const authStore = useAuthStore()
    authStore.setToken('token')
    authStore.setLoggedInUser('pioneer')

    vi.mocked(api.listRooms).mockResolvedValue({ roomsRevision: 1, rooms: [] })
  })

  afterEach(() => {
    roomsStore.dispose()
    roomSync.dispose()
    // Mounted by the last-updated indicator, so it is this file that has to let it go:
    // its bus listeners outlive the test and keep poking a store nothing else can reach.
    usePlanActivityStore().dispose()
  })

  it('renders one tab per tab in the bar', async () => {
    await mixedBar()
    const wrapper = render()

    expect(wrapper.findAll('[data-testid="factory-tab"]').map(tab => tab.text()))
      .toEqual(['Local', 'A', 'B'])
  })

  // Sortable is configured to match [data-draggable] only, and vuedraggable stamps
  // that on the item's root element — which a multi-root item would silently drop.
  it('marks every tab as a Sortable item', async () => {
    await mixedBar()
    const wrapper = render()

    expect(wrapper.findAll('.tab-drag > [data-draggable]')).toHaveLength(3)
  })

  it('reorders the bar and pushes the new synced order to the server', async () => {
    const localId = await mixedBar()
    vi.mocked(api.reorderRooms).mockResolvedValue({
      roomsRevision: 2,
      rooms: [entry('room-b', 'B', 0), entry('room-a', 'A', 1)],
    })
    const wrapper = render()

    drag(wrapper, 2, 1)
    await flushPromises()

    expect(api.reorderRooms).toHaveBeenCalledWith(['room-b', 'room-a'])
    expect(appStore.getTabs().map(tab => tab.id)).toEqual([localId, 'room-b', 'room-a'])
  })

  it('leaves the bar alone for a drag that moved nothing', async () => {
    await mixedBar()
    const wrapper = render()

    wrapper.findComponent(draggable).vm.$emit('change', {})
    await flushPromises()

    expect(api.reorderRooms).not.toHaveBeenCalled()
  })

  it('puts the bar back and says so when the push fails', async () => {
    const localId = await mixedBar()
    vi.mocked(api.reorderRooms).mockRejectedValue(new ApiError(500, 'Server exploded'))
    const emit = vi.spyOn(eventBus, 'emit')
    emit.mockClear()
    const wrapper = render()

    drag(wrapper, 2, 1)
    await flushPromises()

    expect(appStore.getTabs().map(tab => tab.id)).toEqual([localId, 'room-a', 'room-b'])
    expect(emit).toHaveBeenCalledWith('toast', {
      message: 'Could not save the tab order: Server exploded',
      type: 'error',
    })
  })

  describe('the per-tab actions', () => {
    /** The order they sit in on the bar, read from the bar itself. */
    const actionOrder = (wrapper: VueWrapper) =>
      [...wrapper.element.querySelectorAll('[data-testid]')]
        .map(element => element.getAttribute('data-testid'))
        .filter(id => id !== null && ['duplicate-tab', 'share-button', 'delete-tab'].includes(id))

    it('keeps copy, share and delete together in that order', async () => {
      await mixedBar()
      appStore.activateTab('room-a')
      await flushPromises()
      const wrapper = render()

      expect(actionOrder(wrapper)).toEqual(['duplicate-tab', 'share-button', 'delete-tab'])
    })

    // A `title` attribute is the browser's own tooltip: slow, unstyled, and easy to
    // miss. Both of these have to be real hover tooltips.
    it.each([
      ['duplicate-tab', 'Copy this tab into a local one'],
      ['delete-tab', 'Delete this plan from your account'],
    ])('explains %s on hover, not through a title attribute', async (testId, wording) => {
      await mixedBar()
      appStore.activateTab('room-a')
      await flushPromises()
      const wrapper = render()

      const button = wrapper.find(`[data-testid="${testId}"]`)
      expect(button.attributes('title')).toBeUndefined()

      await button.trigger('mouseenter')
      await flushPromises()

      expect(document.body.textContent).toContain(wording)
    })

    it('says the milder thing for a local tab, which nobody else can lose', async () => {
      appStore.addTab({ id: 'second', name: 'Second', factories: [] }, { activate: false })
      const wrapper = render()

      expect(wrapper.find('[data-testid="duplicate-tab"]').exists()).toBe(false)
      await wrapper.find('[data-testid="delete-tab"]').trigger('mouseenter')
      await flushPromises()

      expect(document.body.textContent).toContain('Delete this tab')
    })
  })

  describe('the tab settings pencil', () => {
    it('marks local, synced and collaborative tabs with desktop, cloud and users icons', async () => {
      const local = appStore.getCurrentTab()
      local.name = 'Local'
      appStore.addTab({ id: 'room-a', name: 'A', factories: [] }, { activate: false })
      appStore.addTab({ id: 'room-b', name: 'B', factories: [] }, { activate: false })
      vi.mocked(api.listRooms).mockResolvedValue({
        roomsRevision: 1,
        rooms: [entry('room-a', 'A', 0), { ...entry('room-b', 'B', 1), shared: true }],
      })
      await roomsStore.refresh()
      const wrapper = render()

      const icons = wrapper.findAll('[data-testid="factory-tab"] .tab-state i')
        .map(icon => icon.classes().find(name => name.startsWith('fa-')))
      expect(icons).toEqual(['fa-desktop', 'fa-cloud', 'fa-users'])
    })

    it('opens the tab settings dialog', async () => {
      await mixedBar()
      const wrapper = mount(TabNavigation, {
        global: { plugins: [vuetify, pinia] },
        attachTo: document.body,
      })

      expect(document.body.querySelector('[data-testid="tab-settings-dialog"] .v-card')).toBeNull()
      await wrapper.find('[data-testid="tab-settings"]').trigger('click')
      await flushPromises()

      expect(document.body.querySelector('[data-testid="tab-settings-dialog"] .v-card')).not.toBeNull()
      wrapper.unmount()
    })

    // The dialog holds more than the rename, so the role no longer gates the pencil:
    // a member gets it too, and the dialog explains what their role may not do.
    it('offers the pencil to a member as well', async () => {
      await mixedBar()
      appStore.setTabState('room-a', { role: 'member' })
      appStore.activateTab('room-a')
      await flushPromises()
      const wrapper = render()

      expect(wrapper.find('[data-testid="tab-settings"]').exists()).toBe(true)
    })
  })

  it('refuses the drag in offline mode, and says why', async () => {
    await mixedBar()
    roomSync.enterOffline()
    const wrapper = render()

    const strip = wrapper.find('.tab-drag')
    expect(strip.classes()).not.toContain('drag-enabled')
    expect(strip.attributes('title')).toBe('Tab order cannot be changed in offline mode.')
  })

  it('allows the drag offline when there is nothing on the server to fight over', async () => {
    appStore.addTab({ id: 'second', name: 'Second', factories: [] }, { activate: false })
    roomSync.enterOffline()
    const wrapper = render()

    const strip = wrapper.find('.tab-drag')
    expect(strip.classes()).toContain('drag-enabled')
    expect(strip.attributes('title')).toBeUndefined()
  })
})
