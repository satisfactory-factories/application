import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { APP_VERSION_HEADER, PROTOCOL_VERSION } from 'common'
import {
  adoptRoom,
  ApiError,
  ApiNetworkError,
  apiRequest,
  authenticateRoom,
  createRoom,
  createSnapshotShare,
  deleteRoom,
  getPreferences,
  getSnapshotShare,
  joinRoom,
  leaveRoom,
  legacyAutoImport,
  listRooms,
  lookupRoomBySlug,
  removeRoomPassword,
  renameRoom,
  reorderRooms,
  resetApiTokenProvider,
  savePreferences,
  setApiTokenProvider,
  setRoomPassword,
  shareRoom,
  unshareRoom,
  VersionMismatchError,
} from '@/api/client'
import { config } from '@/config/config'
import eventBus from '@/utils/eventBus'
import type { FactoryTab } from '@/interfaces/planner/FactoryInterface'

const apiUrl = config.apiUrl

const jsonResponse = (status: number, body: unknown = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: vi.fn().mockResolvedValue(body),
})

/** Awaits the rejection and hands it back typed, failing loudly if it resolves. */
const failure = <E = ApiError> (promise: Promise<unknown>): Promise<E> =>
  promise.then(
    () => { throw new Error('Expected the request to fail, but it resolved') },
    (caught: E) => caught,
  )

