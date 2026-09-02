import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { setActivePinia } from 'pinia'
import RoomPage from './[slug].vue'
import vuetify from '@/plugins/vuetify'
import * as api from '@/api/client'
import { ApiError, ApiNetworkError } from '@/api/client'
import { useAuthStore } from '@/stores/auth-store'
import { useRoomsStore } from '@/stores/rooms-store'
import type { JoinOutcome } from '@/stores/rooms-store'
import { readVisitorToken, setVisitorToken } from '@/sync/visitor-tokens'

const routing = vi.hoisted(() => ({ slug: 'iron-plate-hub', replace: vi.fn() }))

vi.mock('vue-router', async importOriginal => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return {
    ...actual,
    useRoute: () => ({ params: { slug: routing.slug } }),
    useRouter: () => ({ replace: routing.replace }),
  }
})

vi.mock('@/api/client', async importOriginal => {
  const actual = await importOriginal<typeof import('@/api/client')>()
  return {
    ...actual,
    lookupRoomBySlug: vi.fn(),
    authenticateRoom: vi.fn(),
  }
})

const ROOM_ID = 'room-1'

const notFound = () => new ApiError(404, 'Room not found.', { code: 'room_not_found' })
const wrongPassword = () => new ApiError(401, 'Incorrect password.', { code: 'invalid_password' })

