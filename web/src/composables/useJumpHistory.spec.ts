import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JUMP_STATE_KEY, useJumpHistory } from '@/composables/useJumpHistory'

// jsdom does no layout, so the container and its cards report whatever these say: the container
// is an 800px window at the top of the viewport, and a card's top moves up as the container
// scrolls. Every element is 100px tall.
const cardTops: Record<string, number> = {}
const VIEWPORT = 800

const makeContainer = () => {
  const main = document.createElement('div')
  main.getBoundingClientRect = () => ({ top: 0, bottom: VIEWPORT }) as DOMRect
  main.scrollTo = vi.fn(({ top }: ScrollToOptions) => {
    main.scrollTop = top ?? 0
  }) as unknown as HTMLElement['scrollTo']
  document.body.append(main)
  return main
}

const addCard = (main: HTMLElement, id: string, top: number, parent: HTMLElement = main) => {
  cardTops[id] = top
  const card = document.createElement('div')
  card.id = id
  // Something to show: an empty element is a byproduct's jump marker, which the flash passes over.
  card.textContent = id
  card.getBoundingClientRect = () => {
    const at = cardTops[id] - main.scrollTop
    return { top: at, bottom: at + 100 } as DOMRect
  }
  card.getClientRects = () => [{}] as unknown as DOMRectList
  parent.append(card)
  return card
}

// A jump is recorded from inside the click handler of the control that asked for it.
const clickToJump = (control: HTMLElement, jumps: { record: (destination?: string) => void }, destination?: string) => {
  control.addEventListener('click', () => jumps.record(destination), { once: true })
  control.click()
  vi.advanceTimersByTime(0)
}

// popstate is what the browser fires on back/forward; jsdom's history does not fire it itself.
const pop = (state: unknown) => window.dispatchEvent(new PopStateEvent('popstate', { state }))

