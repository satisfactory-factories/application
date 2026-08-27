import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { APP_VERSION_HEADER, PROTOCOL_VERSION } from 'common'
import { useAuthStore } from '@/stores/auth-store'
import { resetApiTokenProvider } from '@/api/client'
import { InvalidTokenError } from '@/errors/InvalidTokenError'
import { BackendOutageError } from '@/errors/BackendOutageError'
import { config } from '@/config/config'
import eventBus from '@/utils/eventBus'

const apiUrl = config.apiUrl

const jsonResponse = (status: number, body: unknown = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: vi.fn().mockResolvedValue(body),
})

describe('auth-store', () => {
  let mockFetch: ReturnType<typeof vi.fn>
  let emitSpy: ReturnType<typeof vi.spyOn>
  let authStore: ReturnType<typeof useAuthStore>

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())

    mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
    emitSpy = vi.spyOn(eventBus, 'emit')

    authStore = useAuthStore()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    emitSpy.mockRestore()
    resetApiTokenProvider()
  })

  describe('session state', () => {
    it('hydrates from localStorage', () => {
      localStorage.setItem('token', 'stored-token')
      localStorage.setItem('loggedInUser', 'stored-user')
      setActivePinia(createPinia())

      const hydrated = useAuthStore()
      expect(hydrated.getToken()).toBe('stored-token')
      expect(hydrated.getLoggedInUser()).toBe('stored-user')
      expect(hydrated.isLoggedIn).toBe(true)
    })

    it('persists the token and clears it when set empty', () => {
      authStore.setToken('token-123')
      expect(localStorage.getItem('token')).toBe('token-123')

      authStore.setToken('')
      expect(localStorage.getItem('token')).toBeNull()
      expect(authStore.getToken()).toBe('')
    })

    it('persists the username and clears it when set empty', () => {
      authStore.setLoggedInUser('test-user')
      expect(localStorage.getItem('loggedInUser')).toBe('test-user')

      authStore.setLoggedInUser('')
      expect(localStorage.getItem('loggedInUser')).toBeNull()
    })

    it('is not logged in with a token but no user', () => {
      authStore.setToken('token-123')
      expect(authStore.isLoggedIn).toBe(false)
    })

    it('reads the token without any network round-trip', () => {
      authStore.setToken('token-123')
      expect(authStore.getToken()).toBe('token-123')
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('validateToken', () => {
    it('validates a good token and sends the version header', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(200, { valid: true, decoded: { id: '1', username: 'a' } }))

      await expect(authStore.validateToken('mock-token')).resolves.toBe(true)

      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe(`${apiUrl}/validate-token`)
      expect(init.method).toBe('POST')
      expect(init.headers[APP_VERSION_HEADER]).toBe(PROTOCOL_VERSION)
      expect(init.headers.Authorization).toBe('Bearer mock-token')
      expect(JSON.parse(init.body)).toEqual({ token: 'mock-token' })
    })

    it('validates the stored token when given none', async () => {
      authStore.setToken('stored')
      mockFetch.mockResolvedValueOnce(jsonResponse(200, {}))

      await expect(authStore.validateToken()).resolves.toBe(true)
      expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ token: 'stored' })
    })

    it('throws InvalidTokenError when there is no token at all', async () => {
      await expect(authStore.validateToken()).rejects.toThrow(new InvalidTokenError('No token provided'))
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('expires the session on a 401', async () => {
      authStore.setToken('mock-token')
      authStore.setLoggedInUser('test-user')
      mockFetch.mockResolvedValueOnce(jsonResponse(401, { message: 'Invalid or expired token' }))

      await expect(authStore.validateToken('mock-token')).rejects.toThrowError(InvalidTokenError)
      expect(emitSpy).toHaveBeenCalledWith('sessionExpired')
      expect(authStore.getToken()).toBe('')
      expect(authStore.getLoggedInUser()).toBe('')
    })

    it('throws BackendOutageError on 5xx', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(500))
      await expect(authStore.validateToken('mock-token')).rejects.toThrowError(BackendOutageError)

      mockFetch.mockResolvedValueOnce(jsonResponse(502))
      await expect(authStore.validateToken('mock-token')).rejects.toThrowError(BackendOutageError)
    })

    it('reports a network failure as unperformable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      await expect(authStore.validateToken('mock-token')).rejects.toThrowError(
        'validate-token could not be performed!'
      )
    })

    it('reports an unexpected status', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(418))
      await expect(authStore.validateToken('mock-token')).rejects.toThrowError(
        'validateToken: Unknown response during token validation (418)'
      )
    })
  })

  describe('login', () => {
    it('stores the session and announces it', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(200, { token: 'mock-token' }))

      await expect(authStore.login('test-user', 'password123')).resolves.toBe(true)
      expect(authStore.getLoggedInUser()).toBe('test-user')
      expect(authStore.getToken()).toBe('mock-token')
      expect(localStorage.getItem('token')).toBe('mock-token')
      expect(emitSpy).toHaveBeenCalledWith('loggedIn')
    })

    it('sends no Authorization header when logged out', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(200, { token: 'mock-token' }))
      await authStore.login('test-user', 'password123')

      expect(mockFetch.mock.calls[0][1].headers.Authorization).toBeUndefined()
    })

    it('reports bad credentials', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(400, { message: 'Invalid credentials' }))
      await expect(authStore.login('test-user', 'wrong')).resolves.toBe('Credentials incorrect. Please try again.')
    })

    it('reports a server error', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(500))
      await expect(authStore.login('test-user', 'p')).resolves.toBe('Backend server error! Please report this on Discord!')
    })

    it('reports a gateway error', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(502))
      await expect(authStore.login('test-user', 'p')).resolves.toBe('Backend server offline! Please report this to Maelstrome on Discord!')
    })

    it('reports an unknown status', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(418))
      await expect(authStore.login('test-user', 'p')).resolves.toBe('Unknown response! Please report this on Discord!')
    })

    it('reports the version gate', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(426, {
        code: 'version_mismatch',
        message: 'out of date',
        requiredVersion: '7.0',
        receivedVersion: '6.0',
      }))

      await expect(authStore.login('test-user', 'p')).resolves.toBe(
        'This version of the planner is out of date. Please refresh the page.'
      )
      expect(emitSpy).toHaveBeenCalledWith('versionMismatch', expect.objectContaining({ source: 'rest' }))
    })

    it('reports a network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      const result = await authStore.login('test-user', 'p')
      expect(result).toContain('Backend server offline!')
      expect(result).toContain('Network error')
    })

    it('leaves the session untouched when login fails', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(400, {}))
      await authStore.login('test-user', 'wrong')

      expect(authStore.getToken()).toBe('')
      expect(authStore.getLoggedInUser()).toBe('')
      expect(emitSpy).not.toHaveBeenCalledWith('loggedIn')
    })
  })

  describe('logout', () => {
    it('clears the session', () => {
      authStore.setLoggedInUser('test-user')
      authStore.setToken('mock-token')

      authStore.logout()

      expect(authStore.getLoggedInUser()).toBe('')
      expect(localStorage.getItem('loggedInUser')).toBeNull()
      expect(localStorage.getItem('token')).toBeNull()
      expect(authStore.isLoggedIn).toBe(false)
    })
  })

  describe('register', () => {
    it('registers then logs the user straight in', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(200, { message: 'User registered successfully!' }))
      mockFetch.mockResolvedValueOnce(jsonResponse(200, { token: 'mock-token' }))

      await expect(authStore.register('new-user', 'password123')).resolves.toBe(true)
      expect(authStore.getLoggedInUser()).toBe('new-user')
      expect(authStore.getToken()).toBe('mock-token')
      expect(mockFetch.mock.calls[0][0]).toBe(`${apiUrl}/register`)
      expect(mockFetch.mock.calls[1][0]).toBe(`${apiUrl}/login`)
    })

    it('surfaces the backend message on a 400', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(400, { message: 'User already exists.' }))
      await expect(authStore.register('new-user', 'p')).resolves.toBe('User already exists.')
    })

    it('falls back when a 400 carries no message', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(400, {}))
      await expect(authStore.register('new-user', 'p')).resolves.toBe('Registration failed.')
    })

    it('reports a server error', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(500))
      await expect(authStore.register('new-user', 'p')).resolves.toBe('Backend server error! Please report this on Discord!')
    })

    it('reports a gateway error', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(502))
      await expect(authStore.register('new-user', 'p')).resolves.toBe('Backend server offline! Please report this to Maelstrome on Discord!')
    })

    it('reports an unknown status', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(418, { message: 'teapot' }))
      await expect(authStore.register('new-user', 'p')).resolves.toBe('Registration failed. teapot')
    })

    it('reports a network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Something went bang'))
      const result = await authStore.register('new-user', 'p')
      expect(result).toContain('Backend server offline!')
      expect(result).toContain('Something went bang')
    })
  })

  describe('changePassword', () => {
    it('changes the password', async () => {
      authStore.setToken('mock-token')
      mockFetch.mockResolvedValueOnce(jsonResponse(200, { message: 'Password changed successfully!' }))

      await expect(authStore.changePassword('old', 'new')).resolves.toBe(true)

      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe(`${apiUrl}/me/password`)
      expect(init.headers.Authorization).toBe('Bearer mock-token')
      expect(JSON.parse(init.body)).toEqual({ currentPassword: 'old', newPassword: 'new' })
    })

    it('surfaces the backend message on a 400', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(400, { message: 'Invalid credentials' }))
      await expect(authStore.changePassword('old', 'new')).resolves.toBe('Invalid credentials')
    })

    it('expires the session on a 401', async () => {
      authStore.setToken('mock-token')
      authStore.setLoggedInUser('test-user')
      mockFetch.mockResolvedValueOnce(jsonResponse(401, { message: 'Unauthorized' }))

      await expect(authStore.changePassword('old', 'new')).resolves.toBe('Your session expired. Please log in again.')
      expect(emitSpy).toHaveBeenCalledWith('sessionExpired')
      expect(authStore.getToken()).toBe('')
    })

    it('reports a server error', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(500))
      await expect(authStore.changePassword('old', 'new')).resolves.toBe('Backend server error! Please report this on Discord!')
    })
  })
})
