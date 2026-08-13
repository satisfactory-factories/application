import { config } from '@/config/config'
import { ClientTooOldError } from '@/errors/ClientTooOldError'
import eventBus from '@/utils/eventBus'

// Sent on every request to the API so the backend can refuse writes from a tab too old to know
// the current save shape. A request without it is a build from before the gate existed.
export const CLIENT_VERSION_HEADER = 'X-Planner-Version'

// Set by the API on any response to a client it considers stale. Reads carry it too, so an idle
// tab finds out it is out of date without having to try a save first.
export const CLIENT_OUTDATED_HEADER = 'X-Planner-Client-Outdated'

// Machine-readable body code on a refused write, so it can never be mistaken for a validation
// failure or an outage.
export const CLIENT_TOO_OLD_CODE = 'CLIENT_TOO_OLD'

// Every API call goes through here. Pass the token (even an empty one) to send Authorization;
// omit it entirely for anonymous endpoints.
export const apiHeaders = (token?: string): Record<string, string> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    [CLIENT_VERSION_HEADER]: config.appVersion,
  }

  if (token !== undefined) {
    headers.Authorization = `Bearer ${token}`
  }

  return headers
}

// Mocked responses in tests don't always carry headers, and neither does a proxy error page.
const readHeader = (response: Response, header: string): string | null => {
  try {
    return response.headers?.get?.(header) ?? null
  } catch {
    return null
  }
}

// Tell the app the build it is running can no longer write. Anything that talks to the API can
// call this; the sync store stops syncing and the dialog blocks until the page is reloaded.
export const announceClientOutdated = (minimumVersion: string) => {
  eventBus.emit('clientOutdated', { minimumVersion })
}

// Reads don't fail on a stale client, they just say so in a header.
export const checkResponseForOutdatedClient = (response: Response): boolean => {
  const minimum = readHeader(response, CLIENT_OUTDATED_HEADER)
  if (!minimum) {
    return false
  }

  console.warn(`api: The server reports this client (${config.appVersion}) is below its minimum of ${minimum}.`)
  announceClientOutdated(minimum)
  return true
}

// 426 is the gate's status, but match on the body code as well so a proxy rewriting the status
// can't turn a required reload into an unexplained failure.
export const isClientTooOldResponse = (response: Response, body?: { code?: string }): boolean => {
  return response.status === 426 || body?.code === CLIENT_TOO_OLD_CODE
}

export const clientTooOldError = (response: Response, body?: { code?: string, minimumVersion?: string }): ClientTooOldError => {
  return new ClientTooOldError(body?.minimumVersion ?? readHeader(response, CLIENT_OUTDATED_HEADER) ?? 'unknown')
}
