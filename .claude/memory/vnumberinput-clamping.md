---
name: vnumberinput-clamping
description: How to clamp a typed value in a Vuetify VNumberInput — clamp on entry and remount the field; `:max` silently swallows the update event
metadata:
  type: project
---

Vuetify's `VNumberInput` keeps its own copy of the typed text. Writing a clamped value back
to the bound model does **not** refresh what's on screen while the field has focus, so an
out-of-range entry stays visible even though the app is calculating with the clamped number.

`:max` is not the answer either: with it set, an out-of-range entry stops emitting
`update:model-value` entirely (it only reconciles on blur), so an app-side clamp never runs
and the model keeps its old value while the field shows the typed one — strictly worse.

**Why:** this is what made the somersloop cap look broken (Beta v0.5) — typing 5 into a
4-slot Quantum Encoder left the 5 on screen. The engine had clamped to 4 all along; only the
display disagreed, which is indistinguishable from a real bug for whoever reports it.

**How to apply:** bind `:model-value` (not `v-model`), clamp inside the
`@update:model-value` handler rather than inside a debounce, and when the value was actually
corrected, bump a `:key` ref to remount the field and refocus it on `nextTick`. See
`applyGroupSomersloops` in `web/src/components/planner/products/BuildingGroup.ts` and its
caller in `BuildingGroup.vue`. Related: [[dependency-modernization-plan]],
[[extraction-output-multiplier]].
