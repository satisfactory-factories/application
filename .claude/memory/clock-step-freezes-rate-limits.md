---
name: clock-step-freezes-rate-limits
description: "A backwards clock step at boot froze express-rate-limit windows in the future, so the 30s Docker healthcheck alone 429'd the API container unhealthy; @nestjs/throttler closed that path, and the incident is worth keeping because it presents identically to deployment drift"
metadata:
  node_type: memory
  type: project
  volatility: durable
  lastVerified: 2026-09-07
---

## What happened

The API box booted with its clock about an hour ahead. `systemd-timesyncd` stepped it back some
30 seconds later, by which point the container had already served its first `/health` probe.

`express-rate-limit`'s MemoryStore expired a window on wall-clock time
(`client.resetTime.getTime() <= Date.now()`), with nothing monotonic involved. That first window
had been given a reset an hour in the future that `Date.now()` could not reach, so it never
closed and hits accumulated forever. `/health` was 10 per 60s and Docker probes every 30s, so the
healthcheck alone exhausted the loopback bucket in about five minutes and the container sat
`unhealthy` serving 429s. Real users were never affected: tunnel traffic keys on
`X-Forwarded-For`, so every client had its own near-empty window.

Two things cleared it, neither of them a code change: the wall clock eventually passed the frozen
reset, and a later deploy replaced the container against a corrected clock. Both hide the defect
without fixing it, which is why "it is healthy now" was never evidence.

## The library rewrite closed it

The NestJS rewrite moved rate limiting to `@nestjs/throttler`, and that is what ended this class
of freeze. Verified against the installed 6.5.0 by driving `ThrottlerStorageService` through a
faked backwards step of an hour: **it decrements each hit on its own `setTimeout(ttl)`, and Node
timers are monotonic, so a clock step alone cannot stop the count falling.** Under the healthcheck's
access pattern the count sits at 2 and never climbs, stepped clock or not. `expiresAt` is still
wall-clock but only feeds the reported retry-after; it does not gate anything.

Two paths survive, and the second is the more serious.

**`blockExpiresAt` is still wall-clock.** Once a key is *actually* blocked, unblocking waits
on `Date.now()`, so a backwards step extends the block by the offset. Reaching it needs more hits
inside one ttl than the limit allows, which two probes a minute cannot do, so `/health` is out of
reach of it.

**Timers are cancelled per bucket, not per client, so a count can stall for a reason that has
nothing to do with the clock.** `timeoutIds` is keyed by throttler name alone, and
`resetBlockdRequest` calls `clearExpirationTimes(throttlerName)`, so unblocking any one client
cancels the pending decrements of every other client in that bucket. Their counts then never
fall. Repeated block-and-reset cycles accumulate, and the buckets that can strand a real person
are `login`, `roomAuth`, `share` and `slugLookup`; `global` can eventually refuse ordinary
traffic. So the statement above is about the clock specifically: a step cannot stall a count, but
something else can.

`backend/test/throttler-clock-step.spec.ts` pins the clock behaviour and is the thing to re-run if
the throttler is ever upgraded or swapped. It uses one key per bucket, so it cannot see the
cross-client cancellation on its own.

## The traps worth keeping

- **It presents identically to deployment drift.** The running container 429ing while `main`
  looks correct reads exactly like [[backend-deploy-and-prod-drift]], and it was not: the running
  source diffed clean against `main`, byte for byte. Diff the running source before believing the
  drift story.
- **A `retry-after` that matches no configured window is the tell.** The health bucket is 60s, so
  anything reporting minutes is a frozen window rather than a saturated one. Sample it twice: a
  value falling one per second is counting down to one fixed instant. Then check the container's
  `StartedAt` against `date -u`, and the recorded boot time against uptime, which disagree by the
  offset.
- **Prove what is spending a bucket with the failing streak, not with a socket snapshot.** A
  snapshot cannot see short-lived connections, so it never rules a poller out. The arithmetic
  does: probes since start minus the failing streak came to exactly the limit, so the healthcheck
  was the only client on that key.
- **The bucket is per key, so only the hammered key shows it.** Loopback 429ing while the same
  route answers 200 from outside is a symptom of per-key windows, not evidence that something is
  polling loopback.

## The loopback exemption

`src/config/loopback.ts` exempts the container's own probe from the health bucket, wired into
`HEALTH_THROTTLE`'s `skipIf` in `src/config/throttling.ts`. It is defence in depth rather than a
fix for the above: nothing outside the container can reach loopback inside its own network
namespace, and `up --wait` blocks on that probe, so counting it can only ever turn a healthy
deploy into a failed one.

- **Key off `req.socket.remoteAddress`, never `req.ip`.** `trust proxy` makes `req.ip` derive from
  `X-Forwarded-For`, which any caller can set; the kernel-reported TCP peer cannot be claimed by a
  header. Confirmed in a local container that traffic arriving through a published host port
  reaches the process as the docker bridge gateway address rather than loopback, and that an
  `X-Forwarded-For: 127.0.0.1` from outside changes `req.ip` but not the peer.
- **The probe arrives IPv4-mapped.** Node's dual-stack listener reports it as `::ffff:127.0.0.1`,
  so a predicate matching only `127.0.0.1` would silently never fire. The whole of `127.0.0.0/8`
  counts, and `::1` with it.
- **Scoped to `/health` on purpose.** Every other bucket exists to hold a real client, and the
  deploy-blocking argument applies to nothing else. Exempting loopback globally would also turn
  the whole throttling test suite into a no-op, since supertest connects over loopback.
