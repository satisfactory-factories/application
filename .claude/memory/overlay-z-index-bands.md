---
name: overlay-z-index-bands
description: fixed chrome vs Vuetify overlays — banners sit at 1900 below menus (2000+), toasts at 2600 above dialogs, and why each side was picked
metadata:
  type: project
  volatility: durable
  lastVerified: 2026-09-01
---

Vuetify hands every overlay (menu, dialog, tray) a z-index from 2000 upward, allocated in
open order. Fixed app chrome therefore picks a side, and the two bottom-centre elements
deliberately sit on opposite sides:

- **`.bottom-notices`** (backend-health banner + offline prompt, `web/src/layouts/default.vue`)
  sits at **1900**: above all page content, below every overlay. At its original 2400 it beat
  the overlay stack, and a select menu opened near the bottom of a short viewport painted under
  it while clicks on its options landed on the banner — measured at the e2e viewport
  (1280x720): `elementsFromPoint` over an import row's Factory option returned the banner.
  A passive status notice must never beat UI the user just opened.
- **Toasts** (`web/src/components/common/ToastNotification.vue`) sit at **2600**, above dialogs
  too, deliberately: they opt out of the global overlay stack (`_disable-global-stack`, so a
  persistent snackbar cannot swallow Escape) and error toasts must stay readable over an open
  dialog (the adoption flow raises them while its dialog is up). Cost: a toast pill can cover
  bottom-centre menu options for its ~3s life; accepted.

A banner still covers *page content* beneath it by design — which is why the e2e's
`addNamedFactory` presses Enter instead of clicking a button the offline banner can sit on
(`web/e2e/helpers/planner.ts`). The band to remember when adding fixed chrome: below 2000
unless it must beat dialogs, and if it must, say why next to the number. Diagnosing this kind
of cover from the hidden browser pane has its own trap: [[verify-hidden-pane-menu-freeze]].
