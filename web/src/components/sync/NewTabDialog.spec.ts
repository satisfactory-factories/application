import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { setActivePinia } from 'pinia'
import NewTabDialog from './NewTabDialog.vue'
import vuetify from '@/plugins/vuetify'
import { useAppStore } from '@/stores/app-store'
import { useAuthStore } from '@/stores/auth-store'
import { useRoomsStore } from '@/stores/rooms-store'

// The dialog teleports its content out of the wrapper, so everything is read from
// the body, exactly as a person sees it.
const body = () => document.body
const at = (testId: string) => body().querySelector<HTMLElement>(`[data-testid="${testId}"]`)
const shown = (testId: string) => at(testId) !== null

describe('NewTabDialog', () => {
  let appStore: ReturnType<typeof useAppStore>
  let authStore: ReturnType<typeof useAuthStore>
  let roomsStore: ReturnType<typeof useRoomsStore>

  const render = ({ loggedIn = false } = {}) => {
    const pinia = createTestingPinia({ createSpy: vi.fn })
    setActivePinia(pinia)

    appStore = useAppStore()
    authStore = useAuthStore()
    roomsStore = useRoomsStore()
    authStore.token = loggedIn ? 'token' : ''
    authStore.loggedInUser = loggedIn ? 'pioneer' : ''

    vi.mocked(roomsStore.createSyncedTab).mockResolvedValue(true)
    vi.mocked(roomsStore.whenSessionReady).mockResolvedValue(undefined)

    return mount(NewTabDialog, {
      global: { plugins: [vuetify, pinia] },
      props: { modelValue: true },
      attachTo: document.body,
    })
  }

  /** Signs in through the form the dialog shows, as a person would. */
  const signIn = async () => {
    vi.mocked(authStore.login).mockImplementation(async () => {
      authStore.token = 'token'
      authStore.loggedInUser = 'pioneer'
      return true
    })

    const fields = body().querySelectorAll<HTMLInputElement>('[data-testid="auth-form"] input')
    for (const [index, value] of ['pioneer', 'ficsit'].entries()) {
      fields[index].value = value
      fields[index].dispatchEvent(new Event('input', { bubbles: true }))
    }
    await flushPromises()

    body().querySelector<HTMLFormElement>('[data-testid="auth-form"] form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
  }

  const chooseSynced = async () => {
    at('choose-synced-tab')?.click()
    await flushPromises()
  }

  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('offers both kinds of tab', () => {
    render()

    expect(shown('choose-local-tab')).toBe(true)
    expect(shown('choose-synced-tab')).toBe(true)
  })

  it('makes a local tab with no account at all', async () => {
    const wrapper = render()

    at('choose-local-tab')?.click()
    await flushPromises()

    expect(appStore.addTab).toHaveBeenCalled()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })

  describe('signed out, choosing synced', () => {
    it('offers the sign-in form here rather than turning the choice down', async () => {
      render()

      expect(shown('synced-needs-account')).toBe(true)
      await chooseSynced()

      expect(shown('auth-form')).toBe(true)
      expect(shown('choose-synced-tab')).toBe(false)
      expect(roomsStore.createSyncedTab).not.toHaveBeenCalled()
    })

    it('carries on and makes the tab once the sign-in lands, without asking again', async () => {
      const wrapper = render()
      await chooseSynced()

      await signIn()

      expect(authStore.login).toHaveBeenCalledWith('pioneer', 'ficsit')
      expect(roomsStore.createSyncedTab).toHaveBeenCalledWith('New Tab')
      expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
    })

    // The room list refresh that login starts converts a synced tab it does not
    // know about straight back to local, so the tab is made after it lands.
    it('waits for the room list before making the tab', async () => {
      render()
      await chooseSynced()

      await signIn()

      const waited = vi.mocked(roomsStore.whenSessionReady).mock.invocationCallOrder[0]
      const created = vi.mocked(roomsStore.createSyncedTab).mock.invocationCallOrder[0]
      expect(waited).toBeLessThan(created)
    })

    it('goes back to the chooser rather than trapping the user in the form', async () => {
      render()
      await chooseSynced()

      at('new-tab-back')?.click()
      await flushPromises()

      expect(shown('auth-form')).toBe(false)
      expect(shown('choose-local-tab')).toBe(true)
    })
  })

  describe('signed in', () => {
    it('creates the tab straight away', async () => {
      const wrapper = render({ loggedIn: true })

      expect(shown('synced-needs-account')).toBe(false)
      await chooseSynced()

      expect(shown('auth-form')).toBe(false)
      expect(roomsStore.createSyncedTab).toHaveBeenCalledWith('New Tab')
      expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
    })

    it('stays open and shows why when the server refuses', async () => {
      const wrapper = render({ loggedIn: true })
      vi.mocked(roomsStore.createSyncedTab).mockResolvedValue('You have too many synced plans.')

      await chooseSynced()

      expect(at('new-tab-error')?.textContent).toContain('too many synced plans')
      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })
  })
})
