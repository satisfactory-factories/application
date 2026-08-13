import { SyncActions } from '@/stores/sync/sync-actions'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { newFactory } from '@/utils/factory-management/factory'
import { ClientTooOldError } from '@/errors/ClientTooOldError'
import eventBus from '@/utils/eventBus'

const apiUrl = 'http://mock.com'
const mockData = { data: 'mock-data' }
const mockFetch = vi.fn()

// Mock configuration
vi.mock('@/config/config', () => ({
  config: {
    apiUrl: 'http://mock.com',
    appVersion: '0.6.0',
    dataVersion: '1.0.0',
  },
}))

// What every request to the API is expected to carry.
const expectedHeaders = {
  'Content-Type': 'application/json',
  'X-Planner-Version': '0.6.0',
  Authorization: 'Bearer mock-token',
}

// Mock stores
const mockAuthStore = {
  getToken: vi.fn().mockResolvedValue('mock-token'),
  validateToken: vi.fn().mockResolvedValue(true),
}

const mockAppStore = {
  getLastEdit: vi.fn(() => new Date(Date.now() - 1000 * 60)), // 1 minute ago
  getFactories: vi.fn(),
  setFactories: vi.fn(),
  getCurrentTab: vi.fn(),
  loadServerPlan: vi.fn(),
  isLoaded: true,
}

// What the app uploads from v0.6: the whole tab, so plan-level state survives a restore.
const mockTab = (factories = [newFactory('Foo1')]) => ({
  id: 'tab-1',
  name: 'Default',
  factories,
  powerTarget: 40000,
  plannerVersion: '0.6',
})

const mockServerData = {
  user: 'foo',
  data: [
    newFactory('Foo1'),
  ],
  lastSaved: new Date(),
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
        headers: expectedHeaders,
      })
    })

    // A read is never refused, so this is the only way an idle tab finds out it is stale.
    it('should announce an outdated client from the response header on a read', async () => {
      const emit = vi.spyOn(eventBus, 'emit')
      mockFetch.mockResolvedValue({
        ok: true,
        headers: { get: (header: string) => header === 'X-Planner-Client-Outdated' ? '0.7.0' : null },
        json: vi.fn().mockResolvedValue(mockData),
      })

      await syncActions.getServerData()

      expect(emit).toHaveBeenCalledWith('clientOutdated', { minimumVersion: '0.7.0' })
    })

    it('should not announce anything when the server does not send the header', async () => {
      const emit = vi.spyOn(eventBus, 'emit')
      mockFetch.mockResolvedValue({
        ok: true,
        headers: { get: () => null },
        json: vi.fn().mockResolvedValue(mockData),
      })

      await syncActions.getServerData()

      expect(emit).not.toHaveBeenCalledWith('clientOutdated', expect.anything())
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
        headers: expectedHeaders,
      })
    })
  })

  describe('loadServerData', () => {
    beforeEach(() => {
      // Reset mocks
      vi.clearAllMocks()
      vi.spyOn(mockAuthStore, 'validateToken').mockResolvedValue(true)
    })
    it('should fetch and do nothing when OOS is false', async () => {
      vi.spyOn(syncActions, 'getServerData').mockResolvedValue(mockServerData)
      vi.spyOn(syncActions, 'checkForOOS').mockReturnValue(false)

      await syncActions.loadServerData()
      expect(syncActions.getServerData).toHaveBeenCalledTimes(1)
      expect(mockAppStore.setFactories).not.toHaveBeenCalled()
    })
    it('should fetch and do nothing when no data detected', async () => {
      vi.spyOn(syncActions, 'getServerData').mockResolvedValue(false)

      expect(await syncActions.loadServerData()).toBe(undefined)
      expect(mockAppStore.setFactories).not.toHaveBeenCalled()
    })

    it('should return "oos" when out-of-sync data is detected and is not force loaded', async () => {
      vi.spyOn(syncActions, 'getServerData').mockResolvedValue(mockServerData)
      vi.spyOn(syncActions, 'checkForOOS').mockReturnValue(true)

      const result = await syncActions.loadServerData()
      expect(result).toBe('oos')
    })

    it('should return undefined if the token is invalid', async () => {
      mockAuthStore.validateToken.mockResolvedValue(false)

      const result = await syncActions.loadServerData()
      expect(result).toBeUndefined()
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

      vi.spyOn(syncActions, 'getServerData').mockResolvedValue(mockData)
      vi.spyOn(syncActions, 'checkForOOS').mockReturnValue(true)

      expect(await syncActions.loadServerData(true)).toBe(true)
      // Both shapes are in accounts right now, so the store is handed the payload as it came.
      expect(mockAppStore.loadServerPlan).toHaveBeenCalledWith(mockData.data)
    })

    it('should hand a whole-tab payload to the store untouched', async () => {
      const tab = mockTab()
      vi.spyOn(syncActions, 'getServerData').mockResolvedValue({
        user: 'foo',
        data: tab,
        lastSaved: new Date(),
      })

      expect(await syncActions.loadServerData(true)).toBe(true)
      expect(mockAppStore.loadServerPlan).toHaveBeenCalledWith(tab)
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
      const tab = mockTab()
      mockAppStore.getCurrentTab.mockReturnValueOnce(tab)

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ message: 'All is good' }),
      })

      // Mock that the app store is ready
      mockAppStore.isLoaded = true

      const result = await syncActions.syncData(false, true)

      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(`${apiUrl}/save`, {
        method: 'POST',
        headers: expectedHeaders,
        // The tab, not the bare factory array: the planner version, the power target and any
        // memberless groups are plan state and were being dropped on every restore.
        body: JSON.stringify(tab),
      })
    })

    it('should refuse to keep syncing when the API says this client is too old', async () => {
      mockAppStore.getCurrentTab.mockReturnValueOnce(mockTab())

      mockFetch.mockResolvedValue({
        ok: false,
        status: 426,
        json: vi.fn().mockResolvedValue({
          code: 'CLIENT_TOO_OLD',
          minimumVersion: '0.7.0',
          receivedVersion: '0.6.0',
        }),
      })

      await expect(syncActions.syncData(false, true)).rejects.toThrow(ClientTooOldError)
    })

    // A proxy that rewrites the status must not turn a required reload into an unexplained
    // failure, so the body code is authoritative too.
    it('should recognise the too-old code even without the 426 status', async () => {
      mockAppStore.getCurrentTab.mockReturnValueOnce(mockTab())

      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: vi.fn().mockResolvedValue({ code: 'CLIENT_TOO_OLD', minimumVersion: '0.7.0' }),
      })

      await expect(syncActions.syncData(false, true)).rejects.toThrow(ClientTooOldError)
    })

    it('should carry the minimum version on the error', async () => {
      mockAppStore.getCurrentTab.mockReturnValueOnce(mockTab())

      mockFetch.mockResolvedValue({
        ok: false,
        status: 426,
        json: vi.fn().mockResolvedValue({ code: 'CLIENT_TOO_OLD', minimumVersion: '0.7.0' }),
      })

      await expect(syncActions.syncData(false, true)).rejects.toMatchObject({ minimumVersion: '0.7.0' })
    })

    it('should handle server errors during sync', async () => {
      mockAppStore.getCurrentTab.mockReturnValueOnce(mockTab())

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
