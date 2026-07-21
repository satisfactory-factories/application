---
name: awesome-sink-plan
description: AWESOME Sink + byproduct routing plan approved for Beta v0.6 — do not implement during Beta v0.5
metadata: 
  node_type: memory
  type: project
  originSessionId: 62e4391c-187f-4c6d-9cba-75c94dbd757e
---

The AWESOME Sink / byproduct routing proposal lives at `.claude/plans/awesome-sink-and-byproduct-routing.md`. Direction approved 2026-07-21, **targeted at Beta v0.6 — do not implement while Beta v0.5 (the performance release) is in flight**.

Locked decisions: plan-level `autoSink` defaults ON for all plans **including existing ones**; per-part "keep surplus" opt-out (`factory.sinks`); sunk display always shows the number ("0/min surplus (180/min sunk)"); byproduct recycling becomes opt-out-able via `byProductRouting` divert mode; dimensional storage / kept-surplus destinations deliberately not modelled; rollout requires a dismissible "Action needed" banner + splash/changelog in the same release as the default-on behaviour.

Four phases, one branch/PR each (per [[scope-plans-per-session]]): engine+auto-sink → statistics → byproduct routing → parser sinkPoints (data-version bump). Sinkability rule once parser lands: `!isFluid && sinkPoints > 0` (verified to encode radioactive exclusions exactly).

**Why:** the plan doc is the source of truth; this note exists so sessions during v0.5 don't pick it up early, and v0.6 sessions know where to start.
**How to apply:** read the plan doc before starting any phase; each phase is its own session/branch.
