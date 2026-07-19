---
name: project-graph-rebuild-plan
description: "Approved-in-principle plan to rebuild the /graph view idiomatically on Vue Flow, parked for later at .claude/plans/graph-view-vue-flow-rebuild.md"
metadata: 
  node_type: memory
  type: project
  originSessionId: db1f2182-e324-46c3-854d-92ec111104b6
  modified: 2026-07-19T03:54:15.000Z
---

On 2026-07-19 Matt asked for (but deferred executing) a full rebuild of the graph view. Plan lives at `.claude/plans/graph-view-vue-flow-rebuild.md` in the repo. Key facts:

- The current `/graph` is ALREADY on Vue Flow (`@vue-flow/core` ^1.41.2 + dagre) but half-finished: source handles commented out, colliding edge IDs for multi-part factory pairs, `:key`-remount reactivity hack. It's a rebuild, not a library migration.
- Decided representation: one node per Factory, per-part handles (`in:${part}` / `out:${part}`), one edge per (source, part, target).
- Matt's decisions: node positions persist **inside plan data** (`graphPosition` on Factory — must mirror into backend-duplicated interface, and rebase-check against [[project-tab-sync-v2]]); edge deletion **explicit action only** (no Delete key); add-product = minimal picker; **compact mode** (aggregated edges) is in scope as M6.
- Milestones M1–M6, intended as one branch/PR each per [[feedback-scope-plans-per-session]]. Graph edits must route through existing factory-management functions + `calculateFactory`/`calculateFactories` only ([[calc-engine-gotchas]]).
