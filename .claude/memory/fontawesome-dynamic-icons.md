---
name: fontawesome-dynamic-icons
description: The old FA wrapper-span workaround for dynamic icons is obsolete — MDI is a webfont, so :class flips work
metadata:
  node_type: memory
  type: project
---

Dynamic icon swaps used to need a Vue-owned wrapper element. They no longer do. The planner
now uses Material Design Icons as a **webfont** (`@mdi/font`, `plugins/vuetify.ts`), which
styles a `::before` glyph on the existing `<i>` rather than replacing the element.

**Why it mattered:** Font Awesome was loaded via its SVG-replacement JS, which swapped each
`<i class="fas fa-*">` for an `<svg>` and detached the `<i>` Vue was patching. A `:class`
binding on that `<i>` silently never updated, and `v-if`/`v-else` left a stale `<svg>` behind.
The fix was to toggle a wrapper `<span>` with static icon classes inside.

**How to apply:** write the obvious thing — `:class="cond ? 'mdi-plus' : 'mdi-minus'"` on the
`<i>` works, as does `v-if`/`v-else`. Wrapper spans left over from the FA era are harmless but
no longer load-bearing, so don't copy the pattern into new code. See [[icon-library-choice]]
for why MDI, and [[verify-tab-navigation]] for browser-driving the planner.
