import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { RoomListEntry } from 'common'
import ShareDialog from './ShareDialog.vue'
import vuetify from '@/plugins/vuetify'
import * as api from '@/api/client'
import { ApiError } from '@/api/client'
import { SLUG_CHECK_DEBOUNCE_MS } from '@/composables/useSlugAvailability'
import { useAppStore } from '@/stores/app-store'
import { useRoomsStore } from '@/stores/rooms-store'
import type { TabSyncState } from '@/sync/tab-sync-state'
import { newFactory } from '@/utils/factory-management/factory'

vi.mock('@/api/client', async importOriginal => {
  const actual = await importOriginal<typeof import('@/api/client')>()
  return {
    ...actual,
    createSnapshotShare: vi.fn(),
    shareRoom: vi.fn(),
    unshareRoom: vi.fn(),
    setRoomPassword: vi.fn(),
    removeRoomPassword: vi.fn(),
    lookupRoomBySlug: vi.fn(),
  }
})

// v-dialog teleports its content to the body, so everything is read from there.
const body = () => document.body
const at = (testId: string) => body().querySelector<HTMLElement>(`[data-testid="${testId}"]`)
const shows = (testId: string) => at(testId) !== null
const click = async (testId: string) => {
  const element = at(testId)
  const button = element?.querySelector('button') ?? element
  button?.click()
  await flushPromises()
}
const type = async (testId: string, value: string) => {
  const input = at(testId)?.querySelector('input') as HTMLInputElement
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}

