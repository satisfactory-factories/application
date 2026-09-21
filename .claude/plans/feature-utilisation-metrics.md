# Feature utilisation metrics

A "Feature Utilisation" row on the Planner Metrics dashboard: for each planner feature, how many
synced plans use it, how many of their factories use it, and the rate, now and over time. Plus a
count of searches that were actually used to jump somewhere.

Cloud plans only, decided 2026-09-13. Local plans are invisible to the server and stay that way:
nothing is added to the anonymous heartbeat, and the privacy wording in `docs/telemetry.md` is
untouched. The 110-odd synced plans are the sample of the people who use the planner most, and
the rates over them are exact for that population. Aggregate only, never per plan.

## Tasks

- Add a pure `featureUsage(tab)` function in `common` that says, for one plan, which features
  it uses and how many of its factories use each. Defensive against malformed factories, since
  `Room.factories` is Mixed and old documents are not schema-checked.
- Sum it over live rooms in the metrics slow loader, over a lean projection of the fields it
  needs, in Node rather than in a Mongo pipeline.
- Export `sf_room_feature_plans{feature}` and `sf_room_feature_factories{feature}`, every
  feature label seeded at zero from the enum.
- Add `USAGE_ACTIONS` to `common` with `search_jump`, and an optional `usage` list on the
  `POST /events` report; `events` becomes optional too, with at least one of the two required.
- Export `sf_usage_total{action}` from `EventCountersService`, seeded at zero.
- Give the events store a second buffer for usage, flushed on the same tick and cleared on the
  same acknowledgement rules; count `search_jump` when a search result is activated.
- Retitle "Plans Ever Created" to "Plans Created From Scratch" and show adopted and imported
  beside it, so the three account for the synced-plan total.
- Add the Feature Utilisation row to `docs/grafana/generate.py`, regenerate, apply both
  dashboards after the API deploys.
- Update `docs/telemetry.md` for the usage list and both allowed-field specs.

## Which features, and what counts as "using" it

Every one is derivable from the plan as stored. Nothing new is written on edit.

| Feature | A factory uses it when | A plan uses it when |
| --- | --- | --- |
| AWESOME Sink | any `partDisposal[*].sinks > 0` | any factory does |
| Dimensional Depot | any `partDisposal[*].depots > 0` | any factory does |
| Power target | n/a | `powerTarget > 0` on the room |
| Groups | `group` is set | `groups` is non-empty |
| Checklist | `checklistEnabled` | any factory does |
| Notes | `notes` is non-blank after trimming | any factory does |
| Tasks | `tasks` is non-empty | any factory does |
| Somersloops | any building group, under a product or a power producer, with `somersloops > 0` | any factory does |
| Overclocking | any building group, under a product or a power producer, with `overclockPercent` a finite number other than 100 | any factory does |
| Custom buildings | `customBuildings` is non-empty | any factory does |
| Power producers | `powerProducers` is non-empty | any factory does |

Missing, null or wrong-typed fields read as "not used". A factory that is not an object is
skipped. One bad room must never fail the reload.

Rates on the dashboard are `sf_room_feature_plans / sf_rooms_total` and
`sf_room_feature_factories / sf_room_factories_total`, both already exported.

## Search

Counted when a result is activated, not when the query changes: a jump is somebody who found what
they wanted. Buffered in the events store beside the fault buffer and flushed on the same minute
tick; the report carries `usage: [{ action, count }]` with the action from a closed enum, so a
client cannot invent a label. Unauthenticated and indicative, like every client counter, and the
panel says so.

## Out of scope

Feature usage from local plans; per-plan rankings; anything that needs a new write on the edit
path.
