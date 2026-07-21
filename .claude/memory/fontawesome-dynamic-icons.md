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

**How to apply:** Toggle a wrapping element Vue owns, with static icon classes inside: `<span v-if="cond"><i class="fas fa-bullseye" /></span><span v-else><i class="fas fa-check-square" /></span>`. Removing the wrapper removes the nested svg; the freshly mounted one gets converted by FA's MutationObserver. Same pattern as the sync-state icons in `PlannerFactoryList.vue`. See also [[verify-tab-navigation]] for browser-driving; dismiss both modals first via localStorage `dismissed-introduction='true'` and `seenV51Splash='true'` or clicks land on the overlay.
