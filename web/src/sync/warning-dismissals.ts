import { ref } from 'vue'

/**
 * "Not now" on the offline offer, and the close button on the backend warning, both hold for the
 * rest of the browser tab session. A flapping connection otherwise brings each back within
 * minutes of being waved away, which is the nagging people were reporting. Session storage
 * survives a reload but not a closed tab: one answer per sitting.
 */
export const OFFLINE_PROMPT_DECLINED_KEY = 'offlinePromptDeclined'
export const BACKEND_WARNING_DISMISSED_KEY = 'backendWarningDismissed'

const read = (key: string): boolean => {
  try {
    return sessionStorage.getItem(key) === 'true'
  } catch {
    return false
  }
}

const remember = (key: string) => {
  try {
    sessionStorage.setItem(key, 'true')
  } catch {
    // Remembered for this page load only.
  }
}

export const offlinePromptDeclined = ref(read(OFFLINE_PROMPT_DECLINED_KEY))
export const backendWarningDismissed = ref(read(BACKEND_WARNING_DISMISSED_KEY))

export const declineOfflinePrompt = () => {
  offlinePromptDeclined.value = true
  remember(OFFLINE_PROMPT_DECLINED_KEY)
}

export const dismissBackendWarning = () => {
  backendWarningDismissed.value = true
  remember(BACKEND_WARNING_DISMISSED_KEY)
}

/** For specs, which share one module across cases. */
export const resetWarningDismissals = () => {
  offlinePromptDeclined.value = read(OFFLINE_PROMPT_DECLINED_KEY)
  backendWarningDismissed.value = read(BACKEND_WARNING_DISMISSED_KEY)
}
