import { SyncActions } from '@/stores/sync/sync-actions'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { newFactory } from '@/utils/factory-management/factory'

const apiUrl = 'http://mock.com'
const mockData = { data: 'mock-data' }
const mockFetch = vi.fn()

// Mock configuration
vi.mock('@/config/config', () => ({
  config: {
    apiUrl: 'http://mock.com',
    dataVersion: '1.0.0',
  },
}))

// Mock stores
const mockAuthStore = {
  getToken: vi.fn().mockResolvedValue('mock-token'),
  validateToken: vi.fn().mockResolvedValue(true),
}

const mockAppStore = {
  getLastEdit: vi.fn(() => new Date(Date.now() - 1000 * 60)), // 1 minute ago
  getFactories: vi.fn(),
  setFactories: vi.fn(),
}

describe('SyncActions', () => {
  let syncActions: SyncActions

  beforeEach(() => {
    // Initialize the mock global fetch
    global.fetch = mockFetch

    // Reset mocks
    vi.clearAllMocks()

    // Instantiate SyncActions with mock stores
    syncActions = new SyncActions(mockAuthStore, mockAppStore)
  })

  describe('getServerData', () => {
    it('should fetch valid data from the server', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockData),
      })

      const result = await syncActions.getServerData()

      expect(result).toStrictEqual(mockData)
      expect(mockFetch).toHaveBeenCalledWith(`${apiUrl}/load`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-token',
        },
      })
    })

    it('should handle request errors properly', async () => {
      mockFetch.mockImplementation(() => {
        throw new Error('Network error')
      })

      await expect(syncActions.getServerData()).rejects.toThrowError('Network error')
    })

    it('should handle server errors properly', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: vi.fn().mockResolvedValue({}),
      })

      await expect(syncActions.getServerData()).rejects.toThrowError(
        'Backend server unreachable for data load!'
      )

      expect(mockFetch).toHaveBeenCalledWith(`${apiUrl}/load`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-token',
        },
      })
    })
  })

  describe('loadServerData', () => {
    it('should fetch and set factories when valid data is retrieved', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockData),
      })

      const result = await syncActions.loadServerData()

      expect(result).toBe(true)
      expect(mockAppStore.setFactories).toHaveBeenCalledWith(mockData.data)
    })

    it('should return "oos" when out-of-sync data is detected', async () => {
      const mockOutOfSyncData = {
        lastSaved: new Date(Date.now() + 1000 * 60).toISOString(), // Future date
        data: {},
      } as any

      vi.spyOn(syncActions, 'getServerData').mockResolvedValue(mockOutOfSyncData)

      const result = await syncActions.loadServerData()
      expect(result).toBe('oos')
    })

    it('should return undefined if the token is invalid', async () => {
      mockAuthStore.validateToken.mockResolvedValue(false)

      const result = await syncActions.loadServerData()
      expect(result).toBeUndefined()
    })

    it('should do nothing upon being OOS and not force loaded', async () => {
      const mockData = {
        user: 'foo',
        data: [
          newFactory('Foo1'),
        ],
        lastSaved: new Date(),
      }

      // Stub the getServerData
      vi.spyOn(syncActions, 'getServerData').mockResolvedValue(mockData)
      vi.spyOn(syncActions, 'checkForOOS').mockReturnValue(true)

      expect(await syncActions.loadServerData()).toBe('oos')

      expect(mockAppStore.setFactories).not.toHaveBeenCalled()
    })

    it('should correctly force load the factory data into appStore', async () => {
      const mockData = {
        user: 'foo',
        data: [
          newFactory('Foo1'),
          newFactory('Foo2'),
        ],
        lastSaved: new Date(),
      }

      // Stub the getServerData
      vi.spyOn(syncActions, 'getServerData').mockResolvedValue(mockData)
      vi.spyOn(syncActions, 'checkForOOS').mockReturnValue(true)

      await syncActions.loadServerData(true)

      expect(mockAppStore.setFactories).toHaveBeenCalledWith(mockData.data)
    })
  })

  describe('syncData', () => {
    it('should not sync if stopSyncing is true', async () => {
      await syncActions.syncData(true, true)

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should not sync if dataSavePending is false', async () => {
      await syncActions.syncData(false, false)

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should send sync with expected request params', async () => {
      mockAppStore.getFactories.mockReturnValueOnce({ someData: 'foo' })

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ message: 'All is good' }),
      })

      const result = await syncActions.syncData(false, true)

      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(`${apiUrl}/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer mock-token`,
        },
        body: JSON.stringify({ data: { someData: 'foo' } }),
      })
    })

    it('should handle server errors during sync', async () => {
      mockAppStore.getFactories.mockReturnValueOnce({ someData: 'foo' })

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: vi.fn().mockResolvedValue({}),
      })

      await expect(syncActions.syncData(false, true)).rejects.toThrowError(
        'syncData: Server 5xx error'
      )

      expect(mockFetch).toHaveBeenCalled()
    })
  })

  describe('checkForOOS', () => {
    it('should detect when server data is behind local (not OOS)', () => {
      const mockData = {
        lastSaved: new Date(Date.now() - 2000 * 60), // 2 minutes ago
      }

      // Apply mocks
      mockAppStore.getLastEdit = vi.fn().mockReturnValue(new Date()) // Now
      syncActions = new SyncActions(mockAuthStore, mockAppStore)

      const result = syncActions.checkForOOS(mockData as any)
      expect(result).toBe(false)
    })

    it('should detect when server data is ahead of local (potential OOS)', () => {
      const mockData = {
        lastSaved: new Date(), // Now
      }

      // Apply mocks
      mockAppStore.getLastEdit = vi.fn().mockReturnValue(new Date(Date.now() - 2000 * 60)) // 2 mins ago
      syncActions = new SyncActions(mockAuthStore, mockAppStore)

      const result = syncActions.checkForOOS(mockData as any)
      expect(result).toBe(true)
    })
  })
})
