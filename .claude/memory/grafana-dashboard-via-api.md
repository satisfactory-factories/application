---
name: grafana-dashboard-via-api
description: "Edit the Planner Metrics Grafana dashboard by regenerating docs/grafana/generate.py and PUTting the v2 JSON from the Grafana box, never by hand-editing live JSON or driving the browser; where the token lives and the traps"
metadata: 
  node_type: memory
  type: project
  volatility: normal
  lastVerified: 2026-09-13
  originSessionId: f918c7e6-a8d3-4cdc-8406-cd3a9c367aad
  modified: 2026-09-11T23:35:10.521Z
---

**Dashboard edits go through the Grafana API, run on the Grafana box itself.** Driving the
Grafana UI through the in-app browser prompts for permission on every click (the port cannot
be allowlisted), so that route is out. The way that works:

1. **Ask for explicit permission to SSH to the Grafana host before the first connection.**
   Once given, that yes covers the whole task: go on the box freely and use the token below.
   The host is not the `sf` API box; ask which host if the session does not already know.
2. The service-account token is the file `~/claude-token` in root's home on that box
   (service account "Claude", Editor). **Never `cat` it into the conversation.** Use it in
   place: `T=$(tr -d "\n" < ~/claude-token); curl -H "Authorization: Bearer $T" http://localhost:3000/api/...`.
3. **`docs/grafana/generate.py` is the source of truth; edit that, never the live JSON.**
   Regenerate both files per its README, then `GET /apis/dashboard.grafana.app/v2/namespaces/default/dashboards/<name>`
   for the live `metadata.resourceVersion`, copy it into the generated `metadata`, `scp` the
   body to `/tmp` on the box and `PUT` it to the same URL with `--data-binary @file` (inline
   quoting through ssh breaks). The Editor token is enough for the PUT. Do `satisfactory-factories-metrics`
   and `-preview` both, each with its own resourceVersion.
4. Re-fetch and diff `spec.elements` and `spec.layout` against the generated file: with the
   generator they should be identical, key for key, and were on 2026-09-13.

**Why the generator rule matters:** by 2026-09-13 the live dashboard had drifted both ways.
Sessions on 09-11 had added panels and dropped one through the v1 API without folding it
back, and the share-links and collaboration rows the generator gained in the v0.7.0 merge
had never been applied live at all. Either way the next regeneration silently undoes or
re-does someone's work. Anything hand-tweaked in the UI has to land in `generate.py` in the
same session.

**Traps.** Panels reference the datasource as `{"uid":"prometheus"}`, which the frontend
resolves by name, but `POST /api/ds/query` needs the real uid from `GET /api/datasources`
(it was `ffp7m9lxm8jr4b`); "Data source not found" means this. Check a new metric has data
and which labels it carries before mirroring a sibling's `sum by (label)`: the per-room
totals have no `shared` label, so a copied `{{shared}}` legend renders blank. Prometheus is
reachable from the Grafana box, so validate every generated `expr` there first (the README
has the loop). A bargauge shows its `displayName` override, not `legendFormat`: "Biggest
Plans" kept showing ids after its legend said `{{name}}` because only the legend was changed.

**Why:** two sessions burned out on browser permission prompts before this; the API route
finished the same job with a verifiable diff. Keeping the token on the box means no session
ever holds it and nothing needs rotating afterwards.

**How to apply:** metric definitions live in `backend/src/metrics/metrics.service.ts`; a
panel that needs a label the exporter does not emit is a backend change first, and the
dashboard reads "No data" until that deploys. Related: [[backend-deploy-and-prod-drift]].
