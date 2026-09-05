import eventBus from '@/utils/eventBus'

/** One notice per session: a full quota refuses every write, and a toast each would be a wall. */
let warned = false

/**
 * `localStorage.setItem` throws when the quota is full or the browser blocks site data,
 * and every caller here sits inside a user edit. Uncaught, one refused save unwinds the
 * edit that asked for it and silently stops every save after it.
 */
export const writeLocalStorage = (key: string, value: string): boolean => {
  try {
    localStorage.setItem(key, value)
    return true
  } catch (error) {
    console.error('safeStorage: the browser refused to save', key, error)
    if (!warned) {
      warned = true
      eventBus.emit('toast', {
        message: 'Your browser refused to save this plan. Free up some browser storage, or anything you change now will be lost when you close the tab.',
        type: 'error',
        variant: 'permanent',
      })
    }
    return false
  }
}

/** The notice is once per session, and under test a session is one spec file. */
export const resetStorageWarning = (): void => {
  warned = false
}
