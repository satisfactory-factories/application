let timer: NodeJS.Timeout | null = null
let currentPromise: Promise<void> | null = null
let resolveFunc: (() => void) | null = null

// Simply adds a delay to updating things before updateFactory is called from the components.
export function debounce (): Promise<void> {
  // Clear any existing debounce timer
  if (timer) {
    console.log('Item debounce renewed')
    clearTimeout(timer)
  }

  // Create a new promise if one isn't pending
  if (!currentPromise) {
    currentPromise = new Promise<void>(resolve => {
      resolveFunc = resolve
    })
  }
  // 250ms: long enough to coalesce keystrokes while typing a number, short enough
  // that the planner feels immediate. (Was 750ms back when every recalculation
  // rewrote the whole plan reactively and needed hiding.) Dev tests can override
  // via window.__sfDebounceMs to A/B the debounce itself.
  const delay = (import.meta.env.DEV && typeof window !== 'undefined'
    ? (window as unknown as { __sfDebounceMs?: number }).__sfDebounceMs
    : undefined) ?? 250
  timer = setTimeout(() => {
    console.log('Item debounce elapsed')
    // Resolve the debounce promise
    resolveFunc?.()
    // Reset state
    currentPromise = null
    resolveFunc = null
    timer = null
  }, delay)
  return currentPromise
}
