# Error and event metrics

> **Revision 3.** Second Codex pass, RETHINK again. The central finding was real and mine:
> `navigator.sendBeacon` returns only whether the browser queued the request, so the
> status-based disposal policy revision 2 introduced was impossible with the API it chose.
> Also: the test list contradicted the design, the alert inventory was wrong a second time
> (sixteen sites, not six), and the rate-limit sizing did not survive contact with a shared
> office network. All fixed below.
>
> **Revision 2.** Reviewed by Codex, RETHINK. Seven objections, all of them checked against
> the code and all of them standing. The three that changed the design are: an exception
> filter cannot simply re-throw, the server counters would have created module cycles, and
> `StructuralRepair` carries no machine-readable reason, so wiring the repairs is a contract
> change rather than the free win claimed. Two factual claims were also wrong and are
> corrected. See the response table at the end.

A `POST /events` endpoint and a set of error counters, so there is *some* indication of what
is going wrong. Explicitly not a replacement for real error tracking: no stack traces, no
messages, no per-occurrence detail. Counts by reason, and nothing else.

## Tasks

- [ ] Add a closed `EventReason` enum and a batched `eventReportSchema` to `common/`
- [ ] Add `POST /events`: unauthenticated, version-gate exempt, size-capped, own throttle bucket
- [ ] Add `sf_events_total{source,reason}` as a prom-client **Counter**, incremented by the endpoint and in-process
- [ ] Add `sf_http_errors_total{status}` fed by a global exception filter, so unhandled 500s stop being invisible
- [ ] Wire the 14 structural repairs in `web/src/utils/factory-management/validation.ts`
- [ ] Wire `plan_repair_safe_mode_reset` and `calc_dependency_corrupt_alert`
- [ ] Wire the named server counters listed below
- [ ] Add a client-side event buffer that accumulates counts and flushes on the heartbeat interval
- [ ] Backend specs: enum rejection, batch caps, counter increments, the filter, no double counting
- [ ] Common specs for the schema; web specs for the buffer, including that it never throws
- [ ] Dashboard row for errors
- [ ] Update `docs/telemetry.md` for the new endpoint and what it does and does not carry

## Why a counter, and why no database

This is the question the last two plans got wrong in opposite directions, so it is worth
being explicit.

`sf_events_total` is a **Counter**, held in process memory, and is **not** persisted.

That looks like the mistake we just corrected for the client census, and it is not the same
case. The census is a **gauge**: it describes the present, so losing it on a deploy loses the
only copy of the current picture, which is exactly what people noticed. A counter describes
an accumulation, and **Prometheus already stores that accumulation** for ninety days.
`increase(sf_events_total[7d])` is computed from stored samples and handles a counter reset
natively; a restart costs nothing but the all-time total, which is not a number anybody
asked for.

Persisting counters would also invert the load profile: a write per error, arriving fastest
exactly when something is already wrong. The heartbeat is one write per browser per five
minutes and was safe to persist. An error storm is not.

So: no Mongo collection, no Redis, and the "lost on redeploy" objection does not carry over.

## Where the counters live

Codex's most practical objection: `MetricsService` already imports `RoomsModule`,
`AuthModule` and `RealtimeModule` to read from them. Injecting it back into those services to
increment a counter reverses those edges and puts a cycle in the graph. This has already
happened twice in this workstream, both times solved the same way.

So the counters get their own module, `backend/src/event-counters/`, depending on nothing:

```
EventCountersModule
  └─ EventCountersService   owns its own prom-client Registry, exposes record(source, reason)
```

Everything imports it and nothing is imported by it. `MetricsService` combines the two
registries at render time with `Registry.merge([...])`, which is a supported prom-client API
and was verified against the installed version.

`EventCountersService` must have **no dependencies at all**, not even the clock. A metric
writer that can fail to construct is worse than no metric.

## The reason enum

Reasons are a **closed enum in `common/`**, not free text.

`POST /events` is unauthenticated. A free-text reason is an unbounded label, which is a
cardinality bomb with no ceiling: a script could mint a million series that Prometheus then
keeps for ninety days. An enum means the label set is fixed at compile time and a client
that sends anything else is refused.

The pattern-and-cap approach used for the version and commit labels is not enough here.
Those are shaped values with a natural fallback bucket; a reason has no shape to check.

