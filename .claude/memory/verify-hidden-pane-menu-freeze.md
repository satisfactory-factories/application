---
name: verify-hidden-pane-menu-freeze
description: Vuetify menus never settle in a hidden browser pane — inline pointer-events/visibility stick; clear them by hand before hit-testing
metadata:
  type: project
  volatility: durable
  lastVerified: 2026-09-01
---

When the in-app browser pane is hidden (`document.hidden` is true), the page pauses
requestAnimationFrame, throttles timers and freezes animations. Vuetify's `VDialogTransition`
(the default for menus and dialogs) sets inline `pointer-events: none` and
`visibility: hidden` on `.v-overlay__content` in `onBeforeEnter` and clears them across two
rAFs plus a Web Animations run — none of which ever fire. Every menu opened in that state
stays invisible to screenshots and untouchable by real clicks, indefinitely. It is an
environment artifact, not an app bug: never diagnose z-index or stacking problems from a
hidden pane's screenshots.

To hit-test the settled state anyway: open the menu with real pointer/keyboard input, then
remove the two inline properties from `.v-overlay__content` by hand — that is exactly the
state `onAfterEnter` leaves behind — and only then read `document.elementsFromPoint`.
Patching `requestAnimationFrame` onto `setTimeout` does not rescue it: hidden-page timer
throttling (down to one wake per minute) stalls the chain anyway. Playwright pages report
themselves visible, so the e2e suite never sees any of this.
