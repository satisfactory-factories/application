import { BackendFactoryDataResponse } from '@/interfaces/BackendFactoryDataResponse'
import { config } from '@/config/config'
import {
  apiHeaders,
  checkResponseForOutdatedClient,
  clientTooOldError,
  isClientTooOldResponse,
} from '@/utils/api'

export class SyncActions {
  private readonly authStore: any
  private readonly appStore: any
  private readonly apiUrl: string
  // Whether this session has seen what the account holds. An empty plan is only allowed to
  // overwrite it once we have — see the guard in syncData.
  private reconciledWithServer = false

  constructor (authStore: any, appStore: any) {
    this.authStore = authStore
    this.appStore = appStore
    this.apiUrl = config.apiUrl
  }

  async loadServerData (forceLoad = false): Promise<'oos' | void | true> {
    const token = await this.authStore.getToken()
    const isTokenValid = await this.authStore.validateToken(token)
    if (!isTokenValid) {
      console.error('loadServerData: Token is invalid!')
      return
    }

    let dataObject: BackendFactoryDataResponse | false
    try {
      dataObject = await this.getServerData()

      if (!dataObject) {
        console.warn('loadServerData: No data found on server. Aborting data load.')
        // Nothing on the account means nothing an empty plan could destroy.
        this.reconciledWithServer = true
        return
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error('loadServerData: Data load failed:', error)
        alert(`Unable to complete data load due to a server error. Please report the following error to Discord: ${error.message}`)
      }
      return
    }

    // Either branch below means this session has now seen the account's copy, whether it took
    // it or decided the local plan was ahead of it.
    this.reconciledWithServer = true

    // Don't care about sync state if we're forcing a load
    if (forceLoad) {
      console.log('loadServerData: Forcing data load.')
      this.appStore.loadServerPlan(dataObject.data)
      return true
    }

    const isOOS = this.checkForOOS(dataObject)
    console.log('loadServerData: OSS status:', isOOS)

    return isOOS ? 'oos' : undefined
  }

  async syncData (
    stopSyncing: boolean,
    dataSavePending: boolean
  ): Promise<boolean | void> {
    if (stopSyncing) {
      console.warn('syncData: Syncing is disabled.')
      return
    }
    if (!dataSavePending) {
      return
    }

    // Ask appStore if it's ready
    if (!this.appStore.isLoaded) {
      console.log('syncData: appStore is not ready, aborting.')
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

    // The whole tab, not just its factories: the planner version, the power target and any
    // memberless groups are plan state, and uploading only the array quietly dropped them on
    // every restore. The API accepts both shapes — see the note on /save.
    const data = this.appStore.getCurrentTab()
    if (!data) {
      console.warn('syncData: No tab to save!')
      return
    }

    // An emptied plan is a plan. Deleting your last factory, or keeping folders you have not
    // filled yet, has to reach the account or the next restore hands the deleted work back.
    //
    // But an empty plan is also what this session looks like before it has loaded the account's
    // copy, and those two are indistinguishable from here. So an empty plan may only be written
    // once we have seen what is up there — otherwise a tick landing in the gap between logging
    // in and the load completing would upload nothing over everything.
    if (!data.factories?.length && !this.reconciledWithServer) {
      console.warn('syncData: Plan is empty and the account copy has not been loaded yet, not saving.')
      return
    }

    let response: Response
    try {
      response = await fetch(`${this.apiUrl}/save`, {
        method: 'POST',
        headers: apiHeaders(token),
        body: JSON.stringify(data),
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
      // What is up there is now what we just sent, so a later emptying of this plan is safe to
      // write without loading it back first.
      this.reconciledWithServer = true
      return true
    } else if (isClientTooOldResponse(response, object)) {
      // Refused, not failed: this build is too old to write and must not keep retrying.
      throw clientTooOldError(response, object)
    } else if (response.status === 500 || response.status === 502) {
      throw new Error('syncData: Server 5xx error')
    }
  }

  async getServerData (): Promise<BackendFactoryDataResponse | false> {
    const token = await this.authStore.getToken()
    const response = await fetch(`${this.apiUrl}/load`, {
      method: 'GET',
      headers: apiHeaders(token),
    })
    // Reads are never blocked, so this is how an idle tab learns it has gone stale.
    checkResponseForOutdatedClient(response)
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
