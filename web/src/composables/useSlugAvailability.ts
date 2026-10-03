import { computed, ref, watch } from 'vue'
import { CAPS } from 'common'
import { ApiError, lookupRoomBySlug } from '@/api/client'

/** Long enough that typing a whole slug is one lookup, short enough to feel live. */
export const SLUG_CHECK_DEBOUNCE_MS = 400

/** `taken` is someone else's; `current` is this room's own link already. */
export type SlugStatus =
  'idle' |
  'invalid' |
  'checking' |
  'available' |
  'taken' |
  'current' |
  'error'

export const normalizeSlug = (value: string): string => value.trim().toLowerCase()

const MESSAGES: Record<SlugStatus, string> = {
  idle: '',
  invalid: 'Use lowercase letters, numbers and dashes only.',
  checking: 'Checking...',
  available: 'That link is free.',
  taken: 'That link is already taken.',
  current: 'That is already this plan\'s link.',
  error: 'Could not check that link. Try again.',
}

/**
 * Live availability for a custom invite slug. `ownRoomId` is read lazily so the
 * room's own slug reads as "already yours" rather than as taken.
 */
export const useSlugAvailability = (ownRoomId: () => string) => {
  const slug = ref('')
  const status = ref<SlugStatus>('idle')

  let timer: ReturnType<typeof setTimeout> | undefined
  let sequence = 0

  const check = async (candidate: string, ticket: number) => {
    try {
      const found = await lookupRoomBySlug(candidate)
      if (ticket !== sequence) return
      status.value = found.roomId === ownRoomId() ? 'current' : 'taken'
    } catch (error) {
      if (ticket !== sequence) return
      // The lookup only resolves shared, live rooms, so a 404 is "nobody has it".
      status.value = error instanceof ApiError && error.status === 404 ? 'available' : 'error'
    }
  }

  watch(slug, value => {
    clearTimeout(timer)
    sequence += 1

    const candidate = normalizeSlug(value)
    if (candidate === '') {
      status.value = 'idle'
      return
    }
    if (!CAPS.slugPattern.test(candidate)) {
      status.value = 'invalid'
      return
    }

    status.value = 'checking'
    const ticket = sequence
    timer = setTimeout(() => void check(candidate, ticket), SLUG_CHECK_DEBOUNCE_MS)
  })

  const message = computed(() => MESSAGES[status.value])
  const usable = computed(() => status.value === 'available')

  const reset = () => {
    clearTimeout(timer)
    sequence += 1
    slug.value = ''
    status.value = 'idle'
  }

  const stop = () => {
    clearTimeout(timer)
    sequence += 1
  }

  return { slug, status, message, usable, reset, stop }
}
