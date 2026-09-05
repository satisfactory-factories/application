# Grafana dashboards

The two dashboards that read `GET /metrics`, and the script that generates them.

| File | What it is |
| --- | --- |
| `generate.py` | The source of truth. Everything else here is output. |
| `satisfactory-factories.json` | Production, every query pinned to `job="satisfactory-factories"` |
| `satisfactory-factories-preview.json` | Preview, pinned to `job="satisfactory-factories-preview"` |

## Why a generator rather than hand-edited JSON

The dashboards are 70 panels each and identical apart from one label matcher. Keeping two
hand-written copies in step would not survive contact with a single edit.

More importantly, **production and preview export the same metric names**. An unfiltered query
silently adds the two environments together and nobody notices, because the answer looks
plausible. Every query the generator emits is pinned to one job, which is the only reliable way
to keep that from happening.

## Regenerating

```sh
cd docs/grafana
python3 generate.py satisfactory-factories "" satisfactory-factories-metrics > satisfactory-factories.json
python3 generate.py satisfactory-factories-preview " (Preview)" satisfactory-factories-metrics-preview > satisfactory-factories-preview.json
```

The three arguments are the Prometheus job name, a suffix for the dashboard title, and the
Grafana resource name. Nothing else differs between the two.

## Applying

Import through the Grafana UI, or POST to the schema-v2 API:

```sh
curl -X POST \
  -H "Authorization: Bearer $GRAFANA_TOKEN" \
  -H 'Content-Type: application/json' \
  --data-binary @satisfactory-factories.json \
  "$GRAFANA_URL/apis/dashboard.grafana.app/v2/namespaces/default/dashboards"
```

Updating an existing one is a `PUT` to `.../dashboards/<metadata.name>`, and the body must
carry the current `metadata.resourceVersion` or the API rejects it as a conflict. The service
account needs Admin: an Editor can create a dashboard at the top level and then gets 403
reading it back.

These are **not** provisioned from disk, deliberately. A provisioned dashboard is read-only in
the UI, and the whole point of publishing the JSON is that panels can still be tweaked by hand.
If you do tweak one, export it and fold the change back into `generate.py`, or the next
regeneration will quietly undo it.

## Reading the dashboards

Row titles say where the numbers come from, because the two sources behave completely
differently and nothing on a panel reveals which it is:

- **"from browsers"** is the anonymous heartbeat. It expires 15 minutes after a tab closes, so
  these panels read zero overnight and after a restart. That is correct, not a fault. Local
  plans and signed-out visitors appear nowhere else.
- **"from the database"** is permanent. It survives restarts and answers questions about the
  service rather than about this minute.

Two panels are worth knowing the shape of:

- **Edits** come from `sf_room_revisions`, a sum of `Room.revision` over live plans. It is a
  gauge, so it *falls* when a plan is deleted. The 24-hour panel is therefore an offset
  difference clamped at zero, not `increase()`, which is only valid on counters.
- **Busiest Accounts** is approximate. The count is written after an edit commits and is
  allowed to fail, because no metric may cost somebody their edit. Use it for ranking and
  nothing else; `sf_room_revisions` is the exact figure.

## Checking a change before applying it

Every expression can be validated against Prometheus without touching Grafana:

```sh
python3 -c "
import json,sys
d=json.load(open('satisfactory-factories-preview.json'))
for e in d['spec']['elements'].values():
    for q in e['spec']['data']['spec']['queries']:
        print(q['spec']['query']['spec']['expr'])
" | while read -r q; do
  curl -sG --data-urlencode "query=$q" "$PROM_URL/api/v1/query" -o /dev/null -w "%{http_code} $q\n"
done
```

Anything that is not `200` is a syntax error that would have shown up as a silently empty
panel.
