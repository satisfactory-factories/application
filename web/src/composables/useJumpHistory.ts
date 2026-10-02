/**
 * Back and forward for the planner's jumps.
 *
 * Every "View" button, eye icon, sidebar row, and status chip scrolls the plan somewhere else, and
 * a plan of forty factories is a long way to scroll back by hand. Each jump is given a browser
 * history entry of its own, so whatever the browser already treats as back and forward — the
 * mouse's side buttons, Alt+Left/Right, a trackpad swipe — returns to where the jump was made
 * from, and a back press past the first jump leaves the page exactly as it always did.
 *
 * A place is remembered as the card or section under the reading line plus how far into it the
 * view sat, not as a raw scroll offset: jumps unhide factories and open collapsed groups, and cards
 * materialise as they scroll past, so the content above a pixel offset rarely stays the same size
 * between leaving and coming back. The raw offset is kept as the fallback for when the anchor has
 * gone (a deleted factory, a collapsed group).
 *
 * Only the place being left is ever captured, never the destination: `popstate` fires before
 * anything has scrolled, so the entry being left can still be measured as the user left it —
 * including any scrolling they did after arriving.
 *
 * Arriving back pulses a row, as a forward jump does: a plan that slides a long way and stops
 * gives the eye nothing to find. Back lights the row the jump was clicked from, or the row that
 * was at eye level when nothing in the plan was clicked; forward lights the row the jump itself
 * landed on. When that row will not be on screen, the card or section being looked at stands in,
 * and nothing pulses at all when its heading will not be on screen either.
 */
import { flashElement, resolveFlashTarget } from '@/utils/navigation-highlight'

export interface JumpPoint {
  anchorId: string | null
  // Distance from the top of the scroll container to the top of the anchor, at capture time.
  offset: number
  scrollTop: number
  // The row to pulse on arriving back here, if one is known.
  flashId: string | null
  // The page the pane was showing, when the planner pages its content. Absent otherwise.
  view?: string
}

export interface JumpHistoryOptions {
  // The element that scrolls — the planner's main column, not the document.
  container: () => HTMLElement | null
  // Id of the element the user is looking at, for anchoring the captured place.
  anchorId: () => string | null
  // Adds the history entry for a jump. Defaults to a bare pushState; the planner hands in the
  // router so vue-router's own position bookkeeping stays in step with the browser.
  push?: (state: Record<string, string>) => unknown
  // Pulses the element arrived at. Defaults to the planner's navigation flash.
  flash?: (element: HTMLElement) => void
  // The page on screen, for a pane that shows one page at a time: a place on another page is only
  // reachable by opening that page first. Both or neither. `showView` calls `onShown` once the
  // page is in the DOM, and the place is then set rather than scrolled to: the page is arriving
  // anyway, so there is nothing for a scroll animation to show.
  view?: () => string
  showView?: (view: string, onShown: () => void) => void
}

export const JUMP_STATE_KEY = 'sfJumpId'

// Plenty for any realistic session; past it the oldest places are forgotten and backing into
// them simply changes the history entry without moving the plan.
const MAX_POINTS = 200

// How long a smooth scroll is given to land before a correction pass re-measures the anchor,
// and how many passes are allowed — the same rhythm scrollToElement uses for forward jumps.
const CORRECTION_DELAY = 600
const MAX_CORRECTIONS = 3

// Matches scrollToElement: the smooth scroll is given a beat to land before the pulse, or the
// flash is half over by the time the row is on screen.
const FLASH_DELAY = 350

// Vuetify stamps its own ids on inputs, menus, and tooltips. None of them name a row, and they are
// regenerated on every render, so the search for the clicked row walks past them.
const GENERATED_ID = /^(input-|v-|menu-|tooltip-)/

// Entries from an earlier page load are still in the browser's history, but the places they
// named went with that page. Scoping ids to this load stops one of them matching a new place.
const loadToken = Math.random().toString(36).slice(2, 8)
let counter = 0
const nextId = () => `${loadToken}-${++counter}`

