/**
 * Offline mode is a choice, so it outlives a reload: someone who switched it on because their
 * connection keeps dropping should not be quietly put back online by refreshing the page.
 * Kept per browser, like the plans it protects.
 */
export const OFFLINE_MODE_KEY = 'offlineMode'

/**
 * The "you're still in offline mode" offer is made once per browser tab session. Session storage
 * survives a reload but not a closed tab, which is the lifetime wanted: one reminder per sitting,
 * not one per refresh.
 */
export const OFFLINE_RETURN_OFFERED_KEY = 'offlineReturnOffered'

export const readOfflineMode = (): boolean => {
  try {
    return localStorage.getItem(OFFLINE_MODE_KEY) === 'true'
  } catch {
    return false
  }
}

export const writeOfflineMode = (offline: boolean): void => {
  try {
    if (offline) localStorage.setItem(OFFLINE_MODE_KEY, 'true')
    else localStorage.removeItem(OFFLINE_MODE_KEY)
  } catch {
    // Blocked or full storage: offline mode still holds for this page, it just will not survive
    // a reload, which is how it behaved before it was remembered at all.
  }
}

export const hasOfferedReturn = (): boolean => {
  try {
    return sessionStorage.getItem(OFFLINE_RETURN_OFFERED_KEY) === 'true'
  } catch {
    return false
  }
}

export const rememberOfferedReturn = (): void => {
  try {
    sessionStorage.setItem(OFFLINE_RETURN_OFFERED_KEY, 'true')
  } catch {}
}

/** How long the offer stays up: long enough to read and reach for, short enough to ignore. */
export const OFFLINE_RETURN_PROMPT_MS = 20_000

/**
 * Whether a page that has just opened should offer the way back online: it opened in offline
 * mode, the browser has network to go back to, and this tab session has not been asked yet.
 */
export const shouldOfferReturn = (restoredOffline: boolean, stillOffline: boolean): boolean =>
  restoredOffline &&
  stillOffline &&
  (typeof navigator === 'undefined' || navigator.onLine !== false) &&
  !hasOfferedReturn()
