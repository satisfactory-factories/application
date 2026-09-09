---
name: prom-client-deprecated-successor
description: "prom-client is deprecated in favour of @prometheus-io/client; why the backend stayed on it anyway, and what would change the answer"
metadata: 
  node_type: memory
  type: project
  volatility: hot
  lastVerified: 2026-09-01
  originSessionId: 11ae41e3-8e72-499b-a0e3-e526b20af919
  modified: 2026-09-01T14:28:37.622Z
---

`prom-client` (the backend's Prometheus client, added for `GET /metrics`) is **deprecated
on npm**. Installing it prints `prom-client has been replaced by @prometheus-io/client`.
It is not abandoned, it was renamed.

The backend deliberately stayed on `prom-client@^15.1.3` anyway. As of 2026-09-01 the
successor `@prometheus-io/client` was at `0.16.1`, published five days earlier, with only
four versions ever released. This repo's `renovate.json` sets `minimumReleaseAge: "14
days"`, so Renovate would not have proposed it either.

**Why:** the deprecation reads as urgent and is not. The rename carries the same API
(`Registry`, `Gauge`, `collect()`, `registry.metrics()`, `registry.contentType`), so the
swap is cheap whenever it is worth making, and making it early buys a 0.x package's churn
for nothing. The import is confined to `backend/src/metrics/metrics.service.ts` precisely
so that it stays a one-file change.

**How to apply:** when the successor has settled (a 1.x, or simply months of releases and
past the 14 day floor), swap the dependency and the one import. Do not treat the install
warning as a reason to move sooner. If a Renovate PR proposes it, check the successor's
age and version before merging rather than trusting that the bot's floor covers it, since
the floor governs the release's age and not the package's maturity.

Context7's indexed docs for this library already use the new `@prometheus/client` name in
its snippets, which is a **third** name and is not published on npm at all. Do not copy
import lines out of those snippets. See [[context7-index-can-lag]] for the general shape
of that trap.
