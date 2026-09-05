import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as api from '@/api/client'
import { ApiError, ApiNetworkError, setApiTokenProvider, VersionMismatchError } from '@/api/client'
import { BackendOutageError } from '@/errors/BackendOutageError'
import { InvalidTokenError } from '@/errors/InvalidTokenError'
import eventBus from '@/utils/eventBus'

const TOKEN_KEY = 'token'
const USER_KEY = 'loggedInUser'

const DISCORD_500 = 'Backend server error! Please report this on Discord!'
const DISCORD_502 = 'Backend server offline! Please report this to Maelstrome on Discord!'
const OUT_OF_DATE = 'This version of the planner is out of date. Please refresh the page.'

const persist = (key: string, value: string) => {
  if (value === '') {
    localStorage.removeItem(key)
  } else {
    localStorage.setItem(key, value)
  }
}

/** The `message` a backend failure carries, or the generic per-status wording. */
const backendMessage = (error: ApiError, fallback: string): string => {
  const message = (error.body as { message?: unknown } | null)?.message
  return typeof message === 'string' && message !== '' ? message : fallback
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string>(localStorage.getItem(TOKEN_KEY) ?? '')
  const loggedInUser = ref<string>(localStorage.getItem(USER_KEY) ?? '')
  const isLoggedIn = computed(() => token.value !== '' && loggedInUser.value !== '')

  // Every API call reads the live token from here rather than from localStorage.
  setApiTokenProvider(() => token.value || null)

  // ==== Session state

  const setToken = (value: string) => {
    token.value = value ?? ''
    persist(TOKEN_KEY, token.value)
  }

  const setLoggedInUser = (username: string) => {
    loggedInUser.value = username ?? ''
    persist(USER_KEY, loggedInUser.value)
  }

  /** Synchronous by design: validating the token is a separate, on-demand call. */
  const getToken = (): string => token.value

  const getLoggedInUser = (): string => loggedInUser.value

  const logout = () => {
    setLoggedInUser('')
    setToken('')
  }

  const expireSession = () => {
    eventBus.emit('sessionExpired')
    logout()
  }

  // ==== Token validation

  /**
   * Ask the backend whether a token is still good. Callers decide when that is
   * worth a round-trip; nothing does it implicitly.
   */
  const validateToken = async (candidate: string = token.value): Promise<boolean> => {
    if (!candidate) throw new InvalidTokenError('No token provided')

    try {
      await api.validateToken(candidate)
      return true
    } catch (error) {
      if (error instanceof VersionMismatchError) throw error
      if (error instanceof ApiNetworkError) throw new Error('validate-token could not be performed!')
      if (error instanceof ApiError) {
        if (error.status === 401) {
          expireSession()
          throw new InvalidTokenError()
        }
        if (error.status >= 500) throw new BackendOutageError()
        throw new Error(`validateToken: Unknown response during token validation (${error.status})`)
      }
      throw error
    }
  }

  // ==== Auth flows. Each returns `true`, or the message to show the user.

  const login = async (username: string, password: string): Promise<true | string> => {
    try {
      const { token: issued } = await api.login(username, password)
      setLoggedInUser(username)
      setToken(issued)

      // Tells the sync layer to pick the account's data up.
      eventBus.emit('loggedIn')
      return true
    } catch (error) {
      if (error instanceof VersionMismatchError) return OUT_OF_DATE
      if (error instanceof ApiNetworkError) {
        return `Backend server offline! Please report this error on Discord: "${error.message}"`
      }
      if (error instanceof ApiError) {
        if (error.status === 400 || error.status === 401) return 'Credentials incorrect. Please try again.'
        if (error.status === 500) return DISCORD_500
        if (error.status === 502) return DISCORD_502
        return 'Unknown response! Please report this on Discord!'
      }
      return 'An unknown login error occurred that could not be handled! Please report this on Discord!'
    }
  }

  const register = async (username: string, password: string): Promise<true | string> => {
    try {
      await api.register(username, password)
    } catch (error) {
      if (error instanceof VersionMismatchError) return OUT_OF_DATE
      if (error instanceof ApiNetworkError) {
        return `Backend server offline! Please report this error on Discord: "${error.message}"`
      }
      if (error instanceof ApiError) {
        if (error.status === 400) return backendMessage(error, 'Registration failed.')
        if (error.status === 500) return DISCORD_500
        if (error.status === 502) return DISCORD_502
        return `Registration failed. ${backendMessage(error, 'Unknown response.')}`
      }
      return "Registration failed with an unknown error that wasn't caught!"
    }

    // Registration does not issue a token, so log in straight after.
    return login(username, password)
  }

  const changePassword = async (
    currentPassword: string,
    newPassword: string,
  ): Promise<true | string> => {
    try {
      await api.changePassword(currentPassword, newPassword)
      return true
    } catch (error) {
      if (error instanceof VersionMismatchError) return OUT_OF_DATE
      if (error instanceof ApiNetworkError) {
        return `Backend server offline! Please report this error on Discord: "${error.message}"`
      }
      if (error instanceof ApiError) {
        if (error.status === 401) {
          expireSession()
          return 'Your session expired. Please log in again.'
        }
        if (error.status === 400) return backendMessage(error, 'Password change failed.')
        return DISCORD_500
      }
      return 'Password change failed for an unknown reason. Please report this on Discord!'
    }
  }

  return {
    // State
    token,
    loggedInUser,
    isLoggedIn,

    // Actions
    setToken,
    setLoggedInUser,
    getToken,
    getLoggedInUser,
    validateToken,
    login,
    register,
    logout,
    changePassword,
  }
})
