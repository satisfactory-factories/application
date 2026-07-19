---
name: project-satisfactory-factories
description: What the Satisfactory Factories project is and where my onboarding docs live
metadata: 
  node_type: memory
  type: project
  originSessionId: 3dbfec8a-0a0f-442f-9ac1-d5872e8f0b23
---

Satisfactory Factories is a logistics planner for the game Satisfactory: users split production into "factories", link them via imports/exports, and the tool recalculates a per-part supply/demand ledger across the whole graph to surface bottlenecks (`hasProblem`). Monorepo: `web/` (Vue 3 + Vuetify + Pinia + Vitest), `backend/` (small Express+Mongo save/share API), `parsing/` (game Docs.json → gameData.json, Jest, tests mandatory).

**Why:** Core orientation for every session in this repo.

**How to apply:** I wrote a full architecture map in `docs/architecture/` (overview, calculation-engine, frontend-and-data-flow, building-groups) during onboarding on 2026-07-17 — read those first instead of re-exploring. Key entry points: `web/src/interfaces/planner/FactoryInterface.ts` (all types), `web/src/utils/factory-management/factory.ts` (`calculateFactory` pipeline — its step order is load-bearing), `web/src/components/planner/Planner.vue` (provides `updateFactory`). Recalc is explicit: components must call the injected `updateFactory` after mutations; forgetting it is a classic bug. Test fixtures live in `web/src/utils/factory-setups/` (issue-numbered example plans); behavior suites in `web/testing/tdd/` map to hand-maintained status sheets in `docs/testing/*.md`. Related: [[building-groups-branch-status]].
