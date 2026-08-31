---
name: fontawesome-dynamic-icons
description: Dynamic FA icon swaps need a Vue-owned wrapper element — :class flips on <i> render nothing
metadata: 
  node_type: memory
  type: project
  volatility: durable
  lastVerified: 2026-08-31
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

**The vendored build is Font Awesome 5.15.4, so v6/v7 icon names silently render a dashed
placeholder.** `package.json` declares `@fortawesome/fontawesome-free: ^7.0.0`, but the file the
page actually loads is `web/public/assets/js/fa.min.js`, which is 5.15.4 — the dependency is not
what ships. A v6 rename therefore draws FA's "missing icon" circle instead of throwing: `rotate-left`,
`arrow-rotate-left`, `arrows-rotate` and `clock-rotate-left` are all absent, while their v5 names
`undo`, `sync` and `history` work. Checking for a rendered `<svg>` or a `data-icon` attribute does
NOT catch this, because FA creates both for an unknown name; compare the `<path d>` against a
deliberately bogus icon name to tell a real glyph from the placeholder. Use v5 names.

**Cheaper than rendering anything: the bundle lists every name it has.** Pull the keys out of
`web/public/assets/js/fa-solid.min.js` (`grep -oE '(^|[,{])"?[a-z0-9-]+"?:\[' | sed 's/"//g'`,
about 1,850 of them) and grep every `fa-*` token in the changed files against that list. Four v6
names had reached the v0.7.0 branch and a review caught one of them by eye. Note the bundle is FA
**Pro** 5.15.4, so Pro-only v5 names such as `wifi-slash` are there and free-tier lists will say
they are not.

**How to apply:** Toggle a wrapping element Vue owns, with static icon classes inside: `<span v-if="cond"><i class="fas fa-bullseye" /></span><span v-else><i class="fas fa-check-square" /></span>`. Removing the wrapper removes the nested svg; the freshly mounted one gets converted by FA's MutationObserver. Same pattern as the sync-state icons in `PlannerFactoryList.vue`. See also [[verify-tab-navigation]] for browser-driving; dismiss both modals first via localStorage `dismissed-introduction='true'` and `seenV51Splash='true'` or clicks land on the overlay.
