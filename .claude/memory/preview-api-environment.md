---
name: preview-api-environment
description: "There is a second API for previews on the same box — one shared instance, port 3002, its own database; the traps are the memory cap, the Mongo authSource, and the fact that nothing puts it back on main"
metadata: 
  node_type: memory
  type: project
  volatility: normal
  lastVerified: 2026-08-31
  originSessionId: 4fbd7ea0-08a1-4d42-8ce2-3729f8ab8246
  modified: 2026-08-31T03:21:16.895Z
---

Since **2026-08-31** every Vercel preview points at a **preview API** at
`api-preview.satisfactory-factories.app` rather than the live one, closing issue #189.
It is a second compose stack on the same box as production, deliberately sharing almost
everything with it:

| | production | preview |
| --- | --- | --- |
| port / compose dir | 3001, `/root/docker` | 3002, `/root/docker-preview` |
| image tag | `backend-latest` | `backend-preview` |
| database | `factory_planner` | `factory_planner_preview`, **same mongod** |
| built from | `main` on merge | whatever branch was last pointed at it |

`docs/deployment.md` has the full description — read it rather than re-deriving. What is
worth carrying in advance:

- **There is exactly one preview API, and it is shared.** A branch that changes the wire
  protocol breaks every other open preview while it is loaded. That is a deliberate trade
  (backend changes are rare, a container per PR is a lot of machinery), not an oversight.
- **Nothing puts it back on `main`.** Whatever was deployed last stays deployed for good.
  Re-run "Backend: Deploy Preview" from the Actions tab against `main` when finished.
- **A branch gets on it by carrying the `deploy-preview-api` label**, which redeploys on
  every push to that PR, or by running the workflow by hand.

Three things that cost time to find, all verified on the box:

1. **The 768m `mem_limit` is load-bearing.** `main`'s API is `ts-node backend.ts`, which
   compiles on boot, and V8 sizes its heap from the cgroup limit — at 512m it OOM-killed on
   every start (exit 134, "Ineffective mark-compacts near heap limit") and merely looked
   like a restart loop. The box has 2GB total.
2. **Preview's Mongo URI needs `?authSource=admin`; production's does not.** The root user
   was created against production's database, so pointing at a different database name
   fails with `AuthenticationFailed` until the URI says where to authenticate. First thing
   to check if preview reports `"database":{"state":"disconnected"}` and production is fine.
3. **No second secret was needed.** The preview hook's URL is derived from `WEBHOOK_URL` by
   swapping its last path segment, and `deploy-webhook.yml` refuses to run if rebuilding the
   *production* hook's URL that way stops reproducing the secret exactly. So a malformed
   assumption fails loudly instead of POSTing somewhere unintended.

**Why:** the interesting part is what did **not** need building. The webhooks infrastructure
was already generic — `deploy.sh` takes the compose directory and service list as arguments,
and `update.sh` is piped over SSH rather than living on the box — so the entire server-side
addition was one hook entry, and the shared deploy lock serialises preview against production
for free. Anyone sizing up a second environment here should look at what those scripts already
take as parameters before writing anything. See [[backend-deploy-and-prod-drift]] for why the
box's copies of things are the ones that matter.

**How to apply:** the preview stack's compose file is hand-mirrored as
`backend/docker-compose-preview.yml` and synced by nothing, exactly like production's. Preview
data is disposable — nothing backs it up and nothing prunes it. `VITE_API_URL` in Vercel's
**Preview** environment is the single switch that decides where a preview build points; if
previews ever start writing to live accounts again, look there first.
