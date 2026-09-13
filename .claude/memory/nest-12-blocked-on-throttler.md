---
name: nest-12-blocked-on-throttler
description: The Nest monorepo v12 bump fails on @nestjs/throttler, which only peers on Nest <= 11; @nestjs/mongoose and @nestjs/jwt v12 are fine on Nest 11
metadata:
  type: project
  volatility: hot
  lastVerified: 2026-09-12
---

Renovate's `fix(deps): update nest monorepo to v12` PR (#687) fails the backend build with
`TS2345 ... not assignable to parameter of type 'ThrottlerAsyncOptions'` at the
`ThrottlerModule.forRootAsync` call in `app.module.ts`. The cause is `@nestjs/throttler`
6.5.0 peering on `@nestjs/common` 7 to 11 only, so pnpm resolves a second Nest for it and
the `ExecutionContext` types diverge. Upstream tracks it as nestjs/throttler#2669 with the
fix in nestjs/throttler#2672.

`@nestjs/mongoose` 12 and `@nestjs/jwt` 12 both peer on `^11 || ^12` and moved to 12 on
Nest 11 in PR #694 with the backend suite green.

**Why:** the type error looks like a Nest 12 API change and it is not; casting past it
would run the guard against a duplicated Nest core.

**How to apply:** merge #687 once a throttler release lists `^12.0.0` in its peers
(`pnpm view @nestjs/throttler peerDependencies`), and re-check the multer override in
`pnpm-workspace.yaml` then, since `@nestjs/platform-express` pins multer exactly and a
newer platform-express may carry a fixed one. Nest 12 also needs Node 20.19+/22.12+,
which `.nvmrc` (24) already satisfies.
