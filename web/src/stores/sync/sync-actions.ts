import { BackendTabsResponse } from '@/interfaces/BackendFactoryDataResponse'
import { FactoryTab } from '@/interfaces/planner/FactoryInterface'
import { config } from '@/config/config'

// Thin HTTP layer for the per-tab sync endpoints. Orchestration (debounce, queues,
// retries, the login merge flow) lives in sync-store.ts.
export class SyncActions {
  private readonly authStore: any
  private readonly appStore: any
  private readonly apiUrl: string

  constructor (authStore: any, appStore: any) {
    this.authStore = authStore
    this.appStore = appStore
    this.apiUrl = config.apiUrl
  }

  // Tab metadata listing (no factory data). Validates the token first as this is the
  // login-time entry point.
  async loadTabMeta (): Promise<BackendTabsResponse | undefined> {
    const token = await this.authStore.getToken()
    const isTokenValid = await this.authStore.validateToken(token)
    if (!isTokenValid) {
      console.error('loadTabMeta: Token is invalid!')
      return undefined
    }

    return await this.request('GET', '/tabs') as BackendTabsResponse
  }

  async loadAllTabs (): Promise<BackendTabsResponse> {
    return await this.request('GET', '/tabs/full') as BackendTabsResponse
  }

  async saveTab (tab: FactoryTab, order: number): Promise<{ lastSaved: string }> {
    return await this.request('PUT', `/tabs/${tab.id}`, {
      name: tab.name,
      order,
      data: tab.factories,
    }) as { lastSaved: string }
  }

  async saveTabMeta (tabId: string, meta: { name?: string, order?: number }): Promise<{ lastSaved: string }> {
    return await this.request('PUT', `/tabs/${tabId}`, meta) as { lastSaved: string }
  }

  async deleteTab (tabId: string): Promise<void> {
    await this.request('DELETE', `/tabs/${tabId}`)
  }

  async saveTabOrder (entries: { tabId: string, order: number }[]): Promise<void> {
    await this.request('PUT', '/tabs/order', entries)
  }

  private async request (method: string, path: string, body?: unknown): Promise<unknown> {
    const token = await this.authStore.getToken()
    if (!token) {
      throw new Error(`syncActions: No token found for ${method} ${path}!`)
    }

    const response = await fetch(`${this.apiUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })

    if (!response.ok) {
      throw new Error(`syncActions: ${method} ${path} failed with status ${response.status}`)
    }

    return response.json()
  }
}