describe('/room/:slug', () => {
  let roomsStore: ReturnType<typeof useRoomsStore>

  const roomIsShared = (hasPassword = false) => {
    vi.mocked(api.lookupRoomBySlug).mockResolvedValue({
      roomId: ROOM_ID,
      hasPassword,
    })
  }

  const open = async ({
    loggedIn = false,
    joinOutcomes = [{ ok: true }] as JoinOutcome[],
  } = {}) => {
    const pinia = createTestingPinia({ createSpy: vi.fn })
    setActivePinia(pinia)

    const authStore = useAuthStore()
    authStore.token = loggedIn ? 'token' : ''
    authStore.loggedInUser = loggedIn ? 'pioneer' : ''

    roomsStore = useRoomsStore()
    const join = vi.mocked(roomsStore.joinSharedRoom)
    join.mockResolvedValue(joinOutcomes[joinOutcomes.length - 1])
    for (const outcome of joinOutcomes) join.mockResolvedValueOnce(outcome)

    const wrapper = mount(RoomPage, { global: { plugins: [vuetify, pinia] } })
    await flushPromises()
    return wrapper
  }

  const shows = (wrapper: Awaited<ReturnType<typeof open>>, testId: string) =>
    wrapper.find(`[data-testid="${testId}"]`).exists()

  const enterPassword = async (wrapper: Awaited<ReturnType<typeof open>>, value: string) => {
    await wrapper.find('[data-testid="room-password-input"] input').setValue(value)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
  }

  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    routing.slug = 'iron-plate-hub'
    roomIsShared()
  })

  describe('the link does not resolve', () => {
    it('says the plan is not shared rather than redirecting', async () => {
      vi.mocked(api.lookupRoomBySlug).mockRejectedValue(notFound())

      const wrapper = await open()

      expect(shows(wrapper, 'room-not-found')).toBe(true)
      expect(routing.replace).not.toHaveBeenCalled()
    })

    it('never tries to join a room it could not resolve', async () => {
      vi.mocked(api.lookupRoomBySlug).mockRejectedValue(notFound())

      await open({ loggedIn: true })

      expect(roomsStore.joinSharedRoom).not.toHaveBeenCalled()
    })

    it('separates a server that is down from a link that is dead', async () => {
      vi.mocked(api.lookupRoomBySlug).mockRejectedValue(new ApiNetworkError('offline'))

      const wrapper = await open()

      expect(shows(wrapper, 'room-not-found')).toBe(false)
      expect(shows(wrapper, 'room-failed')).toBe(true)
    })
  })

  describe('an open room', () => {
    it('takes a logged-out visitor straight in as a joined tab', async () => {
      await open()

      expect(roomsStore.trackJoinedRoom).toHaveBeenCalledWith(ROOM_ID, {
        visitorToken: undefined,
      })
      expect(routing.replace).toHaveBeenCalledWith('/')
    })

    it('makes a logged-in visitor a member instead', async () => {
      await open({ loggedIn: true })

      expect(roomsStore.joinSharedRoom).toHaveBeenCalledWith(ROOM_ID, {
        visitorToken: undefined,
      })
      expect(roomsStore.trackJoinedRoom).not.toHaveBeenCalled()
      expect(routing.replace).toHaveBeenCalledWith('/')
    })
  })

  describe('a password-protected room', () => {
    beforeEach(() => {
      roomIsShared(true)
      vi.mocked(api.authenticateRoom).mockResolvedValue({ visitorToken: 'visitor-jwt' })
    })

    it('asks a logged-out visitor for the password first', async () => {
      const wrapper = await open()

      expect(shows(wrapper, 'room-password')).toBe(true)
      expect(roomsStore.trackJoinedRoom).not.toHaveBeenCalled()
      expect(routing.replace).not.toHaveBeenCalled()
    })

    it('joins on the right password and keeps the visitor token', async () => {
      const wrapper = await open()

      await enterPassword(wrapper, 'correct horse')

      expect(api.authenticateRoom).toHaveBeenCalledWith(ROOM_ID, 'correct horse')
      expect(readVisitorToken(ROOM_ID)).toBe('visitor-jwt')
      expect(roomsStore.trackJoinedRoom).toHaveBeenCalledWith(ROOM_ID, {
        visitorToken: 'visitor-jwt',
      })
      expect(routing.replace).toHaveBeenCalledWith('/')
    })

    it('shows a wrong password inline and stays put', async () => {
      vi.mocked(api.authenticateRoom).mockRejectedValue(wrongPassword())
      const wrapper = await open()

      await enterPassword(wrapper, 'nope')

      expect(wrapper.find('[data-testid="room-error"]').text()).toContain('Incorrect password')
      expect(shows(wrapper, 'room-password')).toBe(true)
      expect(routing.replace).not.toHaveBeenCalled()
    })

    it('reuses a token this browser already holds', async () => {
      setVisitorToken(ROOM_ID, 'stored-jwt')

      const wrapper = await open()

      expect(shows(wrapper, 'room-password')).toBe(false)
      expect(api.authenticateRoom).not.toHaveBeenCalled()
      expect(roomsStore.trackJoinedRoom).toHaveBeenCalledWith(ROOM_ID, {
        visitorToken: 'stored-jwt',
      })
    })

    it('lets an existing member in without asking for anything', async () => {
      const wrapper = await open({ loggedIn: true })

      // The server skips the password check for a membership it already has.
      expect(shows(wrapper, 'room-password')).toBe(false)
      expect(routing.replace).toHaveBeenCalledWith('/')
    })

    it('asks a logged-in stranger only once the server demands it', async () => {
      const wrapper = await open({
        loggedIn: true,
        joinOutcomes: [
          { ok: false, code: 'password_required', message: 'This room needs its invite password.' },
          { ok: true },
        ],
      })

      expect(shows(wrapper, 'room-password')).toBe(true)

      await enterPassword(wrapper, 'correct horse')

      expect(roomsStore.joinSharedRoom).toHaveBeenLastCalledWith(ROOM_ID, {
        visitorToken: 'visitor-jwt',
      })
      expect(routing.replace).toHaveBeenCalledWith('/')
    })

    it('does not offer a password form for a refusal a password cannot fix', async () => {
      const wrapper = await open({
        loggedIn: true,
        joinOutcomes: [{ ok: false, code: 'too_many_memberships', message: 'Too many plans.' }],
      })

      expect(shows(wrapper, 'room-password')).toBe(false)
      expect(wrapper.find('[data-testid="room-error"]').text()).toContain('Too many plans')
    })
  })
})
