---
name: project-tab-sync-v2
description: In-flight multi-tab sync rework on branch tab-sync-v2; rendering rework deferred to its own plan
metadata: 
  node_type: memory
  type: project
  originSessionId: d46c0f31-0b41-4f76-9bc3-f282fc6168d3
  modified: 2026-07-19T04:08:19.067Z
---

As of 2026-07-19: sync rebuilt so ALL tabs persist server-side (per-(user,tabId) Mongo docs, 2s trailing debounce per tab, login merge dialog with "(local)" suffix for kept local tabs, tab drag-reorder with persisted order). Branch: `tab-sync-v2`, phases 1-4 implemented and committed (4 commits, all tests green). Remaining: manual two-browser verification, visual check of drag-reorder inside v-tabs, and the logs-driven Phase 5 cleanup (remove `/save`, `/load`, `FactoyDataSchema.ts`). Approved plan: `/Users/matt/.claude/plans/create-me-a-plan-shimmying-shell.md`.

Deferred follow-up (separate session, not started): windowed factory rendering (current ±1 window, scroll anchoring) — plan at `/Users/matt/.claude/plans/windowed-factory-rendering.md`. Future ambition beyond both: shared plans via a "rooms" concept, explicitly NOT WebSockets yet.

**Why:** Current sync saves only the active tab, so switching tabs clobbers other tabs' server data.

**How to apply:** Any sync/tab work should follow the approved plan's decisions (no content-merge of same-name plans, legacy `/save`//`/load` kept until logs quiet). See [[feedback-scope-plans-per-session]] and [[calc-engine-gotchas]].
