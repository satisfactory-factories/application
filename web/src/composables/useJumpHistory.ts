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
 */
export interface JumpPoint {
  anchorId: string | null
  // Distance from the top of the scroll container to the top of the anchor, at capture time.
  offset: number
  scrollTop: number
}

export interface JumpHistoryOptions {
  // The element that scrolls — the planner's main column, not the document.
  container: () => HTMLElement | null
  // Id of the element the user is looking at, for anchoring the captured place.
  anchorId: () => string | null
  // Adds the history entry for a jump. Defaults to a bare pushState; the planner hands in the
  // router so vue-router's own position bookkeeping stays in step with the browser.
  push?: (state: Record<string, string>) => unknown
}

export const JUMP_STATE_KEY = 'sfJumpId'

// Plenty for any realistic session; past it the oldest places are forgotten and backing into
// them simply changes the history entry without moving the plan.
const MAX_POINTS = 200

// How long a smooth scroll is given to land before a correction pass re-measures the anchor,
// and how many passes are allowed — the same rhythm scrollToElement uses for forward jumps.
const CORRECTION_DELAY = 600
const MAX_CORRECTIONS = 3

// Entries from an earlier page load are still in the browser's history, but the places they
// named went with that page. Scoping ids to this load stops one of them matching a new place.
const loadToken = Math.random().toString(36).slice(2, 8)
let counter = 0
const nextId = () => `${loadToken}-${++counter}`

const defaultPush = (state: Record<string, string>) =>
  history.pushState({ ...history.state, ...state }, '')

export const useJumpHistory = (options: JumpHistoryOptions) => {
  const push = options.push ?? defaultPush
  const points = new Map<string, JumpPoint>()
  // The entry the user is on, as far as the jumps know. Tracked rather than read back from
  // history.state, because by the time popstate fires that already names the destination.
  let currentId: string | null = null
  let correction: ReturnType<typeof setTimeout> | null = null

  const cancelCorrection = () => {
    if (correction !== null) clearTimeout(correction)
    correction = null
  }

  const capture = (): JumpPoint | null => {
    const main = options.container()
    if (!main) return null
    const anchorId = options.anchorId()
    const anchor = anchorId ? document.getElementById(anchorId) : null
    return {
      anchorId: anchor ? anchorId : null,
      offset: anchor ? anchor.getBoundingClientRect().top - main.getBoundingClientRect().top : 0,
      scrollTop: main.scrollTop,
    }
  }

  const remember = (id: string, point: JumpPoint) => {
    // Re-inserted so the Map's order is last-used, making the first key the one to forget.
    points.delete(id)
    points.set(id, point)
    if (points.size > MAX_POINTS) points.delete(points.keys().next().value!)
  }

  const targetFor = (main: HTMLElement, point: JumpPoint): number => {
    const anchor = point.anchorId ? document.getElementById(point.anchorId) : null
    // A card inside a collapsed group is still in the DOM but has no box to measure.
    if (!anchor || anchor.getClientRects().length === 0) return point.scrollTop
    return main.scrollTop + anchor.getBoundingClientRect().top - main.getBoundingClientRect().top - point.offset
  }

  const restore = (point: JumpPoint, attempt = 0) => {
    const main = options.container()
    if (!main) return
    const target = targetFor(main, point)
    if (Math.abs(target - main.scrollTop) < 2) return

    // Corrections snap instantly — a second smooth scroll would chase content still settling.
    main.scrollTo({ top: target, behavior: attempt === 0 ? 'smooth' : 'auto' })
    if (attempt < MAX_CORRECTIONS) {
      correction = setTimeout(() => restore(point, attempt + 1), CORRECTION_DELAY)
    }
  }

  // Call before a jump scrolls anything: marks the place being left and gives the jump its entry.
  const record = () => {
    if (typeof history === 'undefined') return
    const point = capture()
    if (!point) return
    cancelCorrection()

    if (currentId === null) {
      // The first jump from an entry the planner did not create: stamp it, keeping whatever
      // state the router already stores there.
      currentId = nextId()
      history.replaceState({ ...history.state, [JUMP_STATE_KEY]: currentId }, '')
    }
    remember(currentId, point)

    currentId = nextId()
    push({ [JUMP_STATE_KEY]: currentId })
  }

  const onPopState = (event: PopStateEvent) => {
    // Measured now, before anything moves: this is where the user was on the entry they left,
    // and it is what forward (or back) returns them to.
    const leaving = capture()
    if (currentId !== null && leaving) remember(currentId, leaving)

    const id = (event.state as Record<string, unknown> | null)?.[JUMP_STATE_KEY]
    currentId = typeof id === 'string' ? id : null

    cancelCorrection()
    const point = currentId ? points.get(currentId) : undefined
    if (point) restore(point)
  }

  const start = () => {
    const id = (history.state as Record<string, unknown> | null)?.[JUMP_STATE_KEY]
    currentId = typeof id === 'string' && points.has(id) ? id : null
    window.addEventListener('popstate', onPopState)
  }

  const stop = () => {
    cancelCorrection()
    window.removeEventListener('popstate', onPopState)
  }

  return { record, start, stop }
}
