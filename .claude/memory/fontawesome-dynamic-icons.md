---
name: fontawesome-dynamic-icons
description: Dynamic FA icon swaps need a Vue-owned wrapper element — :class flips on <i> render nothing
metadata: 
  node_type: memory
  type: project
  originSessionId: 18072cbd-acce-416d-82ea-5233fe13a88f
---

FontAwesome is loaded via its SVG-replacement JS (`index.html`: `fa.min.js` etc.), which replaces each `<i class="fas fa-*">` with an `<svg>` at insert time and detaches the `<i>` Vue is patching.

**Why:** A dynamic `:class` binding on the `<i>` (e.g. `:class="cond ? 'fas fa-bullseye' : 'fas fa-check-square'"`) silently never updates the rendered icon; even `v-if`/`v-else` on the bare `<i>` leaves the stale `<svg>` in the DOM because Vue removes only its detached `<i>`.

**Vuetify's selection controls hit this too, and you cannot fix them from the Vue side.** `v-radio`
and `v-checkbox` flip the icon class between the `radioOn`/`radioOff` (and `checkboxOn`/`checkboxOff`)
aliases, so a radio renders whatever glyph it first drew and never changes — the selected mark stays
on a row the user has moved away from. Worse, the `fa` iconset points those aliases at `far` (Regular),
which the vendored build does not ship at all (solid and brands only), so they rendered *nothing*.
Swapping the aliases to solid names does not help: the class still never reaches the DOM. The marks
are therefore drawn in CSS in `global.scss`, keyed off Vuetify's own `.v-selection-control--dirty`.
Don't "fix" it by reinstating icon aliases.

**Clickable icons hit this too, and the fix is the `clear` alias in `plugins/vuetify.ts`.** A
`clearable` field's X is a class icon Vuetify binds the click handler to, so Font Awesome detached
the handler along with the `<i>` — the X rendered and did nothing, in every `clearable` field in the
app. The `clear` alias is therefore a component (`() => h('i', { class: 'fas fa-times-circle' })`),
not a class string: Vuetify's `VComponentIcon` wraps a component icon in a Vue-owned
`<i class="v-icon">` that keeps the handler, the `role="button"` and the aria-label, and only the
inner `<i>` gets swapped for an `<svg>`. Don't "simplify" it back to the string the fa iconset ships.

**How to apply:** Toggle a wrapping element Vue owns, with static icon classes inside: `<span v-if="cond"><i class="fas fa-bullseye" /></span><span v-else><i class="fas fa-check-square" /></span>`. Removing the wrapper removes the nested svg; the freshly mounted one gets converted by FA's MutationObserver. Same pattern as the sync-state icons in `PlannerFactoryList.vue`. See also [[verify-tab-navigation]] for browser-driving; dismiss both modals first via localStorage `dismissed-introduction='true'` and `seenV51Splash='true'` or clicks land on the overlay.