describe('useJumpHistory', () => {
  let main: HTMLElement
  let anchor: string | null
  let pushed: Record<string, string>[]
  let jumps: ReturnType<typeof useJumpHistory>
  let flash: ReturnType<typeof vi.fn<(element: HTMLElement) => void>>

  beforeEach(() => {
    vi.useFakeTimers()
    history.replaceState(null, '')
    main = makeContainer()
    addCard(main, 'a', 0)
    addCard(main, 'b', 1000)
    addCard(main, 'c', 3000)
    anchor = 'a'
    pushed = []
    flash = vi.fn<(element: HTMLElement) => void>()
    jumps = useJumpHistory({
      flash,
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

  describe('the pulse on arrival', () => {
    const flashedIds = () => flash.mock.calls.map(([el]) => (el as HTMLElement).id)

    it('lights the row the jump was clicked from once the scroll has had a beat', () => {
      const card = document.getElementById('b')!
      const row = addCard(main, 'b-import-row', 1300, card)
      const button = document.createElement('button')
      row.append(button)
      main.scrollTop = 1200
      anchor = 'b'
      const replace = vi.spyOn(history, 'replaceState')
      clickToJump(button, jumps, 'c')
      const originId = (replace.mock.calls[0][0] as Record<string, string>)[JUMP_STATE_KEY]
      replace.mockRestore()
      main.scrollTop = 3000
      anchor = 'c'

      pop({ [JUMP_STATE_KEY]: originId })
      expect(flash).not.toHaveBeenCalled()
      vi.advanceTimersByTime(350)
      expect(flashedIds()).toEqual(['b-import-row'])
    })

    it('walks past the ids Vuetify generates to the row that owns the control', () => {
      const row = addCard(main, 'a-row', 50, document.getElementById('a')!)
      const input = document.createElement('input')
      input.id = 'input-v-12'
      row.append(input)
      const replace = vi.spyOn(history, 'replaceState')
      clickToJump(input, jumps)
      const originId = (replace.mock.calls[0][0] as Record<string, string>)[JUMP_STATE_KEY]
      replace.mockRestore()
      main.scrollTop = 3000

      pop({ [JUMP_STATE_KEY]: originId })
      vi.advanceTimersByTime(350)
      expect(flashedIds()).toEqual(['a-row'])
    })

    it('lights the row the jump landed on when forward returns to it', () => {
      jumps.record('c')
      const destination = history.state
      main.scrollTop = 3000
      anchor = 'c'

      pop({ [JUMP_STATE_KEY]: 'the-entry-before' })
      main.scrollTop = 0
      anchor = 'a'
      flash.mockClear()

      pop(destination)
      vi.advanceTimersByTime(350)
      expect(flashedIds()).toEqual(['c'])
    })

    it('lights the card being read when the row is no longer on screen', () => {
      const button = document.createElement('button')
      const row = addCard(main, 'far-row', 1300, document.getElementById('b')!)
      row.append(button)
      main.scrollTop = 1000
      anchor = 'b'
      const replace = vi.spyOn(history, 'replaceState')
      clickToJump(button, jumps)
      const originId = (replace.mock.calls[0][0] as Record<string, string>)[JUMP_STATE_KEY]
      replace.mockRestore()
      // The row grew out of view while the user was away.
      cardTops['far-row'] = 2500
      main.scrollTop = 3000

      pop({ [JUMP_STATE_KEY]: originId })
      vi.advanceTimersByTime(350)
      expect(flashedIds()).toEqual(['b'])
    })

    it('lights the card being read for a jump that was not clicked from the plan', () => {
      main.scrollTop = 1000
      anchor = 'b'
      const originId = captureOriginId()
      main.scrollTop = 3000

      pop({ [JUMP_STATE_KEY]: originId })
      vi.advanceTimersByTime(350)
      expect(flashedIds()).toEqual(['b'])
    })

    it('does not leave a stale click behind for a later jump', () => {
      const row = addCard(main, 'a-row', 50, document.getElementById('a')!)
      row.click()
      vi.advanceTimersByTime(0)
      const originId = captureOriginId()
      main.scrollTop = 3000

      pop({ [JUMP_STATE_KEY]: originId })
      vi.advanceTimersByTime(350)
      expect(flashedIds()).toEqual(['a'])
    })

    it('lights the row the scroll is carrying into view, though it has not arrived yet', () => {
      const row = addCard(main, 'b-row', 1300, document.getElementById('b')!)
      main.scrollTop = 1200
      anchor = 'b'
      const replace = vi.spyOn(history, 'replaceState')
      clickToJump(row, jumps)
      const originId = (replace.mock.calls[0][0] as Record<string, string>)[JUMP_STATE_KEY]
      replace.mockRestore()
      main.scrollTop = 3000
      // A smooth scroll a long way: 350ms in, it has barely started.
      main.scrollTo = vi.fn() as unknown as HTMLElement['scrollTo']

      pop({ [JUMP_STATE_KEY]: originId })
      vi.advanceTimersByTime(350)
      expect(flashedIds()).toEqual(['b-row'])
    })

    it('pulses nothing when neither the row nor the card heading will be on screen', () => {
      // Deep inside a tall card: its top, where the heading is, sits 500px above the view.
      main.scrollTop = 1500
      anchor = 'b'
      const originId = captureOriginId()
      main.scrollTop = 3000

      pop({ [JUMP_STATE_KEY]: originId })
      vi.advanceTimersByTime(350)
      expect(main.scrollTop).toBe(1500)
      expect(flash).not.toHaveBeenCalled()
    })

    it('pulses straight away when back needs no scrolling', () => {
      main.scrollTop = 1000
      anchor = 'b'
      const originId = captureOriginId()

      pop({ [JUMP_STATE_KEY]: originId })
      vi.advanceTimersByTime(0)
      expect(flashedIds()).toEqual(['b'])
    })
  })

  // The planner shows one page at a time, so a place can be on a page that is no longer on screen.
  describe('across pages', () => {
    let page: string
    let shown: string[]
    let arrive: (() => void) | null

    beforeEach(() => {
      jumps.stop()
      page = 'overview'
      shown = []
      arrive = null
      jumps = useJumpHistory({
        flash,
        container: () => main,
        anchorId: () => anchor,
        push: state => history.pushState({ ...history.state, ...state }, ''),
        view: () => page,
        showView: (view, onShown) => {
          shown.push(view)
          page = view
          arrive = onShown
        },
      })
      jumps.start()
    })

    it('opens the page the place was on, then sets the place without scrolling to it', () => {
      main.scrollTop = 1200
      anchor = 'b'
      const originId = captureOriginId()

      // The jump opened another page, scrolled to its top.
      page = '42'
      main.scrollTop = 0
      anchor = 'a'

      pop({ [JUMP_STATE_KEY]: originId })
      expect(shown).toEqual(['overview'])
      // The page has to be on screen before its place can be measured.
      expect(main.scrollTo).not.toHaveBeenCalled()

      arrive?.()
      expect(main.scrollTo).toHaveBeenCalledWith({ top: 1200, behavior: 'auto' })
    })

    it('leaves the page alone when the place is on the one already showing', () => {
      main.scrollTop = 1200
      anchor = 'b'
      const originId = captureOriginId()

      main.scrollTop = 3000
      anchor = 'c'

      pop({ [JUMP_STATE_KEY]: originId })
      expect(shown).toEqual([])
      expect(main.scrollTop).toBe(1200)
    })
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
