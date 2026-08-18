---
name: game-asset-tooltips
description: Why game images had no tooltips for so long — VImg eats a `title`, and a three-root component drops it silently
metadata:
  node_type: memory
  type: project
---

Every game image in the planner went without a hover tooltip until 2026-08-09, and the reason it
stayed unnoticed is that both halves fail silently.

`GameAssetContent` renders a `v-img` plus two `v-icon` fallbacks (FICSMAS, unknown) as **three root
nodes**. Vue only passes fallthrough attributes to a single-root component, so a `title` set on
`<game-asset>` was dropped with no warning in production. Putting the `title` directly on the
`v-img` does not work either: Vuetify renders its own root and forwards attributes to the inner
`<img>`, which does not exist until the image has loaded. The fix is a single wrapping `<span>`
that carries the title, sized entirely by the image and `display: inline-flex; vertical-align:
middle` so it neither adds a line box nor baseline-aligns (baseline alignment drops icons a few
pixels inside chips).

Only the *non-clickable* branch gets the display name — the clickable one is an `<a>` that already
carries "Open X on Satisfactory Wiki", and a nested title would replace it with something less
useful.

**How to apply:** when an attribute set on a component appears to vanish, count the roots in its
template before anything else. Same class of bug as the vuedraggable `data-draggable` trap in
[[factory-groups-invariant]] — one is a lost `title`, the other is drag silently doing nothing.
