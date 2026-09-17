---
name: prom-client-label-lifecycle
description: A prom-client gauge publishes a label set only after it is set, and remembers it forever once it has been; bounded labels must be seeded at zero and top-N labels must be reset
metadata:
  type: project
  volatility: durable
  lastVerified: 2026-09-17
---

`prom-client` emits a series for a label combination only once `.set()` has been called with
it, and once called it remembers that combination for the life of the process. Both halves
cause a different bug, and the fix for one is the opposite of the fix for the other.

**Never set means absent, and Grafana renders absent as "No data", not as zero.** A gauge whose
labels come from a database table is missing entirely while that table is empty, which is
exactly release day. `sf_room_actions_total` shipped this way and every panel in the
Collaboration row read "No data" until the metric was seeded. `EventCountersService` had
already solved it for fault reasons and the lesson did not carry across.

**Set once means set forever, so a label that drops out keeps reporting its last value.** The
top-N gauges (`sf_room_factories`, `sf_user_edits`, `sf_share_opens`) would otherwise show a
plan its final size long after it left the top twenty.

So:

- **Bounded, known label set** — enumerate it and seed every value at zero before overlaying
  what is stored. Overlay rather than replace, so a value held in the database but no longer
  in the enum still reports instead of being silently dropped.
- **Unbounded or ranked label set** — `reset()` the gauge before writing the new rows, and
  only when the underlying query actually refreshed. Resetting on a failed refresh blanks the
  panel; see the `refreshed` flag on [[calc-engine-gotchas]]-style cached queries in
  `metrics/cached-query.ts`.

A related trap on the query side: `increase()` and `delta()` extrapolate to the range
boundaries, so a flat counter reports drifting non-integers. Wrap them in `round()`, and for a
monotonic value held in a gauge use `x - (x offset 7d)` rather than `delta()`, which is exact.

**Counters have a third failure, and it is silent.** An unseeded counter series is born at the
first scrape after its first increment, already carrying whatever count arrived before that
scrape. `increase()` and `rate()` only see movement between samples, so a burst that starts
and finishes inside one scrape interval reads as a flat line forever: on 2026-09-17, 280
scanner 404s in one minute after a deploy drew nothing on any panel. Any series whose traffic
arrives in bursts shorter than the scrape interval (`sf_http_errors_total` for
`404/unversioned/unmatched`) must be seeded at zero at boot, and a level stat beside the rate
panel is the number that survives whatever the timing was.
