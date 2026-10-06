---
name: plan-deletion-moves-db-metrics
description: "A cliff in synced factories or factories-per-plan is usually plan deletion, and a deleted plan leaves no trace to identify it afterwards"
metadata:
  node_type: memory
  type: project
  volatility: durable
  lastVerified: 2026-10-04
  originSessionId: 8b28c3c9-15e1-4d1a-b032-3398d532fbed
  modified: 2026-10-04T01:37:22.873Z
---

The database-backed gauges (`sf_room_factories_total`, `sf_rooms_total`, `sf_room_revisions`)
are sums over live rooms, recomputed every scrape. A restart or a client version gate cannot
move them. A sudden drop means rooms really lost content or left the live set.

- **Edits falling at the same moment is the tell for deletion.** Editing only ever raises
  `sf_room_revisions`, so a drop there means a room left. Since 2026-10-04 the dashboard
  reads `sf_edits_total` instead, a stored tally that only rises (seeded from live revisions
  on release), so check the raw `sf_room_revisions` series for this signal.
- **A deleted plan cannot be identified after the fact.** The tombstone is purged by the
  hourly sweeper along with the room's activity rows, and the API's console log dies with the
  container on every deploy. Only Prometheus history (`sf_room_factories` top-N labels,
  `sf_room_actions_total{action="deleted"}`) still names it.
- **The sweeper's orphan purge does not bump the `deleted` tally**, so a rise there means an
  owner deleted the plan through the API.

**Why:** on 2026-10-03 a 2.83K to 2.73K cliff was first blamed on the 0.7.3 protocol bump,
then on one user trimming a plan; the edits drop is what showed it was two deletions.

**How to apply:** read the metric's source in `backend/src/metrics/metrics.service.ts`
before theorising, and for any "where did it go" question pull the Prometheus series first.
