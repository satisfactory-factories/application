// The white pulse a jump leaves on whatever it landed on, so the eye finds the row that was
// jumped to instead of hunting the section for it. The animation itself lives in global.scss —
// the targets are scattered all over the planner, so a scoped style could not reach them.
export const NAV_FLASH_CLASS = 'sf-nav-flash'

// Slightly longer than the animation in global.scss, so the class is only pulled off once the
// pulse has finished. Removing it is what lets a repeat jump replay the flash.
export const NAV_FLASH_DURATION = 1200

// Containers are flashed on their heading rather than whole: a jump to a factory card or one of
// its sections would otherwise wash half the screen white. First match in document order wins,
// which for a factory card is its own header and not a nested section's.
const HEADING_SELECTORS = ['[data-nav-flash]', '.header', '.v-card-title', 'h1', 'h2']

// A jump can land on a marker rather than on anything you can see: a byproduct has no row of its
// own, so the product row that makes it carries an empty, zero-height div bearing the byproduct's
// id purely so the jump has somewhere to go. There is no box there to paint — flashing it lit
// nothing at all — so the pulse goes to whatever owns the marker.
const isEmptyAnchor = (element: HTMLElement) =>
  element.children.length === 0 && !element.textContent?.trim()

export const resolveFlashTarget = (element: HTMLElement): HTMLElement => {
  const subject = isEmptyAnchor(element) && element.parentElement ? element.parentElement : element

  for (const selector of HEADING_SELECTORS) {
    const heading = subject.querySelector<HTMLElement>(selector)
    if (heading) return heading
  }

  return subject
}

// The pending cleanup per element, so a second flash can cancel the first one's. Without it the
// earlier timer lands mid-pulse and cuts the new animation short.
const pendingCleanups = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>()

export const flashElement = (element: HTMLElement) => {
  const target = resolveFlashTarget(element)

  const pending = pendingCleanups.get(target)
  if (pending) clearTimeout(pending)

  // Restart rather than stack. Re-adding a class that is already there does nothing, so jumping
  // to the same row twice would flash only the first time.
  target.classList.remove(NAV_FLASH_CLASS)
  // Reading layout between the two flushes the removal; without it the browser never sees the
  // class leave and simply keeps the finished animation.
  target.getBoundingClientRect()
  target.classList.add(NAV_FLASH_CLASS)

  pendingCleanups.set(target, setTimeout(() => {
    target.classList.remove(NAV_FLASH_CLASS)
    pendingCleanups.delete(target)
  }, NAV_FLASH_DURATION))
}
