---
name: nest-12-blocked-on-throttler
description: Nest 12 landed once @nestjs/throttler 6.6+ peered on it; the leftover traps are Nest 12's exports map hiding `@nestjs/common/interfaces` under nodenext, and @nestjs/config jumping 4.x to 12.x
metadata:
  type: project
  volatility: normal
  lastVerified: 2026-09-21
---

Renovate's `fix(deps): update nest monorepo to v12` (#687) sat red from 2026-09-11 because
`@nestjs/throttler` 6.5.0 peered on Nest 7 to 11 only, so pnpm resolved a second Nest for it
and the types diverged. 6.6.0 (2026-09-16) added `^12.0.0` to its peers and the bump went in
on the 2026-09-21 sweep branch.

**What it took beyond the version numbers:**

- `@nestjs/config` 4.x peers on Nest 10/11; it renumbered to 12.0.0 to match core, so the
  bump reads as eight majors and is nothing of the sort.
- Nest 12's `@nestjs/common` gained an `exports` map (`./*` to `./*.js`). Throttler's typings
  import `ModuleMetadata` from `@nestjs/common/interfaces`, a directory, which that map cannot
  resolve under `moduleResolution: nodenext`. `ModuleMetadata` silently becomes `any`, and
  `Pick<any, 'imports'>` makes `imports` a required key on `ThrottlerAsyncOptions`. The
  `TS2345 ... Property 'imports' is missing` error at `ThrottlerModule.forRootAsync` is that,
  not an API change; `imports: []` satisfies it. Still unfixed upstream at the time of writing.
- Throttler 6.6.0 also fixed the cross-client decrement cancellation
  [[clock-step-freezes-rate-limits]] describes; the canary in
  `backend/test/throttler-storage.spec.ts` went red as designed and now pins the fix.
- `@nestjs/platform-express` 12 pins multer 2.4.0, past the advisory fix the
  `pnpm-workspace.yaml` override existed for, so the override is gone.

**Why:** three of the four surprises look like Nest 12 API changes and none of them is.
Casting past the `imports` error would hide a typing degradation, not fix one.

**How to apply:** when a Nest package's types go `any` after a bump, `tsc --traceResolution`
and look for "was not resolved" against the `exports` subpath before touching the call site.
