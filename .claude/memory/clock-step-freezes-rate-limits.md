---
name: clock-step-freezes-rate-limits
description: "A backwards clock step parks an express-rate-limit window in the future, so the 30s Docker healthcheck alone can 429 the backend container unhealthy — this looks exactly like prod drift and is not"
metadata:
  node_type: memory
  type: project
  volatility: durable
  lastVerified: 2026-08-31
---

`express-rate-limit`'s MemoryStore expires a window on wall-clock time, verified in the installed
8.6.2 source: `if (client.resetTime.getTime() <= now) this.resetClient(client, now)`, and
`resetClient` sets `now + windowMs`. Nothing monotonic is involved. Step the clock **backwards**
and any window already open has a `resetTime` that `Date.now()` will not reach until real time
catches up. The window never closes, hits accumulate, and that key 429s until it does.

**The ordering is the part that is easy to get backwards.** The window has to be open *before* the
step. A process that is started and left alone until after the step is fine; the damage needs a
request to land first. The key must also stay warm: MemoryStore rotates two maps on a
`setInterval(windowMs)` timer, so an idle key is eventually dropped, while a regularly polled one
is carried forward with its frozen `resetTime` and its accumulated count intact. A 30s healthcheck
is exactly the access pattern that keeps it alive.

Seen on the production API box on 2026-08-31: the box booted with its clock about an hour ahead,
the container started and served a `/health` probe, and timesyncd stepped the clock back ~33
seconds after start. `healthRateLimit` is `max: 10` per 60s and Docker probes every 30s, so the
healthcheck alone exhausted the loopback bucket in about five minutes. The container then sat
`unhealthy` with a `retry-after` counting down to a reset an hour away. It self-healed the moment
the wall clock passed that reset, with no restart and no code change.

**Why it matters:** the container reports `unhealthy` for as long as the clock offset lasts, which
is what monitoring and anything healthcheck-gated sees. The deploy risk is narrower than it looks:

- A deploy publishing a **new** image digest recreates the container, which opens fresh windows
  against the corrected clock, so it succeeds. This is why the 2026-08-31 10:24 deploy went green.
- A deploy whose image digest is **unchanged** does not recreate the container, so `--wait` has to
  reckon with the existing unhealthy one. Whether that blocks forever, exits, or times out is
  **unverified** — no `--wait-timeout` is passed, and the deploy path on the box was not confirmed
  (the repo's `update.sh` is a hand-maintained mirror and was not found running on the host).
- A container created before the step is only stuck if it also serves a request before the step.

**How to apply:**

- **A `retry-after` that matches no configured window is the tell.** `healthRateLimit` is 60s, so
  anything reporting minutes is a frozen window, not a saturated one. Sample it twice: a value
  falling 1 per second is a countdown to one fixed instant. Then check
  `docker inspect <container> --format '{{.State.StartedAt}}'` against `date -u` — a start time in
  the *future* is the step — and `who -b` against `uptime -s`, which disagree by the offset.
- **Do not read this as prod drift.** It presents identically to
  [[backend-deploy-and-prod-drift]], and on 2026-08-31 it was not:
  `docker exec <container> cat /app/backend/backend.ts` diffed clean against `main`. Diff the
  running source before believing the drift story.
- **Prove what is consuming the bucket with the failing streak, not with `ss`.** A snapshot cannot
  see short-lived connections, so it never rules a poller out. The arithmetic does: probes since
  start minus `FailingStreak` came to exactly `max`, meaning the healthcheck was the only client on
  that key. Any extra caller would have made the failures outnumber the probes it accounts for.
- **Healthy now does not mean fixed.** Both the window expiring and the container being replaced
  clear the symptom without changing a line. Confirm by reading `healthRateLimit` out of the
  *running* container, then hitting `/health` over loopback more than `max` times: still 429ing
  means the defect is dormant, and a sane `retry-after` under 60s is what distinguishes dormant
  from active.
- **The `/health` fix does not cover the other limiters.** `utils/loopback.ts` exempts loopback
  from `healthRateLimit` only. `apiRateLimit`, `shareRateLimit` and `versionRateLimit` sit on the
  same MemoryStore and a client key active across a step can still freeze. That is accepted rather
  than solved: it self-heals when real time catches up, and no user was affected.
- **The NestJS rewrite does not inherit this, for a reason worth knowing.** PR #620 replaces
  `backend.ts` with `@nestjs/throttler`, keeping `/health` at 10 per 60s and adding no loopback
  exemption, so it looks like the same setup. It is not. Throttler drains the hit count with
  `setTimeout(..., ttl)` per hit, and Node timers are monotonic, so a clock step cannot stop the
  count falling. `expiresAt` is wall-clock but only feeds the reported retry-after. The residual
  hazard is `blockExpiresAt`: once a key is actually blocked, unblocking waits on `Date.now()`, so
  a backwards step there would extend the block. Reaching that needs more than 10 hits in 60s,
  which a 30s probe cannot do. Do not port `utils/loopback.ts` into the Nest config expecting it
  to fix this; it would be belt-and-braces, not a fix.

- **Key off `req.socket.remoteAddress`, never `req.ip`.** `trust proxy` makes `req.ip`
  header-derived and therefore claimable. Verified on the box that host-port traffic reaches the
  container as the docker gateway address rather than `127.0.0.1`, so the exemption covers only
  the container's own healthcheck.