describe('ShareDialog', () => {
  let appStore: ReturnType<typeof useAppStore>
  let roomsStore: ReturnType<typeof useRoomsStore>
  let pinia: ReturnType<typeof createPinia>
  let tabId: string

  const entry = (overrides: Partial<RoomListEntry> = {}): RoomListEntry => ({
    roomId: tabId,
    name: 'Iron Plates',
    slug: null,
    shared: false,
    hasPassword: false,
    revision: 3,
    role: 'owner',
    order: 0,
    lastActivityAt: '2026-08-31T11:00:00.000Z',
    factoryCount: 0,
    ...overrides,
  })

  const open = async (state: Partial<TabSyncState>, listed?: RoomListEntry) => {
    appStore.setTabState(tabId, { kind: 'synced', shared: false, role: 'owner', revision: 1, ...state })
    if (listed) roomsStore.entries[tabId] = listed

    const wrapper = mount(ShareDialog, {
      props: { tabId, modelValue: true },
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

    appStore = useAppStore()
    roomsStore = useRoomsStore()
    tabId = appStore.getCurrentTab().id
    appStore.getCurrentTab().name = 'Iron Plates'
  })

  // The dialog rides on the shared `AppDialog` shell, which teleports its content and owns the
  // title row and the corner close. Both anchors below are what the e2e suite reaches for.
  describe('the shared dialog shell', () => {
    it('carries the dialog id the e2e suite anchors on, sections and all', async () => {
      await open({ kind: 'local' })

      // Asserted before the sections: `dialog?.querySelector(...)` is `undefined` when the
      // anchor is missing, and `undefined` passes `not.toBeNull()` — so without this the
      // test survives the testid being deleted outright.
      const dialog = at('share-dialog')
      expect(dialog).not.toBeNull()
      expect(dialog!.querySelector('[data-testid="snapshot-section"]')).not.toBeNull()
      expect(dialog!.querySelector('[data-testid="invite-section"]')).not.toBeNull()
    })

    it('names the plan in the title row', async () => {
      await open({ kind: 'local' })

      const title = body().querySelector('.v-card-title')
      expect(title?.textContent).toContain('Share "Iron Plates"')
      expect(title?.querySelector('i')?.className).toContain('fa-share-alt')
    })

    it('closes from the corner button, which the e2e suite clicks by id', async () => {
      const wrapper = await open({ kind: 'local' })

      const close = body().querySelector<HTMLElement>('#close-share-dialog')
      expect(close).not.toBeNull()
      close!.click()
      await flushPromises()

      expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
    })
  })

  describe('a local tab', () => {
    it('offers the snapshot half and nothing else', async () => {
      await open({ kind: 'local' })

      expect(shows('snapshot-section')).toBe(true)
      expect(shows('create-snapshot')).toBe(true)
      expect(shows('create-invite')).toBe(false)
      expect(shows('slug-input')).toBe(false)
    })

    // The exact sentence is the requirement, so it is asserted as written.
    it('says in as many words that it has to become a cloud tab first', async () => {
      await open({ kind: 'local' })

      expect(at('invite-blocked')?.textContent).toContain(
        'You must convert this tab to a cloud tab before it is possible to share it'
      )
    })

    it('gives the reasons under it rather than leaving the refusal bare', async () => {
      await open({ kind: 'local' })

      const detail = at('invite-blocked-detail')?.textContent
      expect(detail).toContain('has to live on your account')
      expect(detail).toContain('You stay its owner')
    })
  })

  describe('the owner of a private synced tab', () => {
    it('offers to create the invite link', async () => {
      await open({}, entry())

      expect(shows('create-invite')).toBe(true)
      expect(shows('invite-link')).toBe(false)
      expect(shows('invite-blocked')).toBe(false)
    })

    it('shares the room when asked', async () => {
      vi.mocked(api.shareRoom).mockResolvedValue({ room: entry({ shared: true, slug: 'a-b-c' }) })
      await open({}, entry())

      await click('create-invite')

      expect(api.shareRoom).toHaveBeenCalledWith(tabId, undefined)
    })

    it('shows why sharing failed rather than silently doing nothing', async () => {
      vi.mocked(api.shareRoom).mockRejectedValue(
        new ApiError(409, 'That invite link is already taken.', { code: 'slug_taken' })
      )
      await open({}, entry())

      await click('create-invite')

      expect(body().textContent).toContain('already taken')
    })
  })

  describe('the owner of a shared tab', () => {
    const shared = () => entry({ shared: true, slug: 'iron-plate-hub' })

    it('shows the copyable room link', async () => {
      await open({ shared: true }, shared())

      expect(at('invite-link')?.querySelector('input')?.value)
        .toBe(`${window.location.origin}/room/iron-plate-hub`)
    })

    it('offers every owner-only control', async () => {
      await open({ shared: true }, shared())

      expect(shows('slug-input')).toBe(true)
      expect(shows('set-password')).toBe(true)
      expect(shows('stop-sharing')).toBe(true)
    })

    it('only offers to remove a password once one is set', async () => {
      await open({ shared: true }, shared())
      expect(shows('remove-password')).toBe(false)

      document.body.innerHTML = ''
      await open({ shared: true }, entry({ shared: true, slug: 'a-b-c', hasPassword: true }))
      expect(shows('remove-password')).toBe(true)
    })

    it('sets a password through the rooms API', async () => {
      vi.mocked(api.setRoomPassword).mockResolvedValue({ passwordVersion: 1 })
      await open({ shared: true }, shared())

      await type('password-input', 'hunter2')
      await click('set-password')

      expect(api.setRoomPassword).toHaveBeenCalledWith(tabId, 'hunter2')
    })

    it('stops sharing when asked', async () => {
      vi.mocked(api.unshareRoom).mockResolvedValue({ room: entry() })
      await open({ shared: true }, shared())

      await click('stop-sharing')

      expect(api.unshareRoom).toHaveBeenCalledWith(tabId)
    })

    it('only enables a custom slug once it checks out as free', async () => {
      vi.useFakeTimers()
      vi.mocked(api.lookupRoomBySlug).mockRejectedValue(
        new ApiError(404, 'Room not found.', { code: 'room_not_found' })
      )
      vi.mocked(api.shareRoom).mockResolvedValue({ room: entry({ shared: true, slug: 'my-own-link' }) })
      await open({ shared: true }, shared())

      await type('slug-input', 'my-own-link')
      expect(at('apply-slug')?.hasAttribute('disabled')).toBe(true)

      await vi.advanceTimersByTimeAsync(SLUG_CHECK_DEBOUNCE_MS)
      await flushPromises()

      expect(at('apply-slug')?.hasAttribute('disabled')).toBe(false)
      at('apply-slug')?.click()
      await flushPromises()

      expect(api.shareRoom).toHaveBeenCalledWith(tabId, 'my-own-link')
      vi.useRealTimers()
    })
  })

  describe('a member of someone else\'s room', () => {
    it('can copy the link and change nothing', async () => {
      await open(
        { shared: true, role: 'member' },
        entry({ shared: true, slug: 'iron-plate-hub', role: 'member' }),
      )

      expect(shows('invite-link')).toBe(true)
      expect(shows('slug-input')).toBe(false)
      expect(shows('stop-sharing')).toBe(false)
      expect(at('invite-blocked')?.textContent).toContain('Only the owner')
      expect(shows('invite-blocked-detail')).toBe(false)
    })

    it('keeps the snapshot half, which needs no rights at all', async () => {
      await open({ shared: true, role: 'member' }, entry({ shared: true, role: 'member' }))

      expect(shows('create-snapshot')).toBe(true)
    })
  })

  describe('an anonymous visitor', () => {
    it('gets no invite controls and an explanation', async () => {
      await open({ kind: 'joined', shared: true, role: 'member' })

      expect(shows('create-invite')).toBe(false)
      expect(shows('slug-input')).toBe(false)
      expect(at('invite-blocked')?.textContent).toContain('invite link')
    })
  })

  describe('the snapshot half', () => {
    it('refuses an empty plan inline rather than with an alert', async () => {
      await open({ kind: 'local' })

      await click('create-snapshot')

      expect(api.createSnapshotShare).not.toHaveBeenCalled()
      expect(body().textContent).toContain('nothing in this plan')
    })

    it('creates the frozen link for a plan with factories in it', async () => {
      appStore.getCurrentTab().factories.push(newFactory('Iron Ingots'))
      vi.mocked(api.createSnapshotShare).mockResolvedValue({ status: 'success', shareId: 'abc123' })
      await open({ kind: 'local' })

      await click('create-snapshot')

      expect(at('snapshot-link')?.querySelector('input')?.value)
        .toBe(`${window.location.origin}/share/abc123`)
    })

    it('names rate limiting for what it is', async () => {
      appStore.getCurrentTab().factories.push(newFactory('Iron Ingots'))
      vi.mocked(api.createSnapshotShare).mockRejectedValue(new ApiError(429, 'slow down'))
      await open({ kind: 'local' })

      await click('create-snapshot')

      expect(body().textContent).toContain('rate limited')
    })

    /**
     * A snapshot is a dead copy, so two of them taken from identical bytes are two
     * links to the same thing. Reopening the dialog used to mint one every time.
     */
    describe('taking the same snapshot twice', () => {
      const shareOnce = async () => {
        appStore.getCurrentTab().factories.push(newFactory('Iron Ingots'))
        vi.mocked(api.createSnapshotShare).mockResolvedValue({ status: 'success', shareId: 'abc123' })
        const wrapper = await open({ kind: 'local' })
        await click('create-snapshot')
        wrapper.unmount()
        document.body.innerHTML = ''
        vi.mocked(api.createSnapshotShare).mockClear()
      }

      it('shows the link it already handed out, and asks the server for nothing', async () => {
        await shareOnce()

        await open({ kind: 'local' })

        expect(at('snapshot-link')?.querySelector('input')?.value)
          .toBe(`${window.location.origin}/share/abc123`)
        expect(api.createSnapshotShare).not.toHaveBeenCalled()
        expect(shows('snapshot-unchanged')).toBe(true)
        // Nothing to press: a second link of the same bytes is what this prevents.
        expect(shows('create-snapshot')).toBe(false)
      })

      it('offers a fresh one the moment the plan changes', async () => {
        await shareOnce()
        appStore.getCurrentTab().factories.push(newFactory('Copper Ingots'))

        await open({ kind: 'local' })

        expect(shows('create-snapshot')).toBe(true)
        expect(shows('snapshot-link')).toBe(false)
        expect(shows('snapshot-unchanged')).toBe(false)
      })

      it('keeps every tab to its own link', async () => {
        await shareOnce()
        const other = appStore.addTab({ name: 'Another plan' })

        await open({ kind: 'local' })
        expect(shows('snapshot-link')).toBe(true)

        document.body.innerHTML = ''
        mount(ShareDialog, {
          props: { tabId: other, modelValue: true },
          global: { plugins: [vuetify, pinia] },
          attachTo: document.body,
        })
        await flushPromises()

        expect(shows('snapshot-link')).toBe(false)
      })
    })

    describe('copying the link', () => {
      let written: string[]

      beforeEach(() => {
        written = []
        Object.assign(navigator, {
          clipboard: { writeText: vi.fn(async (text: string) => { written.push(text) }) },
        })
      })

      it('copies the link the moment it is made, without being asked', async () => {
        appStore.getCurrentTab().factories.push(newFactory('Iron Ingots'))
        vi.mocked(api.createSnapshotShare).mockResolvedValue({ status: 'success', shareId: 'abc123' })
        await open({ kind: 'local' })

        await click('create-snapshot')

        expect(written).toEqual([`${window.location.origin}/share/abc123`])
        expect(at('copy-snapshot')?.textContent).toContain('Copied!')
      })

      // The button is the only thing on screen that can say the copy happened, and
      // it has to go back to naming what it does or it reads as a state.
      it('says so on the button for a moment, then offers to copy again', async () => {
        vi.useFakeTimers()
        try {
          appStore.getCurrentTab().factories.push(newFactory('Iron Ingots'))
          vi.mocked(api.createSnapshotShare).mockResolvedValue({ status: 'success', shareId: 'abc123' })
          await open({ kind: 'local' })
          await click('create-snapshot')

          expect(at('copy-snapshot')?.textContent).toContain('Copied!')
          expect(at('copy-snapshot')?.querySelector('.fa-check')).not.toBeNull()

          vi.advanceTimersByTime(3000)
          await flushPromises()

          expect(at('copy-snapshot')?.textContent).toContain('Copy snapshot link')
          expect(at('copy-snapshot')?.querySelector('.fa-copy')).not.toBeNull()
        } finally {
          vi.useRealTimers()
        }
      })

      it('says nothing of the sort when the browser refuses the clipboard', async () => {
        Object.assign(navigator, {
          clipboard: { writeText: vi.fn(async () => { throw new Error('denied') }) },
        })
        appStore.getCurrentTab().factories.push(newFactory('Iron Ingots'))
        vi.mocked(api.createSnapshotShare).mockResolvedValue({ status: 'success', shareId: 'abc123' })
        await open({ kind: 'local' })

        await click('create-snapshot')

        expect(at('copy-snapshot')?.textContent).toContain('Copy snapshot link')
      })
    })
  })
})
