# Planner usage metrics, round two

Extends the metrics module shipped in #627 with **permanent, server-derived** statistics.

The metrics in #627 answer "what is happening right now". Half come from the browser heartbeat
and expire 15 minutes after a tab closes, so a dashboard viewed at 3am reads zero. That is
correct and it is not what is wanted for questions about the service as a whole. Everything
below reads from Mongo, does not expire, and survives a restart.

> **Revision 3.** Reviewed twice by Codex, RETHINK both times.
>
> Revision 1's central mechanism, a persisted counter incremented "in the same transaction
> path" as a room op, was impossible: this backend has no transactions and Mongo runs
> standalone. Revision 2 removed it rather than working around it.
>
> Revision 2 then had two real bugs and a gap, all found by the second review and all fixed
> here: `$set` on `lastActiveAt` could move the timestamp **backwards**, the backfill did not
> filter to `kind: 'op'` so it contradicted its own definition of "active", and the dashboard
> generator was not in the repository at all. See the response table at the end.

## Tasks

- [ ] Expose `sf_room_revisions` as a **gauge** summing `Room.revision` over live rooms; no new writes anywhere
- [ ] Add `lastActiveAt: Date` and `editCount: number` to the `User` schema
- [ ] Record both in **one** update per accepted op, `$max` on the date and `$inc` on the count, in its own try/catch after commit
- [ ] Backfill `lastActiveAt` at boot from the newest `room_activity` row per actor **filtered to `kind: 'op'`**, using `$max`
- [ ] Add `sf_active_accounts{window}` for 1h, 24h, 7d, 14d, 30d as `countDocuments({ lastActiveAt: { $gt: now - w } })`
- [ ] Add `sf_room_factories{room_id,owner}`, top 20, deterministic tie-break, owner resolved to a username
- [ ] Add `sf_user_edits{username}` and `sf_user_factories{username}`, top 20, same tie-break and resolution
- [ ] Reset each top-N gauge before repopulating on a successful refresh, and leave it untouched on a failed one
- [ ] Split the metrics cache into a cheap group and an expensive group with separate TTLs, and add per-group in-flight coalescing
- [ ] Add an index on `{ lastActiveAt: -1 }`
- [ ] **Commit the dashboard generator and both dashboard JSON files to the repo**, so the applied dashboards can be regenerated, diffed and reviewed
- [ ] Rename the "Memberships" panel to "Plan Access" and add a "Collaborators" panel
- [ ] Relabel existing panels so heartbeat-derived and database-derived are visually distinct
- [ ] Add dashboard panels for cumulative edits, edits per 24h, active accounts, and the three top-20 tables
- [ ] Backend specs for every new gauge, the top-N cap and its tie-break, the deleted-user fallback, the backfill's op filter and idempotency, `$max` monotonicity, and the cache coalescing
- [ ] Update `backend/README.md`'s route table and state the host-port exposure honestly in `docs/deployment.md`

## What is being asked for

| # | Question | Answer |
| --- | --- | --- |
| 1 | How many factories are we monitoring | `sf_room_factories_total`, already shipped |
| 2 | How many plans are we monitoring | `sf_rooms_total`, already shipped |
| 3 | Biggest plans by factory count | `sf_room_factories{room_id,owner}` |
| 4 | Busiest users | `sf_user_edits{username}` |
| 5 | Users with most factories | `sf_user_factories{username}` |
| 6 | Active accounts, 24h/7d/14d/30d | `sf_active_accounts{window}` |
| 7 | Active within 1h, over time | `sf_active_accounts{window="1h"}` |
| 8 | "Memberships" means nothing | Rename to Plan Access, add Collaborators |
| 9 | Local tabs active, 15 min expiry | `sf_client_tabs{kind="local"}`, already shipped |
| 10 | Edits over time, 24h and cumulative | `sf_room_revisions` gauge |

## Edits (#10): a gauge, and no new writes

