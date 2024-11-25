import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/stores/auth-store'
import { InvalidTokenError } from '@/errors/InvalidTokenError'
import { BackendOutageError } from '@/errors/BackendOutageError'

const apiUrl = 'http://mock.com'

describe('auth-store', () => {
  let mockFetch: ReturnType<typeof vi.fn>
  let authStore: ReturnType<typeof useAuthStore>

  beforeEach(() => {
    // Reset mocks before each test
    vi.resetAllMocks()

    // Create a mock fetch function
    mockFetch = vi.fn()

    vi.mock('@/config/config', () => ({
      config: {
        apiUrl: 'http://mock.com',
        dataVersion: '1.0.0',
      },
    }))

    // Initialize the auth store with the mocked fetch
    authStore = useAuthStore(mockFetch)
  })

  describe('token getters/setters', () => {
    it('should set and retrieve the token', async () => {
      authStore.setToken('mock-token')
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ token: 'mock-token' }),
      })
      const token = await authStore.getToken()
      expect(token).toBe('mock-token')
    })

    it('should clear the token when set to an empty string', () => {
      authStore.setToken('')
      expect(localStorage.getItem('token')).toBeNull()
    })

    it('should set the token properly', () => {
      authStore.setToken('token-123')
      expect(localStorage.getItem('token')).toBe('token-123')
    })

    it('should throw InvalidTokenError if the token is missing during retrieval', async () => {
      authStore.setToken('')
      await expect(authStore.getToken()).rejects.toThrow(new InvalidTokenError('No token provided'))
    })
  })

  describe('validateToken', () => {
    it('should validate a valid token successfully', async () => {
      // Mock fetch response for token validation
      mockFetch.mockResolvedValueOnce({ ok: true })

      const result = await authStore.validateToken('mock-token')
      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(`${apiUrl}/validate-token`, expect.any(Object))
    })

    it('should throw InvalidTokenError for invalid tokens during validation', async () => {
      // Mock fetch response for invalid token
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 })

      await expect(authStore.validateToken('invalid-token')).rejects.toThrowError(InvalidTokenError)
    })

    it('should throw BackendOutageError for server errors during validation', async () => {
      // Mock fetch response for server error
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })
      await expect(authStore.validateToken('mock-token')).rejects.toThrowError(BackendOutageError)

      mockFetch.mockResolvedValueOnce({ ok: false, status: 502 })
      await expect(authStore.validateToken('mock-token')).rejects.toThrowError(BackendOutageError)
    })

    it('should handle unknown errors during validation', async () => {
      // Mock fetch to throw an error
      mockFetch.mockImplementationOnce(() => {
        throw new Error('Network error')
      })

      await expect(authStore.validateToken('mock-token')).rejects.toThrowError(
        'validate-token could not be performed!'
      )
    })
    it('should handle empty responses during validation', async () => {
      // Mock fetch to throw an error
      mockFetch.mockResolvedValue(undefined)

      await expect(authStore.validateToken('mock-token')).rejects.toThrowError(
        'No response from server!'
      )
    })

    it('should handle unknown responses during validation', async () => {
      // Mock fetch to throw an error
      mockFetch.mockResolvedValueOnce({ ok: false, status: 1337 })

      await expect(authStore.validateToken('mock-token')).rejects.toThrowError(
        'validateToken: Unknown response during token validation'
      )
    })
  })

  describe('handleLogin', () => {
    it('should log in a user with valid credentials', async () => {
      // Mock fetch response for login
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ token: 'mock-token' }),
      })

      const result = await authStore.handleLogin('test-user', 'password123')
      expect(result).toBe(true)
      expect(authStore.getLoggedInUser()).toBe('test-user')
      expect(localStorage.getItem('token')).toBe('mock-token')
    })

    it('should handle invalid credentials during login', async () => {
      // Mock fetch response for invalid credentials
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: vi.fn().mockResolvedValue({}),
      })

      const result = await authStore.handleLogin('test-user', 'wrong-password')
      expect(result).toBe('Credentials incorrect. Please try again.')
    })

    it('should handle server errors during login', async () => {
      // Mock fetch response for server error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: vi.fn().mockResolvedValue({}),
      })

      const result = await authStore.handleLogin('test-user', 'password123')
      expect(result).toBe('Backend server error! Please report this on Discord!')
    })

    it('should handle gateway errors during login', async () => {
      // Mock fetch response for server error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: vi.fn().mockResolvedValue({}),
      })

      const result = await authStore.handleLogin('test-user', 'password123')
      expect(result).toBe('Backend server offline! Please report this to Maelstrome on Discord!')
    })

    it('should handle unknown responses during login', async () => {
      // Mock fetch response for server error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 1337,
        json: vi.fn().mockResolvedValue({}),
      })

      const result = await authStore.handleLogin('test-user', 'password123')
      expect(result).toBe('Unknown response! Please report this on Discord!')
    })

    it('should handle request errors during login', async () => {
      // Mock fetch to throw an error
      mockFetch.mockImplementationOnce(() => {
        throw new Error('Network error')
      })

      const result = await authStore.handleLogin('test-user', 'password123')
      expect(result).toBe('Backend server offline! Please report this error on Discord: "Network error"')
    })

    it('should handle unknown errors', async () => {
      // Mock fetch to throw an error
      mockFetch.mockImplementationOnce(() => {
        // eslint-disable-next-line no-throw-literal
        throw 'Something went majorly bang'
      })

      const result = await authStore.handleLogin('test-user', 'password123')
      expect(result).toBe('An unknown login error occurred that could not be handled! Please report this on Discord!')
    })
  })

  describe('handleLogout', () => {
    it('should clear the logged-in user and token on logout', () => {
      authStore.setLoggedInUser('test-user')
      authStore.setToken('mock-token')

      authStore.handleLogout()

      expect(authStore.getLoggedInUser()).toBe('')
      expect(localStorage.getItem('loggedInUser')).toBeNull()
      expect(localStorage.getItem('token')).toBeNull()
    })
  })

  describe('handleRegister', () => {
    it('should register and log in a new user', async () => {
      // Mock fetch response for registration
      mockFetch.mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue({}) })

      // Mock fetch response for login
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ token: 'mock-token' }),
      })

      const result = await authStore.handleRegister('new-user', 'password123')
      expect(result).toBe(true)
      expect(authStore.getLoggedInUser()).toBe('new-user')
      expect(localStorage.getItem('token')).toBe('mock-token')
    })

    it('should handle registration errors gracefully', async () => {
      // Mock fetch response for registration error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: vi.fn().mockResolvedValue({ message: 'Username already exists' }),
      })

      const result = await authStore.handleRegister('new-user', 'password123')
      expect(result).toBe('Registration failed. Username already exists')
    })

    it('should handle unexpected registration errors gracefully', async () => {
      // Mock fetch response for registration error
      mockFetch.mockImplementationOnce(() => {
        throw new Error('Something went bang')
      })

      const result = await authStore.handleRegister('new-user', 'password123')
      expect(result).toBe(`Backend server offline! Please report this error on Discord: "Something went bang"`)
    })
    it('should handle unexpected registration non instanced errors gracefully', async () => {
      // Mock fetch response for registration error
      mockFetch.mockImplementationOnce(() => {
        // eslint-disable-next-line no-throw-literal
        throw 'Something went majorly bang'
      })

      const result = await authStore.handleRegister('new-user', 'password123')
      expect(result).toBe("Registration failed with an unknown error that wasn't caught!")
    })

    it('should handle empty responses gracefully', async () => {
      // Mock fetch response for registration error
      mockFetch.mockResolvedValueOnce(undefined)

      const result = await authStore.handleRegister('new-user', 'password123')
      expect(result).toBe('Registration failed due to incorrect response from the server! Please report this on Discord!')
    })

    it('should handle already registered usernames', async () => {
      // Mock fetch response for registration error
      mockFetch.mockResolvedValueOnce(mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: vi.fn().mockResolvedValue({}),
      }))

      const result = await authStore.handleRegister('new-user', 'password123')
      expect(result).toBe('User new-user has already been registered.')
    })

    it('should handle backend errors gracefully', async () => {
      // Mock fetch response for registration error
      mockFetch.mockResolvedValueOnce(mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: vi.fn().mockResolvedValue({}),
      }))

      const result = await authStore.handleRegister('new-user', 'password123')
      expect(result).toBe('Backend server error! Please report this on Discord!')
    })
    it('should handle backend outages gracefully', async () => {
      // Mock fetch response for registration error
      mockFetch.mockResolvedValueOnce(mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: vi.fn().mockResolvedValue({}),
      }))

      const result = await authStore.handleRegister('new-user', 'password123')
      expect(result).toBe('Backend server offline! Please report this to Maelstrome on Discord!')
    })
  })
})
