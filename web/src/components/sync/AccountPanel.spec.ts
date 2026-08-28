import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { setActivePinia } from 'pinia'
import type { RoomListEntry } from 'common'
import AccountPanel from './AccountPanel.vue'
import vuetify from '@/plugins/vuetify'
import * as api from '@/api/client'
import { useAuthStore } from '@/stores/auth-store'
import { useRoomSyncStore } from '@/stores/room-sync-store'
import { useRoomsStore } from '@/stores/rooms-store'

vi.mock('@/api/client', async importOriginal => {
  const actual = await importOriginal<typeof import('@/api/client')>()
  return { ...actual, legacyRecover: vi.fn() }
})

const entry = (overrides: Partial<RoomListEntry> = {}): RoomListEntry => ({
  roomId: 'room-1',
  name: 'Iron Plates',
  slug: null,
  shared: false,
  hasPassword: false,
  revision: 3,
  role: 'owner',
  order: 0,
  ...overrides,
})

describe('AccountPanel', () => {
  let authStore: ReturnType<typeof useAuthStore>
  let roomsStore: ReturnType<typeof useRoomsStore>
  let roomSync: ReturnType<typeof useRoomSyncStore>

  const render = (initialState: Record<string, unknown> = {}) => {
    const pinia = createTestingPinia({ createSpy: vi.fn, initialState })
    setActivePinia(pinia)

    authStore = useAuthStore()
    authStore.token = 'token'
    authStore.loggedInUser = 'pioneer'
    roomsStore = useRoomsStore()
    roomSync = useRoomSyncStore()

    return mount(AccountPanel, { global: { plugins: [vuetify, pinia] } })
  }

  type Panel = ReturnType<typeof render>

  const at = (wrapper: Panel, testId: string) => wrapper.find(`[data-testid="${testId}"]`)

  const fillPasswordForm = async (wrapper: Panel, current: string, next: string, confirm = next) => {
    await at(wrapper, 'toggle-change-password').trigger('click')
    await at(wrapper, 'current-password').find('input').setValue(current)
    await at(wrapper, 'new-password').find('input').setValue(next)
    await at(wrapper, 'confirm-password').find('input').setValue(confirm)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
  }

  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('names the signed-in user', () => {
    expect(render().text()).toContain('pioneer')
  })

  describe('change password', () => {
    it('sends the current and new password to the server', async () => {
      const wrapper = render()
      vi.mocked(authStore.changePassword).mockResolvedValue(true)

      await fillPasswordForm(wrapper, 'old-one', 'new-one')

      expect(authStore.changePassword).toHaveBeenCalledWith('old-one', 'new-one')
      expect(at(wrapper, 'password-success').text()).toContain('Password changed')
    })

    it('clears the fields once it worked, so nothing is left lying around', async () => {
      const wrapper = render()
      vi.mocked(authStore.changePassword).mockResolvedValue(true)

      await fillPasswordForm(wrapper, 'old-one', 'new-one')

      expect(at(wrapper, 'current-password').find('input').element.value).toBe('')
      expect(at(wrapper, 'new-password').find('input').element.value).toBe('')
    })

    it('refuses a mismatched confirmation without asking the server', async () => {
      const wrapper = render()

      await fillPasswordForm(wrapper, 'old-one', 'new-one', 'new-two')

      expect(authStore.changePassword).not.toHaveBeenCalled()
      expect(at(wrapper, 'password-error').text()).toContain('do not match')
    })

    it('refuses an empty field without asking the server', async () => {
      const wrapper = render()

      await fillPasswordForm(wrapper, '', 'new-one')

      expect(authStore.changePassword).not.toHaveBeenCalled()
      expect(at(wrapper, 'password-error').text()).toContain('Fill in both')
    })

    it('shows the server\'s own refusal', async () => {
      const wrapper = render()
      vi.mocked(authStore.changePassword).mockResolvedValue('Current password is incorrect.')

      await fillPasswordForm(wrapper, 'wrong', 'new-one')

      expect(at(wrapper, 'password-error').text()).toContain('Current password is incorrect.')
      expect(at(wrapper, 'password-success').exists()).toBe(false)
    })
  })

  describe('connection state', () => {
    it.each([
      [{ mode: 'online', connection: 'connected' }, 'Connected'],
      [{ mode: 'reconnecting', connection: 'reconnecting' }, 'Reconnecting'],
      [{ mode: 'offlinePrompt', connection: 'reconnecting' }, 'You appear to be offline'],
      [{ mode: 'offline', connection: 'stopped' }, 'Offline mode'],
      [{ mode: 'online', connection: 'version_mismatch' }, 'Update required'],
    ])('reads %o as "%s"', (state, label) => {
      const wrapper = render({ roomSync: state })

      expect(at(wrapper, 'connection-chip').text()).toContain(label)
    })
  })

  describe('offline switch', () => {
    it('goes silent when switched on', async () => {
      const wrapper = render()

      await at(wrapper, 'offline-switch').find('input').setValue(true)

      expect(roomSync.enterOffline).toHaveBeenCalled()
    })

    it('comes back online when switched off', async () => {
      const wrapper = render({ roomSync: { mode: 'offline' } })

      await at(wrapper, 'offline-switch').find('input').setValue(false)

      expect(roomSync.exitOffline).toHaveBeenCalled()
    })
  })

  describe('synced plans', () => {
    it('says so plainly when there are none', () => {
      expect(at(render(), 'no-synced-plans').exists()).toBe(true)
    })

    it('lists each room the account holds', () => {
      const wrapper = render({
        rooms: { entries: { 'room-1': entry(), 'room-2': entry({ roomId: 'room-2', name: 'Steel', order: 1 }) } },
      })

      expect(wrapper.findAll('[data-testid="synced-plan"]')).toHaveLength(2)
      expect(wrapper.text()).toContain('Iron Plates')
      expect(wrapper.text()).toContain('Steel')
    })

    it('marks a shared plan and a plan owned by someone else', () => {
      const wrapper = render({
        rooms: { entries: { 'room-1': entry({ shared: true, role: 'member' }) } },
      })

      const row = at(wrapper, 'synced-plan')
      expect(row.text()).toContain('Shared')
      expect(row.text()).toContain('Member')
    })
  })

  describe('recover server copy', () => {
    it('refreshes the room list when something came back', async () => {
      vi.mocked(api.legacyRecover).mockResolvedValue({ imported: true })
      const wrapper = render()

      await at(wrapper, 'recover-server-copy').trigger('click')
      await flushPromises()

      expect(roomsStore.refresh).toHaveBeenCalled()
      expect(wrapper.text()).toContain('Recovered')
    })

    it('explains an empty recovery instead of looking broken', async () => {
      vi.mocked(api.legacyRecover).mockResolvedValue({ imported: false, reason: 'no_legacy_data' })
      const wrapper = render()

      await at(wrapper, 'recover-server-copy').trigger('click')
      await flushPromises()

      expect(wrapper.text()).toContain('no older saved plan')
      expect(roomsStore.refresh).not.toHaveBeenCalled()
    })
  })

  it('signs out of the rooms before the account, so no plan is orphaned', async () => {
    const wrapper = render()

    await wrapper.findAll('button').find(button => button.text().includes('Log out'))?.trigger('click')

    expect(roomsStore.signOut).toHaveBeenCalled()
    expect(authStore.logout).toHaveBeenCalled()
  })
})