`Room.revision` already counts accepted edits exactly. Verified on preview: `sum(revision)` is
84 and `room_activity` holds 84 rows of `kind: 'op'`.

**Sum it at scrape time and expose it as a gauge.** No persisted counter, no seed, no marker,
no extra write on the op path. Findings 1, 2 and 10 of the review are not mitigated by this,
they are removed: there is nothing to be atomic about.

The cost is that the number **falls when a plan is deleted**, because that plan's edits leave
the sum. This is accepted and must be stated in the metric's help text. It is the honest
number: it is the edits that still exist.

The 24-hour figure uses a gauge-appropriate expression rather than `increase()`, which is only
valid on counters:

```promql
clamp_min(sf_room_revisions - (sf_room_revisions offset 24h), 0)
```

`clamp_min` because a deletion can make the difference negative, and "minus four edits
yesterday" is not a thing. A large deletion will show as a flat zero for a day; that is a
known and acceptable distortion, not a bug to chase.

Any window works by changing the offset. No timezone handling and no midnight reset job,
which was the original reason for preferring this over Albion Roads' `daily_*` gauges.

## Activity (#4, #6, #7): two fields on the user, not a new collection

The first draft proposed an hourly rollup collection. Codex was right that hourly buckets
cannot answer a **rolling** one-hour window, only a calendar one, and requirement 7 asks for a
rolling one.

Two fields on `User` instead, written in **one** update operation:

```js
users.updateOne({ _id: userId }, {
  $max: { lastActiveAt: at },   // never moves backwards
  $inc: { editCount: 1 },
})
```

`lastActiveAt` answers every window **exactly and with no boundary error**, because it stores
a timestamp rather than a bucket:

```
sf_active_accounts{window="24h"}  =  countDocuments({ lastActiveAt: { $gt: now - 24h } })
```

**`$max`, not `$set`.** `RoomOpService` queues one apply per *room*
(`enqueue(op.roomId, ...)`), so a single user editing two rooms at once has no global
ordering, and a post-commit write for the earlier op can reach Mongo after the later one.
`$set` would move the timestamp backwards. `$max` cannot, which also makes the write safe to
repeat and removes any need for a marker or reconciliation.

`editCount` is an `$inc`. Mongo's `$inc` is itself atomic, so concurrent increments do not
overwrite each other; the approximation comes from the post-commit attempt being allowed to
fail. **It is an approximate ranking, not an audit count**, and its help text says so. Nothing
else may be derived from it and it must never be presented as a total. When an exact figure is
wanted, `sum(Room.revision)` is exact for surviving plans.

The update goes after the room write commits, in **its own** `try/catch`, beside but not
inside the one guarding `activity.record`. Two independent attempts, so a failure of either
cannot skip the other, and neither can revoke an accepted edit.

**What "active" means, precisely:** an account that made an accepted room op in the window.
Signing in, creating a plan, renaming one and joining one are **not** ops and do not count.
The first draft called `window="1h"` "active sessions", which was wrong. There is no session
concept here; `sf_ws_connections` is the live-socket view and is a different question.

**Backfill.** Seed `lastActiveAt` from the newest `room_activity` row per actor
**`where kind === 'op'`**. The filter is essential and revision 2 omitted it: the collection
also holds `created`, `joined`, `renamed` and `deleted`, so without it a user who merely
joined a plan would be counted as having edited one, contradicting the definition above.

It runs **at boot**, and needs no marker or lock because it writes with the same `$max`. Running
it twice, or concurrently on two boots, cannot lower a value or double anything. That is the
whole reason `$max` is worth having beyond the ordering fix.

It is a partial bootstrap, not a reconstruction: `room_activity` is trimmed to 200 rows per
room (the trim keeps the newest, so the most recent op per actor usually survives) and is
deleted outright with hard-deleted rooms. `editCount` is **not** backfilled and starts at
zero. Both facts go in the metric help text, so an early low number is not read as a fall.

