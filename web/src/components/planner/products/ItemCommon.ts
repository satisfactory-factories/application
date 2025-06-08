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
  // Start a new timer
  timer = setTimeout(() => {
    console.log('Item debounce elapsed')
    // Resolve the debounce promise
    resolveFunc?.()
    // Reset state
    currentPromise = null
    resolveFunc = null
    timer = null
  }, 750)
  return currentPromise
}