const defaultPush = (state: Record<string, string>) =>
  history.pushState({ ...history.state, ...state }, '')

export const useJumpHistory = (options: JumpHistoryOptions) => {
  const push = options.push ?? defaultPush
  const flash = options.flash ?? flashElement
  const points = new Map<string, JumpPoint>()
  // The row each jump aimed at, kept for when forward returns to it.
  const destinations = new Map<string, string>()
  // What the click being handled was on. A jump is recorded from inside its click handler, so this
  // is the control that asked for it; it is cleared once the click has finished dispatching, so a
  // jump asked for any other way (a search result picked with the keyboard) never inherits it.
  let clicked: Element | null = null
  // The entry the user is on, as far as the jumps know. Tracked rather than read back from
  // history.state, because by the time popstate fires that already names the destination.
  let currentId: string | null = null
  let correction: ReturnType<typeof setTimeout> | null = null
  let pulse: ReturnType<typeof setTimeout> | null = null

  const cancelPending = () => {
    if (correction !== null) clearTimeout(correction)
    if (pulse !== null) clearTimeout(pulse)
    correction = null
    pulse = null
  }

  const onClick = (event: MouseEvent) => {
    clicked = event.target instanceof Element ? event.target : null
    setTimeout(() => { clicked = null })
  }

  // The nearest row with an id of its own around an element, as long as it is in the plan.
  const rowIdAround = (main: HTMLElement, from: Element | null): string | null => {
    for (let el = from; el && el !== main && main.contains(el); el = el.parentElement) {
      if (el.id && !GENERATED_ID.test(el.id)) return el.id
    }
    return null
  }

  // The row the jump was asked from: the control clicked when that was in the plan, otherwise
  // whatever sat at eye level — a sidebar row is no help once the plan has scrolled back. Eye level
  // is the scroll-spy's reading line, 10% down the pane.
  const originRowId = (main: HTMLElement): string | null => {
    const clickedRow = rowIdAround(main, clicked)
    if (clickedRow || typeof document.elementFromPoint !== 'function') return clickedRow
    const box = main.getBoundingClientRect()
    const atEyeLevel = document.elementFromPoint(box.left + box.width / 2, box.top + box.height * 0.1)
    return rowIdAround(main, atEyeLevel)
  }

  const capture = (flashId: string | null = null): JumpPoint | null => {
    const main = options.container()
    if (!main) return null
    const anchorId = options.anchorId()
    const anchor = anchorId ? document.getElementById(anchorId) : null
    return {
      anchorId: anchor ? anchorId : null,
      offset: anchor ? anchor.getBoundingClientRect().top - main.getBoundingClientRect().top : 0,
      scrollTop: main.scrollTop,
      flashId,
      ...(options.view ? { view: options.view() } : {}),
    }
  }

  const remember = (id: string, point: JumpPoint) => {
    // Re-inserted so the Map's order is last-used, making the first key the one to forget.
    points.delete(id)
    points.set(id, point)
    if (points.size > MAX_POINTS) {
      const oldest = points.keys().next().value!
      points.delete(oldest)
      destinations.delete(oldest)
    }
  }

  // Judged against where the scroll is heading rather than where it has got to: a beat into a long
  // smooth scroll, the row it is carrying into view is usually still off screen.
  const pulseArrival = (point: JumpPoint) => {
    const main = options.container()
    if (!main) return
    const box = main.getBoundingClientRect()
    const remaining = targetFor(main, point) - main.scrollTop
    const landsOnScreen = (el: HTMLElement | null): el is HTMLElement => {
      if (!el) return false
      const lit = resolveFlashTarget(el)
      if (lit.getClientRects().length === 0) return false
      const { top, bottom } = lit.getBoundingClientRect()
      return bottom - remaining > box.top && top - remaining < box.bottom
    }

    const candidates = [point.flashId, point.anchorId].map(id => id ? document.getElementById(id) : null)
    const target = candidates.find(landsOnScreen)
    if (target) flash(target)
  }

  const targetFor = (main: HTMLElement, point: JumpPoint): number => {
    const anchor = point.anchorId ? document.getElementById(point.anchorId) : null
    // A card inside a collapsed group is still in the DOM but has no box to measure.
    if (!anchor || anchor.getClientRects().length === 0) return point.scrollTop
    return main.scrollTop + anchor.getBoundingClientRect().top - main.getBoundingClientRect().top - point.offset
  }

  const restore = (point: JumpPoint, attempt = 0, instant = false) => {
    const main = options.container()
    if (!main) return
    const target = targetFor(main, point)
    const settled = Math.abs(target - main.scrollTop) < 2
    // Pulsed once per arrival, measured when it fires so it lands on wherever the row now is.
    if (attempt === 0) pulse = setTimeout(() => pulseArrival(point), settled || instant ? 0 : FLASH_DELAY)
    if (settled) return

    // Corrections snap instantly — a second smooth scroll would chase content still settling.
    main.scrollTo({ top: target, behavior: attempt === 0 && !instant ? 'smooth' : 'auto' })
    if (attempt < MAX_CORRECTIONS) {
      correction = setTimeout(() => restore(point, attempt + 1, instant), CORRECTION_DELAY)
    }
  }

  // Call before a jump scrolls anything: marks the place being left and gives the jump its entry.
  // `destination` is the id of the row the jump is aiming at, for forward to light up later.
  const record = (destination?: string) => {
    if (typeof history === 'undefined') return
    const main = options.container()
    const point = main ? capture(originRowId(main)) : null
    if (!point) return
    cancelPending()

    if (currentId === null) {
      // The first jump from an entry the planner did not create: stamp it, keeping whatever
      // state the router already stores there.
      currentId = nextId()
      history.replaceState({ ...history.state, [JUMP_STATE_KEY]: currentId }, '')
    }
    remember(currentId, point)

    currentId = nextId()
    if (destination) destinations.set(currentId, destination)
    push({ [JUMP_STATE_KEY]: currentId })
  }

  const onPopState = (event: PopStateEvent) => {
    // Measured now, before anything moves: this is where the user was on the entry they left,
    // and it is what forward (or back) returns them to.
    // Nothing was clicked to leave it, so the row it keeps is the one it was remembered with:
    // where the jump was clicked from, or where the jump landed.
    if (currentId !== null) {
      const leaving = capture(points.get(currentId)?.flashId ?? destinations.get(currentId) ?? null)
      if (leaving) remember(currentId, leaving)
    }

    const id = (event.state as Record<string, unknown> | null)?.[JUMP_STATE_KEY]
    currentId = typeof id === 'string' ? id : null

    cancelPending()
    const point = currentId ? points.get(currentId) : undefined
    if (!point) return
    if (point.view !== undefined && options.view && options.showView && options.view() !== point.view) {
      // The place is on another page, which has to be on screen before it can be measured.
      const arriving = currentId
      options.showView(point.view, () => {
        // Moved on again before the page arrived: the place is no longer wanted.
        if (currentId === arriving) restore(point, 0, true)
      })
      return
    }
    restore(point)
  }

  const start = () => {
    const id = (history.state as Record<string, unknown> | null)?.[JUMP_STATE_KEY]
    currentId = typeof id === 'string' && points.has(id) ? id : null
    window.addEventListener('popstate', onPopState)
    // Capture phase, so it is noted before the button's own handler records the jump.
    window.addEventListener('click', onClick, true)
  }

  const stop = () => {
    cancelPending()
    window.removeEventListener('popstate', onPopState)
    window.removeEventListener('click', onClick, true)
  }

  return { record, start, stop }
}
