import { BackendFactoryDataResponse } from '@/interfaces/BackendFactoryDataResponse'
import { config } from '@/config/config'

export class SyncActions {
  private authStore: any
  private appStore: any
  private apiUrl: string

  constructor (authStore: any, appStore: any) {
    this.authStore = authStore
    this.appStore = appStore
    this.apiUrl = config.apiUrl
  }

  async loadServerData (forceLoad = false): Promise<'oos' | void> {
    const token = await this.authStore.getToken()
    const isTokenValid = await this.authStore.validateToken(token)
    if (!isTokenValid) {
      return
    }

    let dataObject
    try {
      dataObject = await this.getServerData()

      if (!dataObject) {
        console.warn('No data found on server. Aborting data load.')
        return
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error('Data load failed:', error)
        alert(`Unable to complete data load due to a server error. Please report the following error to Discord: ${error.message}`)
      }
      return
    }

    // Don't care about sync state if we're forcing a load
    if (forceLoad) {
      console.log('Forcing data load...', dataObject)
      this.appStore.setFactories(dataObject.data)
      return
    }

    return this.checkForOOS(dataObject) ? 'oos' : undefined
  }

  async syncData (stopSyncing: boolean, dataSavePending: boolean): Promise<boolean | void> {
    if (stopSyncing) {
      console.warn('syncData: Syncing is disabled.')
      return
    }
    if (!dataSavePending) {
      return
    }

    let token
    try {
      token = await this.authStore.getToken()
      if (!token) {
        console.error('syncData: No token found!')
        return
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error('syncData: Token error:', error.message)
        return
      }
    }

    const data = this.appStore.getFactories()
    if (!data || !Object.keys(data).length) {
      console.warn('syncData: No data to save!')
      return
    }

    let response: Response
    try {
      response = await fetch(`${this.apiUrl}/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ data }),
      })
    } catch (error) {
      if (error instanceof Error) {
        console.error('Data save failed:', error)
        throw new Error(`syncData: Unexpected Response - ${error.message}`)
      }
      return false
    }
    if (!response) {
      console.error('syncData: No response from server!')
      return false
    }
    const object = await response.json()

    if (response.ok) {
      console.log('syncData: Data saved:', object)
      return true
    } else if (response.status === 500 || response.status === 502) {
      throw new Error('syncData: Server 5xx error')
    }
  }

  async getServerData (): Promise<BackendFactoryDataResponse | false> {
    const token = await this.authStore.getToken()
    const response = await fetch(`${this.apiUrl}/load`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    })
    const object = await response.json()
    const data = object?.data

    if (!object) {
      throw new Error('Unable to retrieve data object properly.')
    }

    if (response.ok) {
      if (!data) {
        throw new Error('Data load responded weirdly!')
      }
      return object
    } else {
      console.error('Data load failed:', object)
      throw new Error('Backend server unreachable for data load!')
    }
  }

  checkForOOS (data: BackendFactoryDataResponse): boolean {
    const serverSaved = new Date(data.lastSaved)
    const clientEdited = this.appStore.getLastEdit()
    if (clientEdited < serverSaved) {
      console.warn('Server data is ahead of remote, assuming out of sync.')
      return true
    }
    console.debug('Server data is behind client data, assuming local is correct.')

    return false
  }
}
