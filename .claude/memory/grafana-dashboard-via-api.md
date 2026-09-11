---
name: grafana-dashboard-via-api
description: "Edit the Planner Metrics Grafana dashboard through its HTTP API from the Grafana box, never by driving the browser; where the token lives and the traps"
metadata: 
  node_type: memory
  type: project
  volatility: normal
  lastVerified: 2026-09-12
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
3. `GET /api/dashboards/uid/satisfactory-factories-metrics` → edit the JSON locally with a
   script → `POST /api/dashboards/db` with `{"dashboard": ..., "overwrite": false, "message": "..."}`.
   Keep `version` as fetched so a concurrent UI save conflicts instead of being clobbered.
   `scp` the body to `/tmp` on the box and `-d @file`; inline quoting through ssh breaks.
4. Re-fetch and diff against the original before reporting: every untouched panel must be
   byte-identical apart from the `gridPos.y` shifts the new panel forced.

**Traps.** Panels reference the datasource as `{"uid":"prometheus"}`, which the frontend
resolves by name, but `POST /api/ds/query` needs the real uid from `GET /api/datasources`
(it was `ffp7m9lxm8jr4b`); "Data source not found" means this. Check a new metric has data
and which labels it carries before mirroring a sibling's `sum by (label)`: the per-room
totals have no `shared` label, so a copied `{{shared}}` legend renders blank. Rows are flat
in `panels[]` with rows as separators, so inserting a panel means bumping `y` on everything
below it by its height, exactly as the UI would.

**Why:** two sessions burned out on browser permission prompts before this; the API route
finished the same job with a verifiable diff. Keeping the token on the box means no session
ever holds it and nothing needs rotating afterwards.

**How to apply:** metric definitions live in `backend/src/metrics/metrics.service.ts`; a
panel that needs a label the exporter does not emit is a backend change first, and the
dashboard reads "No data" until that deploys. Related: [[backend-deploy-and-prod-drift]].
