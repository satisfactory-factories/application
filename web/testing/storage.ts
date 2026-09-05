/**
 * A browser that refuses to save. jsdom's `localStorage` does not reach `setItem`
 * through `Storage.prototype`, so a spy there never fires; the method has to be
 * replaced on the instance. Returns the undo.
 */
export const refuseLocalStorageWrites = (matches: (key: string) => boolean = () => true) => {
  const original = localStorage.setItem.bind(localStorage)
  const install = (value: unknown) =>
    Object.defineProperty(localStorage, 'setItem', { configurable: true, writable: true, value })

  install((key: string, value: string) => {
    if (matches(key)) throw new DOMException('quota exceeded', 'QuotaExceededError')
    original(key, value)
  })

  return () => install(original)
}
