---
name: clock-step-freezes-rate-limits
description: "A backwards clock step at boot parks express-rate-limit windows in the future, so the 30s Docker healthcheck alone can 429 the backend container unhealthy — this looks exactly like prod drift and is not"
metadata:
  node_type: memory
  type: project
  volatility: durable
  lastVerified: 2026-08-31
---

`express-rate-limit`'s MemoryStore expires a window on wall-clock time
(`client.resetTime.getTime() <= Date.now()`), not a monotonic timer. If the system clock is
stepped **backwards** after the process starts, every window opened before the step has a
`resetTime` that `Date.now()` will not reach for as long as the step was large. The window never
closes, hits accumulate forever, and the key 429s permanently.

Seen on the production API box on 2026-08-31: the box booted with its clock about an hour ahead,
timesyncd stepped it back ~33 seconds later, and the container had already served its first
`/health` probe. `healthRateLimit` is `max: 10` per 60s and Docker probes every 30s, so the
healthcheck alone exhausted the loopback bucket in five minutes and the container sat `unhealthy`
with a `retry-after` counting down to a reset an hour away. It self-healed the moment the wall
clock passed that reset.

**Why it matters:** the container reports `unhealthy` for as long as the clock offset lasts, which
is what monitoring and anything healthcheck-gated sees. The deploy risk is narrower than it first
looks, and worth stating precisely, because `update.sh` runs `docker compose up -d --wait`:

- A deploy publishing a **new** image digest recreates the container, which opens fresh windows
  against the corrected clock, so it succeeds. This is why the 2026-08-31 10:24 deploy went green.
- A deploy whose image digest is **unchanged** does not recreate the container, so `--wait` blocks
  on the stuck healthcheck until it times out and reports `DEPLOY FAILED` on a healthy image.
- A deploy landing before NTP steps the clock gets a newly created container stuck the same way.

**How to apply:**

- **A `retry-after` that matches no configured window is the tell.** `healthRateLimit` is 60s;
  anything reporting minutes means a frozen window, not a saturated one. Check
  `docker inspect <container> --format '{{.State.StartedAt}}'` against `date -u`: a start time in
  the *future* is the clock step, and `who -b` vs `uptime -s` disagreeing confirms it.
- **Do not read this as prod drift.** It presents identically to
  [[backend-deploy-and-prod-drift]] — running image apparently disagreeing with `main` — and on
  2026-08-31 it was not: `docker exec <container> cat /app/backend/backend.ts` diffed clean
  against `main`. Diff the running source before believing the drift story.
- **The bucket is per key, so only the hammered key shows it.** Loopback 429s while the same
  endpoint answers 200 externally, because tunnel traffic keys by `X-Forwarded-For` and each
  client has a near-empty window. That asymmetry is a symptom, not evidence that something is
  polling loopback. Nothing was.
- **The fix is to exempt loopback from `healthRateLimit`,** which is on `main` as
  `utils/loopback.ts`. It keys off `req.socket.remoteAddress`, never `req.ip`, because
  `trust proxy` makes `req.ip` header-derived and therefore claimable. Verified on the box that
  host-port traffic reaches the container as the docker gateway address rather than `127.0.0.1`,
  so the exemption really does cover only the container's own healthcheck.
