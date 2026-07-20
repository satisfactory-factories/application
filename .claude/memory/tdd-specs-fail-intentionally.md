---
name: tdd-specs-fail-intentionally
description: "web/testing/tdd/ holds WIP specs written before implementation — failures there may be intentional, not regressions"
metadata: 
  node_type: memory
  type: project
  originSessionId: cbb915fc-14e9-4764-93c1-fc8e361ec3e4
---

Matt keeps work-in-progress TDD specs in `web/testing/tdd/` (often as uncommitted local modifications) that are written *ahead* of the implementation, so some intentionally fail. As of 2026-07-19, `building-groups/clocks-ingredients.spec.ts` had 2 such failing tests (BG-E-C-PROD-9, BG-E-I-PROD-9) plus a `padded-blocks` lint error, all pre-existing user WIP.

**Why:** Prevents misdiagnosing pre-existing TDD failures as regressions caused by unrelated changes.

**How to apply:** Before blaming a test failure on your change, check `git status`/`git diff` for user-modified files under `web/testing/tdd/` — if the failing test is in a locally-modified WIP spec, report it as pre-existing rather than fixing or reverting it.