## Batching

The client does not send one request per error. It keeps a small `Map<reason, count>` and
flushes on a timer.

Sending per error would be a request per occurrence at exactly the moment something is
looping, which is how a telemetry endpoint becomes the outage.

**Sixty seconds, not five minutes.** The first draft reused the heartbeat's interval; Codex
was right that this deliberately throws away up to five minutes of events on a crash, a
force-close or a mobile suspension. The payload is a handful of integers, so a shorter tick
costs nothing and cuts the worst-case loss fivefold.

**The unload path uses `fetch(..., { keepalive: true })`, not `sendBeacon`.**

Revision 2 chose `sendBeacon` and then specified a disposal policy keyed on the response
status. Those are incompatible: `sendBeacon` returns a boolean saying whether the browser
queued the request and never exposes a status. The policy could not have been implemented.

`keepalive` survives the teardown the same way and does return a response, so one code path
serves both cases. The heartbeat already uses it.

The two paths differ in disposal, and only in disposal:

- **Timer flush** — status-based, per the table below.
- **Unload flush** — send and clear unconditionally, without waiting. The page is going away;
  retaining a buffer that is about to be garbage collected is not retention, and blocking
  unload on a response is worse than losing a count.

A hard crash still loses the buffer. No client-side scheme fixes that and the plan does not
pretend one does.

**Failure disposal is defined**, which the first draft left open:

| Response | What happens |
| --- | --- |
| 204 | Buffer cleared |
| 400, 413 | Buffer **dropped**. It will never succeed, and retrying forever is a loop |
| 429, 5xx, transport failure | Buffer **kept** and merged with the next interval |

Note this needs the response status, which means it cannot reuse `sendTelemetryHeartbeat`:
that helper ignores the response entirely, because `fetch` only rejects on transport failure
and the heartbeat has nothing to decide. The events client checks `response.ok` and the
status.

Payload:

```
{ instanceId, appVersion, gitSha?, events: [{ reason, count }, ...] }
```

Caps: at most one entry per enum member, `count` capped per entry, and the whole body under
the same byte cap `/telemetry` uses. The retained buffer is bounded by the enum itself, so a
permanently failing endpoint cannot grow it without limit; counts saturate at their cap
rather than accumulating forever.

## What gets counted

### Client, from the repair taxonomy

**This is a contract change, not free wiring.** `StructuralRepair` is
`{ kind, factoryName, summary }` — the reason exists only as English prose in `summary`. The
first draft claimed the taxonomy was ready to wire; it is not.

So `repair()` gains a `reason: EventReason` parameter and `StructuralRepair` gains the field.
Every call site passes one. That is fourteen one-word edits in a file that already has to be
touched, and it makes the counter and the user-facing dialog the same fact rather than two
lists that can drift.

The detection logic is still free: every condition below is already found and already
repaired today.

| Line | Condition | Reason |
| --- | --- | --- |
| 34 | Two factories share an internal id | `plan_repair_duplicate_factory_id` |
| 60 | `partDisposal` unreadable, cleared | `plan_repair_disposal_unreadable` |
| 91 | Sink/depot counts not whole, corrected | `plan_repair_disposal_count_invalid` |
| 122 | Duplicate import rows merged | `plan_repair_duplicate_input_merged` |
| 159 | Export to an unidentifiable factory, removed | `plan_repair_export_orphaned` |
| 169 | Export nobody requested, removed | `plan_repair_export_unrequested` |
| 175 | Export amount disagreed with the requester | `plan_repair_export_amount_mismatch` |
| 217 | Import with no matching export, restored | `plan_repair_import_export_missing` |
| 250 | Import amount not positive, forced to 1 | `plan_repair_import_amount_nonpositive` |
| 262 | Import from an unidentifiable factory, removed | `plan_repair_import_orphaned` |
| 267 | Factory importing from itself, removed | `plan_repair_import_self_reference` |
| 279 | Null product entry, removed | `plan_repair_product_entry_null` |
| 285 | Product amount not positive, forced to 0.1 | `plan_repair_product_amount_nonpositive` |
| 294 | Product missing a part entry, re-added | `plan_repair_part_entry_missing` |

Plus the alerts. This inventory has now been wrong twice: the first draft said one site, the
second said six, and there are **sixteen**. So this time there is a stated criterion rather
than a list somebody eyeballed.

