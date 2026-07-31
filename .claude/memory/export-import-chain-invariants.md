---
name: export-import-chain-invariants
description: Exports are derived from imports; the invariant checker is the contract, and factory IDs must be unique or the whole thing collapses
metadata:
  node_type: memory
  type: project
---

A provider's `dependencies.requests` is **derived state** — it is rebuilt from the consumers' `inputs` on every calculation and nothing else may be the source of truth. The contract is written once in `web/src/utils/factory-management/dependency-integrity.ts` (`findDependencyChainViolations`), enforced at load by `validateFactories`, and asserted after every mutation in `dependency-integrity.spec.ts` and the seeded `ghost-fuzz.spec.ts`. Any change to dependencies, inputs or the commit engine should leave both green.

Two traps behind it, both of which produced "ghost exports" (a factory advertising an export nobody imports):

- **Factory IDs must be unique.** Requests are keyed by factory ID, so a duplicate merges two factories into one as far as dependencies are concerned — one request covering two importers, the wrong name on the export chip, and deleting either factory taking the other's imports. IDs come from `generateFactoryId(factories)`; never `Math.random()` on its own, and never 0 (`findFac` and the input validation both read 0 as "not set").
- **A loaded plan is not recalculated** unless something asks for it (see gotcha 8 in [[calc-engine-gotchas]]). Corrupt derived data therefore survives every reload, which is why `validateFactories` returns "needs recalculation" and `initFactories` honours it.

**Why:** the engine's happy paths were already sound — a straight delete/edit/retarget reconciles fine. Every real ghost came from data that got corrupt *outside* a calculation and then never got flushed, so detection at load matters more than another guard inside the engine.

Corrections are surfaced, never silent: `validateFactories` returns a `StructuralRepair[]`, `initFactories` merges it with the precision repairs into `planRepairs`, and `PlanRepairDialog` renders the lot grouped by factory. Write summaries for someone who has never read the code and put the IDs in the console line instead — and never reach for `alert()`.

**How to apply:** when adding a mutation path that touches inputs or requests, add a case to `dependency-integrity.spec.ts` rather than asserting on request shapes ad hoc. If a repair can't be expressed as "recalculate", it belongs in `validation.ts` next to `repairDuplicateFactoryIds` / `mergeDuplicateInputs`.
