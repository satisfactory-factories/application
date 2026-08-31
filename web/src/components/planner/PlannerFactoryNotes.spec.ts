import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'
import { fireEvent } from '@testing-library/vue'
import { createTestingPinia } from '@pinia/testing'
import PlannerFactoryNotes from './PlannerFactoryNotes.vue'
import { vuetifyRender } from '@/utils/ui-test-bootstrap'
import { FIELD_LOCK_HINT } from '@/composables/useFieldLock'
import { useAppStore } from '@/stores/app-store'
import { useRoomSyncStore } from '@/stores/room-sync-store'
import { newFactory } from '@/utils/factory-management/factory'
import eventBus from '@/utils/eventBus'

const body = () => document.body

/** Reactive like the store's copy, so the notes watcher fires as it does in the app. */
const render = (name = 'Iron Ingots') => {
  const factory = reactive(newFactory(name))
  vuetifyRender(PlannerFactoryNotes, { props: { factory, helpText: false } })
  return factory
}

const type = async (value: string) => {
  await fireEvent.update(body().querySelector('textarea')!, value)
  await nextTick()
}

const clearNotes = async () => {
  await fireEvent.click([...body().querySelectorAll('button')]
    .find(button => button.textContent?.includes('Clear Notes'))!)
  await nextTick()
}

describe('PlannerFactoryNotes', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.spyOn(eventBus, 'emit')
  })

  it('tells the stores something changed so the plan saves and syncs', async () => {
    const factory = render()

    await type('Feeds the aluminium line')

    expect(factory.notes).toBe('Feeds the aluminium line')
    expect(eventBus.emit).toHaveBeenCalledWith('factoryUpdated', factory)
  })

  // Sync treats `factoryEdited` as the user's intent and a rebase only carries
  // touched factories over, so without this an unsent note is discarded.
  it('records the note as user intent, not as a recalculation ripple', async () => {
    const factory = render()

    await type('Feeds the aluminium line')

    expect(eventBus.emit).toHaveBeenCalledWith('factoryEdited', factory)
  })

  it('clears the notes on the button, which counts as an edit too', async () => {
    const factory = render()
    await type('Old note')
    vi.mocked(eventBus.emit).mockClear()

    await clearNotes()

    expect(factory.notes).toBe('')
    expect(eventBus.emit).toHaveBeenCalledWith('factoryEdited', factory)
  })

  // What a collaborator's op looks like from here: the field changes underneath us.
  // Counting that as intent would make this client overlay its copy of the factory
  // on every later rebase, permanently, over an edit it never made.
  it('does not claim intent when the note is rewritten from outside', async () => {
    const factory = render()

    factory.notes = 'Arrived over the wire'
    await nextTick()

    expect(eventBus.emit).toHaveBeenCalledWith('factoryUpdated', factory)
    expect(eventBus.emit).not.toHaveBeenCalledWith('factoryEdited', factory)
  })

  describe('field locks', () => {
    let roomSync: ReturnType<typeof useRoomSyncStore>
    let roomId: string
    let factory: ReturnType<typeof newFactory>

    const textarea = () => body().querySelector('textarea') as HTMLTextAreaElement
    const messages = () => body().querySelector('.v-messages__message')?.textContent ?? ''
    const clearButton = () => [...body().querySelectorAll('button')]
      .find(button => button.textContent?.includes('Clear Notes'))

    /** The lock the peer holds, as the room would state it. */
    const heldByPeer = async (held: boolean) => {
      roomSync.fieldLocks = held ? { [roomId]: { [`notes:${factory.id}`]: 'conn-theirs' } } : {}
      await nextTick()
    }

    beforeEach(() => {
      // Real actions: the point is what the store's own reader says about a frame.
      const pinia = createTestingPinia({ stubActions: false })
      roomSync = useRoomSyncStore()
      roomSync.connectionId = 'conn-mine'
      roomId = useAppStore().getCurrentTab().id

      factory = reactive(newFactory('Iron Ingots'))
      vuetifyRender(PlannerFactoryNotes, { props: { factory, helpText: false }, pinia })
    })

    afterEach(() => {
      roomSync.dispose()
    })

    it('leaves the field alone when nobody else is in it', () => {
      expect(textarea().disabled).toBe(false)
      expect(messages()).toBe('')
    })

    it('disables the field and says why while another builder is in it', async () => {
      factory.notes = 'Feeds the aluminium line'
      await heldByPeer(true)

      expect(textarea().disabled).toBe(true)
      expect(messages()).toBe(FIELD_LOCK_HINT)
      // Clearing the notes is an edit to the same field, so it goes too.
      expect(clearButton()?.disabled).toBe(true)
    })

    it('re-enables it the moment they leave', async () => {
      await heldByPeer(true)
      await heldByPeer(false)

      expect(textarea().disabled).toBe(false)
      expect(messages()).toBe('')
    })

    // The key scheme is the client's alone, and this is where it is minted.
    it('claims the field it is in, keyed by the factory it belongs to', async () => {
      const claim = vi.spyOn(roomSync, 'claimField').mockReturnValue(true)

      await fireEvent.focus(textarea())

      expect(claim).toHaveBeenCalledWith(roomId, `notes:${factory.id}`)
    })

    it('gives it up again on blur', async () => {
      vi.spyOn(roomSync, 'claimField').mockReturnValue(true)
      const release = vi.spyOn(roomSync, 'releaseField').mockReturnValue(true)

      await fireEvent.focus(textarea())
      await fireEvent.blur(textarea())

      expect(release).toHaveBeenCalledWith(roomId, `notes:${factory.id}`)
    })

    it('renews the lock on every keystroke, so a slow typist keeps the field', async () => {
      vi.spyOn(roomSync, 'claimField').mockReturnValue(true)
      const renew = vi.spyOn(roomSync, 'renewField').mockReturnValue(true)

      await fireEvent.focus(textarea())
      await fireEvent.update(textarea(), 'Feeds the aluminium line')

      expect(renew).toHaveBeenCalledWith(roomId, `notes:${factory.id}`)
    })
  })
})
