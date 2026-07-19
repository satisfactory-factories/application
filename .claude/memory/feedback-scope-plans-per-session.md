---
name: feedback-scope-plans-per-session
description: "Matt wants large multi-part features split into separate plans/sessions, one branch per plan"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d46c0f31-0b41-4f76-9bc3-f282fc6168d3
  modified: 2026-07-19T03:41:57.897Z
---

When a request contains multiple large workstreams, Matt wants them planned as SEPARATE plan files and implemented in separate sessions, each on its own named branch (he supplies or approves the branch name, e.g. `tab-sync-v2`).

**Why:** During the 2026-07-19 sync-rework planning he rejected a combined plan: "it's too big of a scope in one session" — the rendering half was split into its own plan file.

**How to apply:** In plan mode, if the work naturally divides into independently shippable parts, propose splitting into separate plans up front rather than one mega-plan. Also note: he initially asked for instant-save but corrected to a ~2s trailing debounce — sanity-check "do it immediately" style requests against per-keystroke consequences and surface the tradeoff. See [[project-tab-sync-v2]].
