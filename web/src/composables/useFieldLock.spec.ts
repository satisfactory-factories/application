import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { effectScope, nextTick } from 'vue'
import { FIELD_LOCK_HINT, useFieldLock } from '@/composables/useFieldLock'
import { useRoomSyncStore } from '@/stores/room-sync-store'

const ROOM = 'room-1'
const FIELD = 'notes:1'

describe('useFieldLock', () => {
  let store: ReturnType<typeof useRoomSyncStore>

  const bind = (roomId: string | null = ROOM) => useFieldLock(() => roomId, () => FIELD)

  /** What the store does when the tab is not one anybody else can be in. */
  const refuseClaims = () => vi.mocked(store.claimField).mockReturnValue(false)

  const heldBy = (holder: string) => {
    store.fieldLocks = { [ROOM]: { [FIELD]: holder } }
  }

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    store = useRoomSyncStore()
    store.connectionId = 'conn-mine'

    vi.spyOn(store, 'claimField').mockReturnValue(true)
    vi.spyOn(store, 'renewField').mockReturnValue(true)
    vi.spyOn(store, 'releaseField').mockReturnValue(true)
  })

  afterEach(() => {
    store.dispose()
    vi.restoreAllMocks()
  })

  it('claims on focus, renews on input and releases on blur', () => {
    const lock = bind()

    lock.claim()
    expect(store.claimField).toHaveBeenCalledWith(ROOM, FIELD)

    lock.renew()
    expect(store.renewField).toHaveBeenCalledWith(ROOM, FIELD)

    lock.release()
    expect(store.releaseField).toHaveBeenCalledWith(ROOM, FIELD)
  })

  it('disables the field and explains itself while a peer holds it', async () => {
    const lock = bind()
    expect(lock.disabled.value).toBe(false)
    expect(lock.hint.value).toBe('')

    heldBy('conn-theirs')
    await nextTick()

    expect(lock.disabled.value).toBe(true)
    expect(lock.hint.value).toBe(FIELD_LOCK_HINT)
  })

  it('leaves the field alone when the lock is this client\'s own', async () => {
    const lock = bind()

    heldBy('conn-mine')
    await nextTick()

    expect(lock.disabled.value).toBe(false)
  })

  it('does nothing at all without a room to lock in', () => {
    const lock = bind(null)

    lock.claim()
    lock.renew()
    lock.release()

    expect(store.claimField).not.toHaveBeenCalled()
    expect(store.releaseField).not.toHaveBeenCalled()
  })

  // A private or local tab refuses the claim, so there is nothing for blur to give up.
  it('releases nothing when the claim was never granted', () => {
    refuseClaims()
    const lock = bind()

    lock.claim()
    lock.release()

    expect(store.releaseField).not.toHaveBeenCalled()
  })

  // The client gives its own lock up on the same idle line the server would, so a
  // keystroke after that pause has to claim the field rather than renew nothing.
  it('claims again when the keystroke comes after its own lock lapsed', () => {
    const lock = bind()

    lock.renew()

    expect(store.claimField).toHaveBeenCalledWith(ROOM, FIELD)
    expect(store.renewField).not.toHaveBeenCalled()
  })

  it('releases the field when the component holding it goes away', () => {
    const scope = effectScope()
    scope.run(() => {
      const lock = bind()
      lock.claim()
    })

    scope.stop()

    expect(store.releaseField).toHaveBeenCalledWith(ROOM, FIELD)
  })
})
