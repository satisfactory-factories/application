---
name: raw-input-assumption
description: Why the raw-input assumption reaches the calc engine through a module-level accessor rather than CalculationModes
metadata: 
  node_type: memory
  type: project
  originSessionId: 69e1d33d-d5de-48d6-b095-1de878166bc4
  modified: 2026-07-30T23:50:32.816Z
---

Whether a factory auto-satisfies unmet raw demand is resolved as
`factory.assumeRawInputs ?? getAssumeRawInputs()` — a per-factory override falling back to a global
user setting held in `utils/factory-management/settings.ts`. The app store owns the global and
pushes it in with `setAssumeRawInputs`.

**Why a module-level accessor and not `CalculationModes`:** the engine re-enters itself from
`dependencies.ts` and `inputs.ts`, which call `calculateFactory(factory, factories, gameData)`
without forwarding their modes. A flag threaded through modes would therefore silently revert to
its default partway through a calculation — quietly wrong rather than loudly broken. The module
default is `true` (the historical behaviour) so anything running before the store resolves, and
every spec predating the setting, is unaffected; new plans get `false` pushed in at store init.

**How to apply:** specs that assert raw-supply behaviour must call `setAssumeRawInputs` explicitly —
mounting any component spins up the app store, which resolves the setting from localStorage and
leaks that value into the rest of the file (this is what broke
`testing/tdd/building-groups/editing-buildings.spec.ts`). The store's first-run resolution has three
branches worth preserving: stored value wins; no stored value but a saved plan raises the one-time
migration prompt and leaves the assumption on; no stored value and no plan defaults to off.
See [[extraction-output-multiplier]] for the mining feature this exists to serve.
