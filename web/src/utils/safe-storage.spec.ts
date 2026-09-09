import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToastData } from '@/utils/toast'
import eventBus from '@/utils/eventBus'
import { resetStorageWarning, writeLocalStorage } from '@/utils/safe-storage'
import { refuseLocalStorageWrites } from '../../testing/storage'

let restoreWrites: (() => void) | null = null

const refuseWrites = () => {
  restoreWrites = refuseLocalStorageWrites()
  vi.spyOn(console, 'error').mockImplementation(() => {})
}

describe('safe-storage', () => {
  beforeEach(() => {
    localStorage.clear()
    resetStorageWarning()
  })

  afterEach(() => {
    restoreWrites?.()
    restoreWrites = null
    vi.restoreAllMocks()
  })

  it('writes through and reports that it landed', () => {
    expect(writeLocalStorage('a-key', 'a-value')).toBe(true)
    expect(localStorage.getItem('a-key')).toBe('a-value')
  })

  // A refused write happens inside the user's edit, so a throw here unwinds the edit
  // that asked for it. The report is what the callers gate their bookkeeping on.
  it('answers a refused write rather than throwing into its caller', () => {
    refuseWrites()

    expect(() => writeLocalStorage('a-key', 'a-value')).not.toThrow()
    expect(writeLocalStorage('a-key', 'a-value')).toBe(false)
  })

  it('says so once, however many saves the browser refuses', () => {
    const toasts: ToastData[] = []
    const listener = (data: ToastData) => toasts.push(data)
    eventBus.on('toast', listener)
    refuseWrites()

    writeLocalStorage('a-key', 'a-value')
    writeLocalStorage('another-key', 'a-value')
    writeLocalStorage('a-third-key', 'a-value')
    eventBus.off('toast', listener)

    expect(toasts).toHaveLength(1)
    expect(toasts[0].variant).toBe('permanent')
  })
})
