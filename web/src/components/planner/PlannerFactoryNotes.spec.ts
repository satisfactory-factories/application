import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'
import { fireEvent } from '@testing-library/vue'
import PlannerFactoryNotes from './PlannerFactoryNotes.vue'
import { vuetifyRender } from '@/utils/ui-test-bootstrap'
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
})