## Identified metrics (#3, #4, #5) and what the cap really bounds

These carry usernames and room ids. That is deliberate: the operator looking at data the
service already stores, in a different viewer, on an endpoint that is not publicly routable.

Top 20 by the measured value, computed in Mongo so the cap governs what is exported.

**The cap does not bound Prometheus cardinality, and the first draft was wrong to claim it
did.** It bounds what is exported *per scrape*. Prometheus keeps every series it has ever
seen for the full 90-day retention, so the real bound is:

> one series per user or room that has **ever** entered the top 20, for 90 days after it
> last did

At this service's size that is tens of series and a non-issue. It is written down because the
first draft's privacy claim, that "only the handful worth acting on ever leaves the database",
was false. Over 90 days it is everyone who ever ranks.

**Ties must break deterministically** (by `userId` or `roomId` after the measured value), or
equal-valued entries swap in and out between scrapes and mint series for no reason.

**Resolving owners:** `Room.createdBy` is a **user id**, not a username. One
`find({ _id: { $in: [...] } })` over the at most 20 ids resolves them. A user id that no longer
resolves is labelled `(deleted)` rather than dropped or allowed to fail the scrape, so a
deleted account cannot silently remove a large plan from the panel.

`docs/telemetry.md` describes what browsers **send**; usernames are not in the heartbeat and
will not be. It stays accurate as written and is not edited. Its "no usernames" line is about
the heartbeat and must not be removed.

## Keeping `/metrics` off the public internet

The first draft proposed an app-level private-address guard. Codex's objection stands and is
the most serious operational point in the review: the container sees the *tunnel* as its peer,
not the caller. If the tunnel's address is itself private, the guard passes public traffic
while appearing to block it. **A guard that fails open is worse than no guard**, because it
invites trust.

**The bearer token is the control.** Everything else is defence in depth, and the plan should
stop pretending otherwise. Revision 2 claimed moving the control to the tunnel made the
endpoint "not publicly routable"; the second review correctly pointed out that
`docker-compose-server.yml` publishes `3001:3001` and the preview file `3002:3002`, on all
host interfaces, so a tunnel path exclusion does not close the host port.

What is actually true, and what `docs/deployment.md` should say:

- The API box holds a **private address behind NAT with no port forward**, so the published
  ports are reachable from the LAN and not from the internet. That is a property of the
  network, not of anything in this repository, and it is not enforced by any code here.
- The **tunnel** is the only public route in, so excluding `/metrics` there removes the public
  path. Worth doing, still not a boundary on its own.
- The **token** is what holds if either of the above changes.

No app-level address guard is being built. The second review is right that with Docker
publishing the port and a tunnel in front, `remoteAddress` identifies the immediate peer
rather than the caller, and a guard that cannot tell them apart may fail open while looking
like protection. A measurement task remains, but nothing depends on its outcome.

## Cost and caching

Correcting the first draft: the current group is **four `countDocuments` plus one
aggregation**, not five counts. `sumRoomFactories()` is already a `$group` over all live
rooms.

Two groups with separate TTLs:

| Group | Contents | TTL |
| --- | --- | --- |
| cheap | room counts, user count, membership count, `sum(Room.revision)` | 15s |
| expensive | top-20 room factories, top-20 user edits, top-20 user factories, the five `sf_active_accounts` windows | 120s |

**In-flight coalescing is required, not optional.** The current `databaseCounts()` has no
lock, so two scrapes arriving on expiry both run the query. Hold the in-flight promise and let
the second caller await the first.

A stale group keeps its previous values and does not fail the scrape, matching the existing
`sf_metrics_database_up` behaviour. At a 30s scrape the expensive group is refreshed every
fourth scrape and repeats in between; that is intended, and the dashboard must not present
those values as sub-minute fresh.

