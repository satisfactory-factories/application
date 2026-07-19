# Graph View Rebuild on Vue Flow

## Context

The graph view (`/graph`) is a half-finished Vue Flow implementation: source handles are commented out (edges reference handles that don't render), edge IDs collide when two factories exchange multiple parts, reactivity is a `:key="nodes.length"` full remount plus a manual per-node render counter, there's no editing, no tracing, no persistence, and a "Work in progress!" banner. Vue Flow (`@vue-flow/core` ^1.41.2) and dagre are already installed — this is a rebuild *on* Vue Flow done idiomatically, not a library migration.

Goals: planner stays the single source of truth; the graph becomes a first-class projection of it with light editing (add products, drag-to-link imports/exports), per-part handle awareness, product-flow tracing (select an end product → highlight its upstream chain), layered dependency layout, and right-angle edges.

**User decisions:** positions persist **inside plan data** (synced); link deletion is **explicit action only** (no Delete key); add-product is a **minimal picker**; **compact mode** (aggregated edges) is **in scope**.

**Coordination flags:**
- `FactoryInterface.ts` is duplicated in `backend/interfaces/` — the position field must be added to both.
- The in-flight `tab-sync-v2` branch reworks tab sync; the plan-data position field changes the sync payload, so land/rebase M5 with awareness of that branch.
- Per user preference, execute milestones as separate branches/PRs/sessions (M1 first in this session).

## Data representation (decided)

**One Vue Flow node per `Factory`; per-part handles; one edge per (source, part, target).**
- Target (import) handles, left column: one per part with `parts[p].amountRequired > 0` (not just existing inputs — unconnected requirements are visible drop targets).
- Source (export) handles, right column: one per part with `parts[p].exportable === true`.
- Handle IDs part-scoped per node: `in:${part}` / `out:${part}`; edge ID `e:${source}:${part}:${target}` (fixes the collision bug).
- Products/byProducts shown as chips (no handles).
- Rejected alternatives: product-level compound subnodes (needs ELK, high cost, data model is factory-level); aggregated-only edges (kills part-identity — but ships later as an optional compact-mode toggle).

## Architecture

All new pure logic under `web/src/utils/graph/` (Vitest-tested, no Vue Flow instance usage); Vue integration in composables.

### New files
- **`web/src/utils/graph/model.ts`** — types + ID helpers: `FactoryNodeData { factory: Factory }`, `FactoryFlowNode`, `FactoryFlowEdge` (data: `{ part, amount, satisfied }`), `importHandleId`/`exportHandleId`/`parseHandle`/`edgeId`.
- **`web/src/utils/graph/flowGraph.ts`** — `buildNodes(factories, existingPositions?)`; `buildEdges(factories, { compact? })` from `factory.dependencies.requests` with unique IDs, part-bound handles, `type: 'smoothstep'`, arrow markers, label `"<part>: <n>/min"`, `data.satisfied` from `dependencies.metrics[part].isRequestSatisfied` (red + animated when false). Compact mode: one edge per factory pair, node-to-node (no handles), multi-part label. `diffNodes(current, next)` → `{ added, removedIds }` for position-preserving reconciliation.
- **`web/src/utils/graph/layout.ts`** — pure `computeLayout(nodes, edges, dims, direction='LR')` on dagre: `multigraph: true` with `setEdge(s, t, {}, edge.id)` (current code silently drops parallel edges), `ranksep ~200`, `nodesep ~60`, fallback dims 320×200. Dagre's LR ranking IS the required dependency layering (raw factories left → end products right). ELK deferred; this interface makes it a drop-in later. Cheap crossing reduction: sort each node's handle rows by connected counterpart's rank.
- **`web/src/utils/graph/trace.ts`** — `traceUpstream(factories, factoryId, part?)` / `traceDownstream(...)` → `{ factoryIds, edgeIds }`. BFS over `Factory.inputs` (upstream) / `dependencies.requests` (downstream) with visited-set cycle guard. Part scoping via `relevantParts(factory, part)`: expand `product.requirements` transitively through the factory's own products so only the chain feeding that part lights up. V1 may ship unscoped, scoped filtering in the same milestone.
- **`web/src/composables/useFactoryOperations.ts`** — the graph can't inject `updateFactory` from `Planner.vue` (different route). Mirror `Planner.vue:315` exactly: `updateFactory(f, modes) => calculateFactory(f, getFactories(), gameData, modes)` (`factory.ts:96`), `updateAllFactories(modes) => calculateFactories(...)` (`factory.ts:174`). Zero calc logic reimplemented (see `docs/architecture/calculation-engine.md` — step order is load-bearing).
- **`web/src/composables/useFactoryGraph.ts`** — owns `nodes`/`edges` refs; initial build from `useAppStore().getFactories()`; layout on Vue Flow's `onNodesInitialized` (replaces render counting + `:key` remount). Sync on eventBus `calculationsCompleted` + shallow watch on factory-ID list: `diffNodes` (never recreate survivors — positions kept), rebuild edges wholesale, `updateNodeInternals(changedIds)` (handle sets change after recalc), layout only new/unpositioned nodes. `eventBus.off` on unmount.
- **`web/src/composables/useGraphEdits.ts`** — see Editing below.
- **`web/src/composables/useGraphTrace.ts`** — trace state; applies `.dimmed`/highlight classes to nodes+edges; entry points: export-chip click (part-scoped), node click (unscoped upstream), edge click (scoped to `edge.data.part`); pane click/Esc clears.
- **`web/src/components/graph/AddProductDialog.vue`** — minimal picker: part/recipe `v-autocomplete` over game data + amount field.
- **Tests**: `web/src/utils/graph/{flowGraph,trace,layout}.spec.ts` using existing fixtures in `web/src/utils/factory-setups/*` + real `calculateFactories` (pattern from `inputs.spec.ts`). Key cases: unique edge IDs for multi-part pairs, handle ID round-trip, unsatisfied metrics → red edge, 3-deep trace, cycle fixture doesn't hang, `diffNodes` preserves survivors, compact-mode aggregation.

### Rewritten
- **`web/src/components/graph/Graph.vue`** — `<VueFlow v-model:nodes v-model:edges :is-valid-connection="isValidConnection" connection-mode="strict" fit-view-on-init>` + `<Background>`, `<Controls>`, `<MiniMap :node-color>` (background/controls are installed but unused today). Toolbar: auto-layout button, compact-mode toggle, clear-trace. Remove WIP banner, `:key` hack, `nodeRendered` plumbing, console.logs.
- **`web/src/components/graph/FactoryNode.vue`** — Vuetify card ~320px: header (name, power badge, red border when `hasProblem`, click → navigate to planner; header = drag surface, chips `nodrag`); Imports section (row per required part, `<Handle type="target">`, shows `amountSupplied`/`amountRequired`, amber/red when unsatisfied); Products chips; Exports section (row per exportable part, `<Handle type="source">`, shows surplus `-amountRemaining`). Resurrects the commented-out source handles (`FactoryNode.vue:56-71`) properly.

### Deleted
`web/src/utils/graphUtils.ts`, `web/src/utils/graphLayout.ts`, `web/src/components/graph/Todo.vue` (verify unimported).

## Editing wiring (planner stays source of truth)

- **`isValidConnection`**: source handle dir `out`, target dir `in`, same part, different factories, source `parts[part].exportable`, target `parts[part].amountRequired > 0`, no duplicate via `getAllInputs(target, part, sourceId)` (`inputs.ts:17`), and source ∈ `calculateImportCandidates(target, calculatePossibleImports(target, getExportableFactories(factories)))` (`inputs.ts:94/47`, `exports.ts:40`) — cached per drag on `onConnectStart`.
- **Create link** (`onConnect`): amount = `min(target shortfall, source surplus)` (fallback 1) → `addInputToFactory(target, { factoryId, outputPart, amount })` (`inputs.ts:24`) → `updateAllFactories()`. Never push the edge manually — the `calculationsCompleted` sync rebuilds edges from `dependencies.requests`, keeping the graph a pure projection.
- **Delete link — explicit only**: per-edge close button / context action → `getInput(target, part, sourceId)` → `deleteInputPair(target, input, factories, gameData)` (`inputs.ts:310`, recalcs both sides). Suppress Vue Flow's default remove (filter `remove` changes in `onEdgesChange`); no Delete-key edge removal.
- **Add product**: node menu → AddProductDialog → `addProductToFactory(factory, { id, amount, recipe })` (`products.ts:23`) → `updateFactory(factory)` (same caller contract as the planner).

## Position persistence (in plan data)

Add optional `graphPosition?: { x: number, y: number }` to `Factory` in **both** `web/src/interfaces/planner/FactoryInterface.ts` and its backend duplicate; per-factory field means no stale-ID maps and copies/deletes handle themselves. Check `initFactories`/`validateFactories`/migrations in `app-store.ts` pass the optional field through (add a default-undefined patch if validation strips unknowns). Save on `onNodeDragStop`; localStorage deep-watch + sync tick persist it for free. Nodes with a saved position skip auto-layout; new nodes are dagre-placed relative to the frozen graph; toolbar "Auto layout" re-runs dagre and overwrites saved positions. **Rebase-check against `tab-sync-v2`.**

## Milestones (one branch/PR each)

- **M1 — Core rebuild**: `model.ts`, `flowGraph.ts` (basic edges), `layout.ts`, `useFactoryGraph`, `Graph.vue` rewrite (interim single in/out handles OK). Verify: `cd web && npm run dev`; demo plan on `/graph` → layered LR, no overlap/console spam; add factory+import in planner → graph updates without remount (dragged node doesn't snap back). `npm run test` green.
- **M2 — Handles + edge quality**: FactoryNode rewrite, per-part handles, bound edges, satisfaction coloring, `updateNodeInternals` on recalc. Verify: edges land on correct part rows; starve a supplier in planner → edge turns red live.
- **M3 — Light editing**: `useFactoryOperations`, `useGraphEdits`, connect/explicit-delete, AddProductDialog. Verify: drag export→import creates the input in planner (both sides' metrics update); mismatched part refused; explicit delete removes input; added product materializes an export handle. Vitest connect-flow test on fixtures.
- **M4 — Tracing**: `trace.ts`, `useGraphTrace`, dim/highlight, part scoping. Verify: click end product's export chip in a 3+ deep chain → only its chain lit; Esc/pane clears; cycles safe.
- **M5 — Persistence + navigation + polish**: `graphPosition` field (frontend + backend interface), drag-save, auto-layout button, click-to-navigate (`router.push('/', { query: { focusFactory } })` + small watcher in `Planner.vue` calling existing `navigateToFactory`, `Planner.vue:390`), `hasProblem` minimap coloring, delete old utils/Todo.vue. Verify: reload keeps positions per tab; header click lands on the right planner card.
- **M6 — Compact mode**: toolbar toggle → `buildEdges(..., { compact: true })`; per-part editing/tracing disabled while active (tooltip explains). Verify: multi-part pair collapses to one labeled edge; toggle off restores per-part edges.