**An alert is a fault when it tells the user to report something, or says data was lost,
corrupted or could not be read. It is not a fault when it tells the user what they may not
do.** By that rule, eleven are counted and four are deliberately excluded:

*Excluded, user validation:* the three task-limit alerts in `PlannerFactoryTasks.vue`
(maximum tasks, task too long, character limit) and the waste-product guidance in
`Product.vue`. These are the app working.

- `web/src/stores/app-store.ts:74` — tab state unrecoverable, rebuilt from nothing
  ("SAFE MODE"). Actual data loss. → `plan_repair_safe_mode_reset`
- `web/src/utils/factory-management/dependencies.ts:125` — corrupted factory data cleaned up
  → `calc_dependency_corrupt_alert`
- `web/src/utils/factory-management/dependencies.ts:19` — the other dependency alert path
  → `calc_dependency_error_alert`
- `web/src/stores/game-data-store.ts:52` — game data would not load at all → `game_data_load_failed`
- `web/src/stores/app-store.ts:685` — factory validation threw → `plan_validation_threw`
- `web/src/components/planner/PlannerFactorySatisfactionItems.vue` — fix-product found no
  product → `calc_fix_product_missing`
- `web/src/components/planner/PlannerFactorySatisfactionItems.vue` — fix-generator found no
  generator → `calc_fix_generator_missing`
- `web/src/components/planner/products/PowerProducer.vue` — no recipe for a power generator
  → `calc_power_recipe_missing`
- `web/src/components/planner/PlannerGlobalActions.vue` — an imported plan would not validate
  → `plan_import_invalid`
- `web/src/pages/share/[id].vue` — a share link carried invalid data → `share_load_invalid`
- `web/src/pages/share/[id].vue` — a share link would not load at all → `share_load_failed`

And two transport faults worth separating from the above:

- `web/src/api/client.ts:52` — the request never reached a response → `api_network_error`
- `web/src/stores/room-sync-store.ts:1194` — a room hit the reject streak and paused
  → `sync_room_paused`

### Server, in process

No endpoint involved; these increment where the error already happens.

| Site | Reason |
| --- | --- |
| `health.controller.ts:53` Mongo ping failed or timed out | `health_db_ping_failed` |
| `room-sweeper.service.ts:44` the hourly sweep threw | `room_sweep_failed` |
| `rooms.service.ts:482` slug attempts exhausted | `slug_allocation_exhausted` |
| `legacy.controller.ts:56` share id attempts exhausted | `share_id_allocation_exhausted` |
| `room.gateway.ts:226` handshake threw reading the account | `ws_handshake_internal_error` |
| `room.gateway.ts:188` a message handler threw | `ws_message_handler_error` |
| `room-access.service.ts:54` consistent read gave up | `room_access_unstable_race` |
| `room-op.service.ts:110` activity row lost | `post_commit_activity_lost` |
| `room-op.service.ts:116` editor stamp lost | `post_commit_editor_stamp_lost` |
| `auth.service.ts:60` sign-in stamp lost | `post_commit_signin_stamp_lost` |
| `rooms.service.ts:539` room meta activity lost | `post_commit_room_activity_lost` |
| `room-events.service.ts:41` an event listener threw | `room_event_listener_threw` |

The five `post_commit_*` reasons matter more than they look: each marks a place where the
user's change succeeded and a record of it did not, and today every one of them is a log
line nobody reads.

### Server, everything else

A global `APP_FILTER` increments **`sf_http_errors_total{status}`**.

**It extends `BaseExceptionFilter` and calls `super.catch()`**, which is Nest's documented way
to wrap the default handler. It does not "increment and re-throw": a filter owns exception
handling, and throwing back out of one is not a defined delegation and can leave a request
hanging. `BaseExceptionFilter` is exported from `@nestjs/core`, verified against the installed
version.

**Scope, stated honestly:** this covers the HTTP request pipeline only. It does **not** see
WebSocket gateway errors, the hourly sweeper, or anything thrown outside a request. Those are
exactly why the named counters in the previous section exist, and the two halves are
complementary rather than redundant.

This is still the piece with the most value per line: there is no exception filter today, so
an unhandled 500 is counted by nothing at all.

