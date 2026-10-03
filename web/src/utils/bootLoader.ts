/**
 * The loading screen in index.html. It paints from the HTML alone, before any script has run, so
 * it covers the bundle download, the game data and the first render of the page. The planner
 * takes it down once its plan is in the DOM; every other page once it has rendered.
 */

// A page that dies before it can say so must not leave the screen up for good.
const FALLBACK_MS = 20_000

/** Removed outright, so the frame that paints the page is the frame the screen goes in. */
export const dismissBootLoader = () => {
  document.getElementById('boot-loader')?.remove()
}

export const armBootLoaderFallback = () => {
  setTimeout(dismissBootLoader, FALLBACK_MS)
}