`sf_active_accounts` needs an index on `{ lastActiveAt: -1 }`. The first draft's
`room_activity {at: -1}` index is **dropped**: with the rollup gone it had no consumer, except
the one-off backfill, which does not justify a permanent index.

## Testing

Mirroring `backend/test/metrics.spec.ts`, which already seeds rooms and asserts gauge values.

- Each new gauge against seeded data, including the empty case
- `sf_room_revisions` falls when a room is deleted, which is the documented behaviour
- The top-N cap holds beyond twenty entries, and ties break deterministically across two scrapes
- An entry leaving the top twenty stops being exported
- A room whose `createdBy` no longer resolves is labelled `(deleted)`
- `actor: 'anon'` never becomes a username label and never counts as an active account
- Each `sf_active_accounts` window counts only users inside it, tested on the boundary
- The backfill is idempotent and does not lower an existing `lastActiveAt`
- An op still succeeds when the metrics write throws
- Two concurrent scrapes on an expired cache issue one query, not two

## Risks

- **`editCount` is approximate by construction.** Accepted, and stated in its help text. If an
  exact edit total is ever needed, `sum(Room.revision)` is the exact figure for surviving plans.
- **`sf_room_revisions` falls on deletion.** Accepted; the 24h expression clamps at zero.
- **30-day windows are thin at first.** The backfill helps `lastActiveAt`; `editCount` genuinely
  starts at zero and needs weeks before rankings mean anything.
- **The tunnel exclusion is a manual infrastructure step**, so it is not enforced by anything in
  the repo. It goes at the top of the PR, and the bearer token is what holds if it is forgotten.
- **Two writes are added to the op path.** They sit inside the existing best-effort catch, so the
  failure mode is a lost metric rather than a lost edit, which is the same trade the activity
  log already makes.

## Review responses

**Round one** (revision 1 → 2):

| Finding | Response |
| --- | --- |
| 1. No transaction path exists | Persisted counter removed entirely; `sum(Room.revision)` needs no atomicity |
| 2. Seed races live edits | No seed exists any more |
| 3. Hourly buckets cannot do a rolling hour | Rollup replaced by a `lastActiveAt` timestamp, exact for any window |
| 4. No migration story | Backfill from `room_activity`, gaps stated in the help text |
| 5. Top-20 does not bound cardinality | Conceded; the real 90-day bound written down, false privacy claim removed |
| 6. `createdBy` is an id; "sessions" is wrong | Resolution and `(deleted)` fallback specified; "active" defined as an accepted op |
| 7. Guard may fail open | App-level guard dropped |
| 8. Cache underspecified | Two named groups with TTLs, coalescing required, "five counts" error corrected |
| 9. `{at:-1}` index orphaned | Dropped |
| 10. Post-commit write is the likely failure | No exactness claimed of `editCount` |

**Round two** (revision 2 → 3):

| Finding | Response |
| --- | --- |
| 1. Backfill did not filter to `kind: 'op'` | **Fixed.** Filter added; it contradicted the plan's own definition of active |
| 2. `$set` can move `lastActiveAt` backwards | **Fixed.** `$max`, which also makes the backfill inherently safe to repeat |
| 3. Dashboard generator is not in the repo | **Fixed.** Generator and both dashboard JSON files are now committed |
| 4. Post-commit sequencing; should be one update | **Fixed.** One `updateOne` in its own `try/catch`, separate from `activity.record` |
| 5. No reset rule for departed top-N entries | **Fixed.** Reset on successful refresh, leave untouched on a failed one |
| 6. Tunnel exclusion is not a complete boundary | **Conceded.** The token is named as the control; the port exposure is documented plainly |
| 7. Backfill has no executable lifecycle | **Fixed.** Runs at boot; `$max` means it needs no marker or lock |
| 8. `$inc` rationale was wrong | **Fixed.** `$inc` is atomic; the approximation is the best-effort attempt failing |

## Out of scope

Alerting rules, `collectDefaultMetrics`, and any change to the browser heartbeat or its
15-minute window.
