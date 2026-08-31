import { computed, getCurrentScope, onScopeDispose, toValue } from 'vue'
import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import { useRoomSyncStore } from '@/stores/room-sync-store'

/** Sits in the input's own details row, so it has to stay one short line. */
export const FIELD_LOCK_HINT = 'Another builder is editing this'

export interface FieldLockBinding {
  disabled: ComputedRef<boolean>
  hint: ComputedRef<string>
  claim: () => void
  renew: () => void
  release: () => void
}

/**
 * One input, one editor. Bind `claim` to focus, `renew` to input and `release` to
 * blur; `disabled` says somebody else got there first. The key is opaque and the
 * room may be null (a local tab), so this suits any field, not just the notes.
 */
export const useFieldLock = (
  roomId: MaybeRefOrGetter<string | null | undefined>,
  fieldKey: MaybeRefOrGetter<string>,
): FieldLockBinding => {
  const roomSync = useRoomSyncStore()

  /** What we actually hold, so a tab switch releases the field we claimed, not the new one. */
  let claimed: { roomId: string, fieldKey: string } | null = null

  const disabled = computed(() => roomSync.lockedByOther(toValue(roomId), toValue(fieldKey)))
  const hint = computed(() => disabled.value ? FIELD_LOCK_HINT : '')

  const release = () => {
    if (!claimed) return
    roomSync.releaseField(claimed.roomId, claimed.fieldKey)
    claimed = null
  }

  const claim = () => {
    const room = toValue(roomId)
    const key = toValue(fieldKey)
    if (!room) return
    if (claimed && (claimed.roomId !== room || claimed.fieldKey !== key)) release()
    if (roomSync.claimField(room, key)) claimed = { roomId: room, fieldKey: key }
  }

  // A lock the client let lapse while the field kept focus is reclaimed here.
  const renew = () => {
    if (!claimed) {
      claim()
      return
    }
    roomSync.renewField(claimed.roomId, claimed.fieldKey)
  }

  if (getCurrentScope()) onScopeDispose(release)

  return { disabled, hint, claim, renew, release }
}