Statuses are bounded by definition, so no cardinality question. 4xx from ordinary validation
will dominate and that is fine; it is the 5xx line that matters.

**One incident can appear in both metrics, and that is intended.** `slug_allocation_exhausted`
increments its named reason and then throws a 503, which the filter also counts. The earlier
claim that separate metric names prevent double counting was simply wrong. They are two
views: `sf_events_total` is per cause, `sf_http_errors_total` is per response. Do not add
them together.

## What is deliberately not counted

User-input validation. "You cannot enter 0", a taken username, a password too short, a
refused invite password. These are the system working, and counting them would bury the
signal.

Ordinary refusals with a business meaning are also out: `room_id_taken`, `slug_taken`,
`preferences_revision_conflict`, `too_many_rooms`. They are already visible as 4xx in
`sf_http_errors_total` if anybody wants them, and they are not faults.

`op_reject` is **split** rather than excluded wholesale, which is a change from the first
draft. `stale` and `duplicate` are the concurrency control working exactly as designed and
happen constantly in normal two-person editing; counting those would bury everything else.
The abnormal ones are worth their own reasons, because Codex was right that folding them all
into `sync_room_paused` loses the cause:

`sync_op_reject_forbidden`, `sync_op_reject_too_large`, `sync_op_reject_invalid`,
`sync_op_reject_undeclared_bulk_removal`

plus `sync_room_paused` for the point at which the client gives up entirely.

## Endpoint shape

Mirrors `POST /telemetry`, which already solved these questions:

- Unauthenticated. The clients most worth hearing from are the broken ones.
- `@SkipVersionGate()`, so a client too old to write can still report that it is failing.
- Its own throttler bucket, exempt from the global one, so an error storm cannot rate-limit
  plan syncing and vice versa. **Sized for a shared address, not a single browser.**
  Codex was right that reusing `/telemetry`'s 60/min would give a modest office routine 429s
  at a 60s cadence.

  The sizing argument only works because of the next point: **an empty buffer sends nothing
  at all.** Errors are rare, so nearly every tick is silent and the bucket only has to cover
  browsers that are actually failing. 120/min, and a 30s per-instance floor enforced the same
  way `/telemetry` does it, in the endpoint rather than in the counter service.
- Body cap enforced in the controller, `413` past it. **After parsing, not before** — the
  first draft claimed otherwise and Codex was right to call it. `bootstrap.ts` installs one
  global JSON parser at 20MB, so a large body is already read and allocated before any route
  code runs. The honest position: the byte cap bounds what is *stored and counted*, and the
  throttler bucket is what bounds the load. Fixing it properly means a route-scoped parser
  registered ahead of the global one, which is a change to shared bootstrap behaviour and
  belongs in its own piece of work rather than smuggled into this one. `/telemetry` has the
  same property today.

  **So this endpoint is not "size-capped" in an operational sense and the plan should stop
  implying it is.** The byte cap bounds what is stored and counted. The throttler bounds
  request rate. Neither bounds the allocation, and on an unauthenticated route that is worth
  writing down rather than glossing.
- `204` always, empty. Nothing is returned that a client could act on.

## Client rules

The buffer must never become the problem it is reporting on:

- Recording an event is synchronous and **cannot throw**. The guarantee is provided by an
  explicit `try/catch` around the whole of `record()`, not by an argument that a `Map`
  increment is safe: revision 2 claimed the latter, and Codex was right that reading stores,
  building a payload and serialising JSON can all throw. These hooks are being inserted into
  recovery paths, which is the worst possible place for a metric to raise.
- `record()` **rejects an unknown reason before insertion**. That is what actually bounds the
  buffer to the enum, and revision 2 asserted the bound without specifying the check.
- Flushing is wrapped the same way, end to end.
- Flushing is fire and forget, swallowed like the heartbeat, and silent in the console.
- Offline mode means total backend silence, so nothing flushes while `isSuppressed` is set.
  Events recorded during offline mode stay buffered and go out on the next flush.
- The buffer is bounded. Past the cap, further increments to *existing* reasons still count
  but new reasons are dropped, since the enum bounds it to a few dozen anyway.

## Testing

- Every enum member round-trips; an unknown reason is refused with 400
- Batch caps: too many entries, a count past its cap, a body past the byte cap
- The counter increments by the reported count, not by one per request
- `sf_http_errors_total` increments on a thrown 500 and on a 4xx
- A named server reason **and** the filter both count a slug exhaustion, once each, in their
  own metric. Revision 2's test list asserted the opposite of its own design; this is the
  corrected assertion.