describe('api/client', () => {
  let mockFetch: ReturnType<typeof vi.fn>
  let emitSpy: ReturnType<typeof vi.spyOn>

  const lastCall = () => mockFetch.mock.calls[mockFetch.mock.calls.length - 1]

  beforeEach(() => {
    localStorage.clear()
    mockFetch = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }))
    vi.stubGlobal('fetch', mockFetch)
    emitSpy = vi.spyOn(eventBus, 'emit')
    resetApiTokenProvider()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    emitSpy.mockRestore()
    resetApiTokenProvider()
  })

  describe('headers', () => {
    it('sends the app version on every request', async () => {
      await apiRequest('/rooms')
      expect(lastCall()[1].headers[APP_VERSION_HEADER]).toBe(PROTOCOL_VERSION)
    })

    it('sends no Content-Type when there is no body', async () => {
      await apiRequest('/rooms')
      expect(lastCall()[1].headers['Content-Type']).toBeUndefined()
      expect(lastCall()[1].body).toBeUndefined()
    })

    it('sends JSON content type and a serialised body', async () => {
      await apiRequest('/rooms', { method: 'POST', body: { name: 'Tab' } })
      expect(lastCall()[1].headers['Content-Type']).toBe('application/json')
      expect(JSON.parse(lastCall()[1].body)).toEqual({ name: 'Tab' })
    })

    it('reads the bearer token from localStorage by default', async () => {
      localStorage.setItem('token', 'stored-token')
      await apiRequest('/rooms')
      expect(lastCall()[1].headers.Authorization).toBe('Bearer stored-token')
    })

    it('reads the bearer token from an installed provider', async () => {
      setApiTokenProvider(() => 'provided-token')
      await apiRequest('/rooms')
      expect(lastCall()[1].headers.Authorization).toBe('Bearer provided-token')
    })

    it('omits the bearer when there is no token', async () => {
      await apiRequest('/rooms')
      expect(lastCall()[1].headers.Authorization).toBeUndefined()
    })

    it('omits the bearer when the call opts out', async () => {
      localStorage.setItem('token', 'stored-token')
      await apiRequest('/login', { method: 'POST', body: {}, auth: false })
      expect(lastCall()[1].headers.Authorization).toBeUndefined()
    })

    it('prefers an explicitly passed token', async () => {
      localStorage.setItem('token', 'stored-token')
      await apiRequest('/validate-token', { method: 'POST', body: {}, token: 'explicit' })
      expect(lastCall()[1].headers.Authorization).toBe('Bearer explicit')
    })
  })

  describe('failures', () => {
    it('throws VersionMismatchError and announces the gate on a 426', async () => {
      const body = {
        code: 'version_mismatch',
        message: 'This version of the planner is out of date. Please refresh the page.',
        requiredVersion: '7.0',
        receivedVersion: '6.0',
      }
      mockFetch.mockResolvedValueOnce(jsonResponse(426, body))

      await expect(apiRequest('/rooms')).rejects.toThrowError(VersionMismatchError)
      expect(emitSpy).toHaveBeenCalledWith('versionMismatch', { source: 'rest', body })
    })

    it('still announces the gate when the 426 body is unreadable', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(426, null))

      const error = await failure<VersionMismatchError>(apiRequest('/rooms'))
      expect(error).toBeInstanceOf(VersionMismatchError)
      expect(error.requiredVersion).toBeNull()
      expect(emitSpy).toHaveBeenCalledWith('versionMismatch', { source: 'rest', body: undefined })
    })

    it('throws ApiError carrying the status, message and code', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(409, {
        code: 'revision_mismatch',
        message: 'Preferences changed elsewhere; reload before saving again.',
      }))

      const error = await failure(savePreferences({ summaryHidden: true }, 3))
      expect(error).toBeInstanceOf(ApiError)
      expect(error.status).toBe(409)
      expect(error.code).toBe('revision_mismatch')
      expect(error.message).toBe('Preferences changed elsewhere; reload before saving again.')
    })

    it('falls back to a generic message when the body has none', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(503, null))
      const error = await failure(apiRequest('/rooms'))
      expect(error.message).toBe('Request failed with status 503')
      expect(error.code).toBeNull()
    })

    it('throws ApiNetworkError when the request never lands', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      const error = await failure<ApiNetworkError>(apiRequest('/rooms'))
      expect(error).toBeInstanceOf(ApiNetworkError)
      expect(error.message).toContain('Failed to fetch')
    })

    it('treats a 204 as an empty body', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 204, json: vi.fn() })
      await expect(apiRequest('/rooms/x/leave', { method: 'POST' })).resolves.toBeNull()
    })
  })

  describe('routes', () => {
    const expectCall = (method: string, path: string) => {
      const [url, init] = lastCall()
      expect(url).toBe(`${apiUrl}${path}`)
      expect(init.method).toBe(method)
    }

    it('lists rooms', async () => {
      await listRooms()
      expectCall('GET', '/rooms')
    })

    it('creates a room', async () => {
      await createRoom({ roomId: 'abc', name: 'Tab', factories: [] })
      expectCall('POST', '/rooms')
      expect(JSON.parse(lastCall()[1].body)).toEqual({ roomId: 'abc', name: 'Tab', factories: [] })
    })

    it('adopts a room', async () => {
      await adoptRoom({ roomId: 'abc', name: 'Tab' })
      expectCall('POST', '/rooms/adopt')
    })

    it('reorders rooms', async () => {
      await reorderRooms(['a', 'b'])
      expectCall('PUT', '/rooms/order')
      expect(JSON.parse(lastCall()[1].body)).toEqual({ roomIds: ['a', 'b'] })
    })

    it('renames a room', async () => {
      await renameRoom('room 1', 'New name')
      expectCall('PUT', '/rooms/room%201/name')
      expect(JSON.parse(lastCall()[1].body)).toEqual({ name: 'New name' })
    })

    it('shares a room with and without a slug', async () => {
      await shareRoom('abc', 'my-slug')
      expectCall('POST', '/rooms/abc/share')
      expect(JSON.parse(lastCall()[1].body)).toEqual({ slug: 'my-slug' })

      await shareRoom('abc')
      expect(JSON.parse(lastCall()[1].body)).toEqual({})
    })

    it('unshares a room', async () => {
      await unshareRoom('abc')
      expectCall('POST', '/rooms/abc/unshare')
    })

    it('sets and removes a room password', async () => {
      await setRoomPassword('abc', 'hunter2')
      expectCall('PUT', '/rooms/abc/password')
      expect(JSON.parse(lastCall()[1].body)).toEqual({ password: 'hunter2' })

      await removeRoomPassword('abc')
      expectCall('DELETE', '/rooms/abc/password')
    })

    it('exchanges a password for a visitor token without a bearer', async () => {
      localStorage.setItem('token', 'stored-token')
      await authenticateRoom('abc', 'hunter2')
      expectCall('POST', '/rooms/abc/auth')
      expect(lastCall()[1].headers.Authorization).toBeUndefined()
    })

    it('joins a room, carrying the visitor token when there is one', async () => {
      await joinRoom('abc', 'visitor-token')
      expectCall('POST', '/rooms/abc/join')
      expect(JSON.parse(lastCall()[1].body)).toEqual({ visitorToken: 'visitor-token' })

      await joinRoom('abc')
      expect(JSON.parse(lastCall()[1].body)).toEqual({})
    })

    it('leaves and deletes a room', async () => {
      await leaveRoom('abc')
      expectCall('POST', '/rooms/abc/leave')

      await deleteRoom('abc')
      expectCall('DELETE', '/rooms/abc')
    })

    it('looks a room up by slug, lowercased', async () => {
      await lookupRoomBySlug('Three-Word-Slug')
      expectCall('GET', '/rooms/by-slug/three-word-slug')
    })

    it('runs the legacy import route', async () => {
      await legacyAutoImport(0)
      expectCall('POST', '/rooms/legacy/auto-import')
      expect(JSON.parse(lastCall()[1].body)).toEqual({ localTabCount: 0 })
    })

    it('reads and writes preferences', async () => {
      await getPreferences()
      expectCall('GET', '/preferences')

      await savePreferences({ summaryHidden: true }, 2)
      expectCall('PUT', '/preferences')
      expect(JSON.parse(lastCall()[1].body)).toEqual({ prefs: { summaryHidden: true }, baseRevision: 2 })
    })

    it('creates and reads snapshot share links', async () => {
      const tab = { id: 'tab-1', name: 'Tab', factories: [] } as unknown as FactoryTab
      await createSnapshotShare(tab)
      expectCall('POST', '/share')
      expect(lastCall()[1].headers[APP_VERSION_HEADER]).toBe(PROTOCOL_VERSION)
      expect(JSON.parse(lastCall()[1].body)).toEqual(tab)

      await getSnapshotShare('three-word-id')
      expectCall('GET', '/share/three-word-id')
    })
  })
})
