import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JUMP_STATE_KEY, useJumpHistory } from '@/composables/useJumpHistory'

// jsdom does no layout, so the container and its cards report whatever these say: the container
// sits at the top of the viewport, and a card's top moves up as the container scrolls.
const cardTops: Record<string, number> = {}

const makeContainer = () => {
  const main = document.createElement('div')
  main.getBoundingClientRect = () => ({ top: 0 }) as DOMRect
  main.scrollTo = vi.fn(({ top }: ScrollToOptions) => {
    main.scrollTop = top ?? 0
  }) as unknown as HTMLElement['scrollTo']
  document.body.append(main)
  return main
}

const addCard = (main: HTMLElement, id: string, top: number) => {
  cardTops[id] = top
  const card = document.createElement('div')
  card.id = id
  card.getBoundingClientRect = () => ({ top: cardTops[id] - main.scrollTop }) as DOMRect
  card.getClientRects = () => [{}] as unknown as DOMRectList
  main.append(card)
  return card
}

// popstate is what the browser fires on back/forward; jsdom's history does not fire it itself.
const pop = (state: unknown) => window.dispatchEvent(new PopStateEvent('popstate', { state }))

describe('useJumpHistory', () => {
  let main: HTMLElement
  let anchor: string | null
  let pushed: Record<string, string>[]
  let jumps: ReturnType<typeof useJumpHistory>

  beforeEach(() => {
    vi.useFakeTimers()
    history.replaceState(null, '')
    main = makeContainer()
    addCard(main, 'a', 0)
    addCard(main, 'b', 1000)
    addCard(main, 'c', 3000)
    anchor = 'a'
    pushed = []
    jumps = useJumpHistory({
      container: () => main,
      anchorId: () => anchor,
      push: state => {
        pushed.push(state)
        history.pushState({ ...history.state, ...state }, '')
      },
    })
    jumps.start()
  })

  afterEach(() => {
    jumps.stop()
    main.remove()
    vi.useRealTimers()
  })

  it('gives every jump its own history entry', () => {
    jumps.record()
    jumps.record()
    expect(pushed).toHaveLength(2)
    expect(pushed[0][JUMP_STATE_KEY]).not.toEqual(pushed[1][JUMP_STATE_KEY])
  })

  it('stamps the entry being left, keeping the state the router already stored there', () => {
    history.replaceState({ position: 4 }, '')
    jumps.record()
    // The stamp went on the entry before the push, which copied it; the jump's own id replaced it.
    expect(history.state.position).toBe(4)
    expect(history.state[JUMP_STATE_KEY]).toBe(pushed[0][JUMP_STATE_KEY])
  })

  it('goes back to where the jump was made from', () => {
    main.scrollTop = 1200
    anchor = 'b'
    const originId = captureOriginId()

    // The jump itself: somewhere else entirely.
    main.scrollTop = 3000
    anchor = 'c'

    pop({ [JUMP_STATE_KEY]: originId })
    expect(main.scrollTo).toHaveBeenCalledWith({ top: 1200, behavior: 'smooth' })
    expect(main.scrollTop).toBe(1200)
  })

  it('returns to the same place in the card when the content above it has grown', () => {
    main.scrollTop = 1200
    anchor = 'b'
    const originId = captureOriginId()

    // The jump opened a group above card b, pushing it 500px further down the plan.
    cardTops.b = 1500
    main.scrollTop = 3000

    pop({ [JUMP_STATE_KEY]: originId })
    expect(main.scrollTop).toBe(1700)
  })

  it('goes forward again to where back was pressed from', () => {
    main.scrollTop = 100
    jumps.record()
    const destination = history.state

    main.scrollTop = 3100
    anchor = 'c'
    pop({ [JUMP_STATE_KEY]: 'not-a-known-entry' })

    pop(destination)
    expect(main.scrollTop).toBe(3100)
  })

  it('leaves the plan alone on an entry it has no place for', () => {
    main.scrollTop = 500
    pop({ [JUMP_STATE_KEY]: 'from-an-earlier-page-load' })
    pop(null)
    expect(main.scrollTo).not.toHaveBeenCalled()
  })

  it('falls back to the raw offset when the anchor has gone', () => {
    main.scrollTop = 1200
    anchor = 'b'
    const originId = captureOriginId()
    document.getElementById('b')!.remove()
    main.scrollTop = 3000

    pop({ [JUMP_STATE_KEY]: originId })
    expect(main.scrollTop).toBe(1200)
  })

  it('snaps a correction when content was still settling after the smooth scroll', () => {
    main.scrollTop = 1200
    anchor = 'b'
    const originId = captureOriginId()
    main.scrollTop = 3000

    pop({ [JUMP_STATE_KEY]: originId })
    // A card above b materialised mid-scroll, moving it down 300px.
    cardTops.b = 1300
    vi.advanceTimersByTime(600)
    expect(main.scrollTo).toHaveBeenLastCalledWith({ top: 1500, behavior: 'auto' })
  })

  it('stops listening once stopped', () => {
    main.scrollTop = 1200
    const originId = captureOriginId()
    jumps.stop()
    main.scrollTop = 3000
    pop({ [JUMP_STATE_KEY]: originId })
    expect(main.scrollTop).toBe(3000)
  })

  // Records a jump and returns the id the entry it left was stamped with.
  function captureOriginId () {
    const replace = vi.spyOn(history, 'replaceState')
    jumps.record()
    const stamped = replace.mock.calls[0][0] as Record<string, string>
    replace.mockRestore()
    return stamped[JUMP_STATE_KEY]
  }
})