- An `HttpException` carrying a structured body still returns that exact body with the filter
  installed, not merely the same status
- The client buffer accumulates, flushes, clears on success and retains on failure
- Recording an event never throws, even with a bad reason
- Nothing flushes in offline mode, and the buffer survives it

## Review responses

| Finding | Response |
| --- | --- |
| 1. A filter cannot increment and re-throw | **Fixed.** Extends `BaseExceptionFilter` and calls `super.catch()`; scope narrowed to HTTP and stated |
| 2. Double counting is not prevented by separate names | **Conceded.** One incident can appear in both; they are per-cause and per-response views and must not be summed |
| 3. The body cap is not pre-parse | **Conceded.** Claim corrected rather than the code; the real fix is scoped out with a reason |
| 4. Server counters would create module cycles | **Fixed.** A dependency-free `EventCountersModule` with its own registry, merged at render |
| 5. "Restart costs nothing" overstates it | **Corrected.** Un-scraped increments are genuinely lost; see below |
| 6. Five-minute batching loses too much | **Fixed.** 60s, `sendBeacon` on unload, and a defined disposal policy per status |
| 7. `StructuralRepair` has no machine reason | **Fixed.** `repair()` gains a `reason`; called out as a contract change, not free wiring |
| 7b. `dependencies.ts:125` is not the only `alert()` | **Corrected.** There are six, and all six are counted |
| Q5. Excluding `op_reject` loses the cause | **Fixed.** Split: the four abnormal reasons counted, `stale` and `duplicate` excluded |

**Round two:**

| Finding | Response |
| --- | --- |
| 1. `sendBeacon` cannot report a status, so the disposal policy is impossible | **Fixed.** `fetch` with `keepalive` on both paths; unload clears unconditionally and says why |
| 2. The test list contradicts the design on double counting | **Fixed.** The assertion is inverted to match: both metrics increment, once each |
| 3. Rate limit not sized for a shared address, and no per-instance floor specified | **Fixed.** 120/min, a 30s per-instance floor, and an empty buffer sends nothing at all |
| 4. Calling the endpoint size-capped is misleading | **Conceded.** Stated plainly as bounding what is stored, not what is allocated |
| 5. The alert inventory is wrong again: sixteen sites, not six | **Fixed.** Stated criterion, eleven counted, four excluded with reasons |
| 6. The no-throw contract is stronger than the implementation described | **Fixed.** Explicit try/catch around record and flush, and an unknown-reason check before insertion |
| 7. The risk section still says "increment and re-throw" | **Fixed.** |

On finding 5, precisely: a counter reset is handled by `increase()`, but increments between
the last scrape and the process dying are lost, as are events during a scrape outage. At a
30s scrape that is a sub-minute window. It is a real loss and the plan no longer says
otherwise.

## Risks

- **Up to 30 seconds of counts are lost when the process dies**, and more during a scrape
  outage. Indicative, not authoritative.
- **An unauthenticated counter can be inflated.** The enum bounds *which* labels exist, not
  the values. Accepted: the throttle bucket and per-instance floor make it tedious, and the
  numbers are indicative rather than authoritative. Worth stating on the dashboard.
- **The `post_commit_*` reasons may be noisy or silent.** Nobody has ever measured them.
  Either outcome is informative.
- **The exception filter sits in front of every request.** It must do nothing but record and
  delegate to `super.catch()`; any logic in it is a new failure mode on the hot path. (Earlier
  revisions said "increment and re-throw" here, which was the wrong mechanism.)
- **Adding `reason` to `StructuralRepair` breaks existing fixtures.**
  `web/src/components/PlanRepairDialog.spec.ts:19` builds one by hand, and any equality
  assertion over a repair list will need updating. The dialog itself ignores unknown fields,
  so rendering is unaffected.
- **Counting a repair that fires on every load** would flood the numbers. The repairs are
  believed rare, but if one turns out to fire constantly, the honest response is to fix the
  repair rather than stop counting it.

## Out of scope

Stack traces, error messages, per-plan attribution, alerting rules, and any change to the
existing usage metrics or the heartbeat's field set.
