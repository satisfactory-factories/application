import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import * as api from '@/api/client'
import { ApiError, ApiNetworkError } from '@/api/client'
import { SLUG_CHECK_DEBOUNCE_MS, useSlugAvailability } from '@/composables/useSlugAvailability'

vi.mock('@/api/client', async importOriginal => {
  const actual = await importOriginal<typeof import('@/api/client')>()
  return { ...actual, lookupRoomBySlug: vi.fn() }
})

const notFound = () => new ApiError(404, 'Room not found.', { code: 'room_not_found' })

describe('useSlugAvailability', () => {
  let subject: ReturnType<typeof useSlugAvailability>

  const type = async (value: string) => {
    subject.slug.value = value
    await nextTick()
  }

  const settle = async () => {
    await vi.advanceTimersByTimeAsync(SLUG_CHECK_DEBOUNCE_MS)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    subject = useSlugAvailability(() => 'my-room')
    vi.mocked(api.lookupRoomBySlug).mockRejectedValue(notFound())
  })

  afterEach(() => {
    subject.stop()
    vi.useRealTimers()
  })

  it('asks nothing until typing settles', async () => {
    await type('iron')
    await type('iron-plate')
    await type('iron-plate-hub')

    expect(subject.status.value).toBe('checking')
    expect(api.lookupRoomBySlug).not.toHaveBeenCalled()

    await settle()

    expect(api.lookupRoomBySlug).toHaveBeenCalledTimes(1)
    expect(api.lookupRoomBySlug).toHaveBeenCalledWith('iron-plate-hub')
  })

  it('reports a slug nobody holds as free', async () => {
    await type('iron-plate-hub')
    await settle()

    expect(subject.status.value).toBe('available')
    expect(subject.usable.value).toBe(true)
  })

  it('reports a slug someone else holds as taken', async () => {
    vi.mocked(api.lookupRoomBySlug).mockResolvedValue({
      roomId: 'someone-else',
      name: 'Their plan',
      hasPassword: false,
    })

    await type('iron-plate-hub')
    await settle()

    expect(subject.status.value).toBe('taken')
    expect(subject.usable.value).toBe(false)
  })

  it('recognises the room\'s own link rather than calling it taken', async () => {
    vi.mocked(api.lookupRoomBySlug).mockResolvedValue({
      roomId: 'my-room',
      name: 'My plan',
      hasPassword: false,
    })

    await type('iron-plate-hub')
    await settle()

    expect(subject.status.value).toBe('current')
    expect(subject.message.value).toContain('already')
  })

  it('rejects an invalid slug without asking the server', async () => {
    await type('Iron Plate Hub!')
    await settle()

    expect(subject.status.value).toBe('invalid')
    expect(api.lookupRoomBySlug).not.toHaveBeenCalled()
  })

  it('lowercases before checking, as the server does', async () => {
    await type('  Iron-Plate-Hub  ')
    await settle()

    expect(api.lookupRoomBySlug).toHaveBeenCalledWith('iron-plate-hub')
  })

  it('goes idle when the field is emptied', async () => {
    await type('iron-plate-hub')
    await type('')

    expect(subject.status.value).toBe('idle')

    await settle()

    expect(api.lookupRoomBySlug).not.toHaveBeenCalled()
  })

  it('ignores a slow answer for a slug that has been retyped since', async () => {
    let resolveFirst: (value: { roomId: string, name: string, hasPassword: boolean }) => void = () => {}
    vi.mocked(api.lookupRoomBySlug)
      .mockImplementationOnce(() => new Promise(resolve => {
        resolveFirst = resolve
      }))
      .mockRejectedValueOnce(notFound())

    await type('first-slug-here')
    await settle()
    await type('second-slug-here')
    await settle()

    // The stale lookup lands after the field moved on; it must not repaint the status.
    resolveFirst({ roomId: 'someone-else', name: 'Theirs', hasPassword: false })
    await vi.advanceTimersByTimeAsync(0)

    expect(subject.status.value).toBe('available')
  })

  it('says so plainly when the check itself fails', async () => {
    vi.mocked(api.lookupRoomBySlug).mockRejectedValue(new ApiNetworkError('offline'))

    await type('iron-plate-hub')
    await settle()

    expect(subject.status.value).toBe('error')
    expect(subject.usable.value).toBe(false)
  })

  it('clears back to idle on reset', async () => {
    await type('iron-plate-hub')
    await settle()

    subject.reset()

    expect(subject.slug.value).toBe('')
    expect(subject.status.value).toBe('idle')
  })
})
