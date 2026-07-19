import { SyncActions } from '@/stores/sync/sync-actions'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FactoryTab } from '@/interfaces/planner/FactoryInterface'
import { newFactory } from '@/utils/factory-management/factory'

const apiUrl = 'http://mock.com'
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

const expectedHeaders = {
  'Content-Type': 'application/json',
  Authorization: 'Bearer mock-token',
}

const okResponse = (payload: unknown) => ({
  ok: true,
  json: vi.fn().mockResolvedValue(payload),
})

describe('SyncActions', () => {
  let syncActions: SyncActions

  beforeEach(() => {
    global.fetch = mockFetch

    vi.clearAllMocks()
    mockAuthStore.getToken.mockResolvedValue('mock-token')
    mockAuthStore.validateToken.mockResolvedValue(true)

    syncActions = new SyncActions(mockAuthStore)
  })

  describe('loadTabMeta', () => {
    it('fetches the tab metadata list', async () => {
      const payload = {
        tabs: [{ tabId: 'tab-1', name: 'Main', order: 0, lastSaved: new Date().toISOString() }],
        migrated: false,
      }
      mockFetch.mockResolvedValue(okResponse(payload))

      const result = await syncActions.loadTabMeta()

      expect(result).toStrictEqual(payload)
      expect(mockFetch).toHaveBeenCalledWith(`${apiUrl}/tabs`, {
        method: 'GET',
        headers: expectedHeaders,
      })
    })

    it('returns undefined when the token is invalid', async () => {
      mockAuthStore.validateToken.mockResolvedValue(false)

      expect(await syncActions.loadTabMeta()).toBeUndefined()
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('throws on server errors', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500, json: vi.fn().mockResolvedValue({}) })

      await expect(syncActions.loadTabMeta()).rejects.toThrowError('failed with status 500')
    })
  })

  describe('loadAllTabs', () => {
    it('fetches the full tab payload', async () => {
      const payload = {
        tabs: [{ tabId: 'tab-1', name: 'Main', order: 0, lastSaved: new Date().toISOString(), data: [] }],
        migrated: true,
      }
      mockFetch.mockResolvedValue(okResponse(payload))

      const result = await syncActions.loadAllTabs()

      expect(result).toStrictEqual(payload)
      expect(mockFetch).toHaveBeenCalledWith(`${apiUrl}/tabs/full`, {
        method: 'GET',
        headers: expectedHeaders,
      })
    })
  })

  describe('saveTab', () => {
    it('PUTs the tab name, order and factory data to /tabs/:tabId', async () => {
      const tab: FactoryTab = { id: 'tab-1', name: 'Main', factories: [newFactory('Foo')] }
      const lastSaved = new Date().toISOString()
      mockFetch.mockResolvedValue(okResponse({ message: 'Tab saved successfully', lastSaved }))

      const result = await syncActions.saveTab(tab, 3)

      expect(result.lastSaved).toBe(lastSaved)
      expect(mockFetch).toHaveBeenCalledWith(`${apiUrl}/tabs/tab-1`, {
        method: 'PUT',
        headers: expectedHeaders,
        body: JSON.stringify({ name: 'Main', order: 3, data: tab.factories }),
      })
    })

    it('throws when there is no token', async () => {
      mockAuthStore.getToken.mockResolvedValue(undefined)

      const tab: FactoryTab = { id: 'tab-1', name: 'Main', factories: [] }
      await expect(syncActions.saveTab(tab, 0)).rejects.toThrowError('No token found')
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('throws on server errors so the store can retry', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 502, json: vi.fn().mockResolvedValue({}) })

      const tab: FactoryTab = { id: 'tab-1', name: 'Main', factories: [] }
      await expect(syncActions.saveTab(tab, 0)).rejects.toThrowError('failed with status 502')
    })
  })

  describe('saveTabMeta', () => {
    it('PUTs a metadata-only update without factory data', async () => {
      mockFetch.mockResolvedValue(okResponse({ lastSaved: new Date().toISOString() }))

      await syncActions.saveTabMeta('tab-1', { name: 'Renamed' })

      expect(mockFetch).toHaveBeenCalledWith(`${apiUrl}/tabs/tab-1`, {
        method: 'PUT',
        headers: expectedHeaders,
        body: JSON.stringify({ name: 'Renamed' }),
      })
    })
  })

  describe('deleteTab', () => {
    it('DELETEs the tab', async () => {
      mockFetch.mockResolvedValue(okResponse({ message: 'Tab deleted successfully' }))

      await syncActions.deleteTab('tab-1')

      expect(mockFetch).toHaveBeenCalledWith(`${apiUrl}/tabs/tab-1`, {
        method: 'DELETE',
        headers: expectedHeaders,
      })
    })
  })

  describe('saveTabOrder', () => {
    it('PUTs the batch order payload', async () => {
      mockFetch.mockResolvedValue(okResponse({ message: 'Tab order saved' }))

      const entries = [{ tabId: 'tab-1', order: 1 }, { tabId: 'tab-2', order: 0 }]
      await syncActions.saveTabOrder(entries)

      expect(mockFetch).toHaveBeenCalledWith(`${apiUrl}/tabs/order`, {
        method: 'PUT',
        headers: expectedHeaders,
        body: JSON.stringify(entries),
      })
    })
  })
})
