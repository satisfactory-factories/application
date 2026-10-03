# Deploying the backend

How a merge to `main` becomes a running API, what can go wrong, and how to tell
whether a deploy actually landed.

For the release philosophy across all three packages see
[how-do-we-release.md](./how-do-we-release.md). This document is about `backend/`:
the production API, and the [preview API](#the-preview-api) beside it. The web app
deploys itself via Vercel and needs none of this, beyond the one environment
variable that tells a preview build which API to talk to.

---

## The chain

```
 merge to main  (paths: backend/**, common/**, pnpm-workspace.yaml, package.json, .dockerignore)
   └─ Backend: Deploy  (.github/workflows/deploy-backend.yml)
      ├─ Checks          → build-backend.yml    lint-check + build + vitest
      ├─ Publish image   → publish-backend.yml  docker build -f backend/Dockerfile .
      │                                         → maelstromeous/satisfactory-factories
      │                                            :backend-latest
      │                                            :backend-<sha>
      └─ Deploy          → deploy-webhook.yml
         └─ POST <WEBHOOK_URL>   (the deploy hook; see repo secrets)
            X-Hub-Signature-256 = HMAC-SHA256(body, WEBHOOK_SECRET)
                     │
                     ▼
          webhooks box (10.0.5.3) — see github.com/Maelstromeous/webhooks
            └─ deploy.sh satisfactory-factories 10.0.5.5
               └─ ssh root@10.0.5.5 'bash /root/update.sh'
                        │
                        ▼
             API box `sf` (10.0.5.5), /root/docker
               docker compose pull backend
               docker compose up -d --wait backend     ← blocks on the healthcheck
```

The whole thing exists so that shipping the API is not tied to one laptop. It used to be `backend/publish.sh`, run by hand; that script is
still there as a break-glass path and says so at the top.

## Things that surprise you later

- **A green Actions run means the deploy worked.** Since 2026-07-28 the hook waits
  for the deploy and answers `200` or `500` carrying the script's own output, so the
  Deploy step's result *is* the deploy's result. It did not always — it used to answer
  `200` the moment it accepted the request, which is what the older advice further
  down is written against. `/root/deploy.log` is still where the reason lives.
- **A wrong `WEBHOOK_SECRET` does *not* fail silently.** Verified against
  `webhook` 2.8.2 on 2026-07-27: a signature computed with the wrong secret
  returns `500` (`invalid payload signatures`) and fails the Deploy step. `404`
  means the hook isn't loaded. `403` means no signature header was sent at all.
  `200` now means the script ran *and* exited `0`, with its output in the response
  body — it used to mean only that the request was accepted.
- **The image builds from the repo root, not from `backend/`.**
  `backend/package.json` pins `typescript` and the eslint packages with
  `catalog:`, and a catalog only resolves when pnpm can see
  `pnpm-workspace.yaml`. Building from `backend/` fails with
  `ERR_PNPM_CATALOG_ENTRY_NOT_FOUND_FOR_SPEC`. The API also compiles against the
  `common` workspace package, which the image builds first. `backend/Dockerfile`
  is written for a root context; the root `.dockerignore` keeps `web/`,
  `parsing/` and the three `node_modules` trees out of it.
- **The image runs compiled output, not `ts-node`.** `pnpm build` runs `common`'s
  build then `nest build`, and the container's command is `node dist/main.js`. Two
  consequences: a type error now fails the build instead of surfacing as a runtime
  crash on the box, and the container starts in milliseconds rather than
  compiling first. Dev dependencies are still installed in the image because the
  Nest CLI does the compiling, so `--prod` on the install still breaks it.
- **The API is on 3001, and that number is the same in every layer** — `src/main.ts`,
  `EXPOSE`, both compose files, the host port, and the Cloudflare tunnel's origin.
  Keep it that way. `618e944` moved the app to 3010 without moving anything else,
  and the only reason production survived is that it was still running an image
  from before that commit; the first rebuild would have published a container
  nothing upstream could reach. `PORT` can override the app's port for local work
  (web's vitest fixture also binds 3001, and `pnpm dev --port` sets it to move a
  local run off the default pair), but nothing deployed sets it.
- **The WebSocket gateway shares that same port and process.** Realtime sync is
  served at `/ws` on 3001 — no second port, no second container, no extra compose
  entry. What it does need is a tunnel that forwards the `Upgrade` header;
  a tunnel configured for plain HTTP answers the upgrade with a `400` and every
  synced tab silently falls back to nothing. Verify this once after the first v7
  deploy.
- **`GET /hello` no longer exists.** It duplicated `/health` and now 404s. Any
  probe still pointing at it — including a stale healthcheck in the box's own
  compose file — reports the container unhealthy, and `up -d --wait` turns that
  into a failed deploy.
- **Two files on the box are not version-controlled by any deploy.**
  `/root/docker/docker-compose.yml` and `/root/update.sh` are mirrored here as
  `backend/docker-compose-server.yml` and `backend/update.sh`, by hand. Changing
  the copy in this repo changes nothing on the box until someone copies it over.

## What was wrong with the old `update.sh`

The script on the box was three commands and two `echo`s:

```bash
set -euo pipefail
echo "$(date …) Webhook called!" >> /root/deploy.log
cd /root/docker
echo "$(date …) Updating container..." >> /root/deploy.log
docker compose pull backend && docker compose down backend && docker compose up backend -d
echo "$(date …) Container updated!" >> /root/deploy.log
```

It is worth going through this properly, because it is the **only** component in
the whole chain that is in a position to notice a failed deploy. GitHub reports
on the webhook POST, not the deploy. The webhook returns `200` before the SSH
happens. The webhooks server does not surface the remote exit code. So whatever
this script fails to write down is not recorded anywhere, by anything.

**1. It took the API offline on every single call, including the no-ops.**
`down backend && up backend -d` unconditionally destroys and recreates the
container. That cost roughly ten seconds of `502`s back when the app compiled on
boot — paid on every deploy, including the majority where the pull found nothing
new. The compiled image starts far faster, but the teardown is still needless
downtime. `up -d` on its own recreates only when the digest actually
changed, which makes a no-op deploy cost about a second and drop nothing.

Measured on the sibling albionroads box, which still ran the old script: two
deploys of the same commit, resolved image ID identical across both
(`sha256:339903be…`), and the container's `StartedAt` still moved from
`16:15:00Z` to `16:18:20Z`. It really does tear down and rebuild for nothing.

**2. It could not tell whether the container survived.** `docker compose up -d`
returns when the container has been *started*, not when the app is listening. A
container that boots and dies — bad `sf.env`, a missing `JWT_SECRET`, unreachable
Mongo — still exits `0`. Worse, with
`restart: always` the daemon keeps restarting it, so a crashlooping container and
a healthy one look the same from the outside. `up -d --wait` plus a healthcheck
turns "started" into "answering HTTP".

**3. `Container updated!` was printed unconditionally.** It said the same thing
whether the deploy shipped a new version, found nothing to do, or had been
pulling a tag that CI stopped publishing to months ago. That one line is
precisely what hid the GHCR/Docker Hub drift: the log claimed success every time
while the running image never changed. Logging the before/after image IDs makes
the difference visible, and "unchanged" now says out loud that a tag mismatch is
the likely cause.

**4. A failure left no trace — and could leave the API down.** Under `set -e` a
failed `pull` simply ended the script. `deploy.log`'s last line was
`Updating container...`, which reads exactly like a truncated success rather than
an error. And because the `&&` chain has `down` in the middle, the failure can
land *between* `down` and `up`: the API is now stopped, indefinitely, and the log
does not say so. An `ERR` trap that writes `DEPLOY FAILED (exit N) at line L` is
the difference between a five-second diagnosis and a confused hunt.

**5. The error text and the timeline were on different machines.** Only the
`echo`s were redirected to `deploy.log`; the compose commands' own stdout/stderr
went to the webhook daemon's log — on the webhooks box, not this one. So the
timestamps lived in one place and the reason lived in another. Everything now
goes through `tee` into the one file.

**6. Nothing serialised deploys.** The GitHub `concurrency` group only orders
runs within one repository. It cannot stop a workflow deploy colliding with
someone running `publish.sh` by hand, and two interleaved pull/recreate cycles
can leave the service stopped. There is now an `flock` around the whole thing.

**7. Images accumulated forever.** Every pull of a moving tag orphans the
previous image. The box had images going back 21 months. There is now a
best-effort `docker image prune` restricted to *dangling* images older than a
week, so tagged images — including the `backend-<sha>` tags a rollback needs, and
anything belonging to other stacks on the box — are never touched, and a failure
to tidy up cannot fail a deploy that already worked.

**8. And `set -euo pipefail` did not protect any of it.** This is the one that
makes the rest dangerous rather than merely untidy. `set -e` **does not fire for
a command on the left of `&&`** — only for the last command in the list. So in:

```bash
docker compose pull server && docker compose down server && docker compose up server -d
```

a failed `pull` skips `down` and `up`, does **not** exit the script, and
execution continues straight to `echo "Container updated!"`. Deploy reports
success, the webhook returns `200`, Actions goes green, and nothing was deployed.

Observed live on the sibling albionroads box on 2026-07-27, while its compose
file still referenced a Docker Hub repo that had been renamed out from under it:

```
server Error pull access denied for maelstromeous/albion-mapper,
       repository does not exist or may require 'docker login'
```

…followed, three seconds later, by `Container updated!` in `deploy.log` and a
green deploy. The containers were never touched — `StartedAt` was unchanged
thirteen hours later. Reproduce the shell behaviour in isolation with:

```bash
bash -c 'set -euo pipefail; false && echo B; echo "still here"'   # prints: still here
```

The rewrite avoids this by putting each command on its own line, so `set -e` and
the `ERR` trap actually apply, and by comparing the image ID before and after
rather than trusting that the commands ran.

The rewritten script also reports the container's health state explicitly, which
surfaces the case where the box's compose file has no healthcheck at all — in
that situation `--wait` quietly degrades to "is it running", and most of the
guarantee in point 2 is gone without anything saying so.

## The preview API

There is a second API on the same box, at
**https://api-preview.satisfactory-factories.app**, and **every Vercel preview
build points at it**. That is the whole reason it exists: before it, a preview
deployment talked to the live API, so any PR touching the backend — or touching
how the frontend talks to it — could only be tested by shipping it to production
first, and any preview could write to real accounts. See issue #189.

| | production | preview |
| --- | --- | --- |
| hostname | `api.satisfactory-factories.app` | `api-preview.satisfactory-factories.app` |
| port on the box | 3001 | 3002 |
| compose dir | `/root/docker` | `/root/docker-preview` |
| container | `sf-backend` | `sf-backend-preview` |
| image tag | `backend-latest` | `backend-preview` |
| database | `factory_planner` | `factory_planner_preview` |
| built from | `main`, on merge | whatever branch you point it at |
| repo mirror | `backend/docker-compose-server.yml` | `backend/docker-compose-preview.yml` |
| workflow | `deploy-backend.yml` | `deploy-backend-preview.yml` |
| hook | `satisfactory-factories` | `satisfactory-factories-preview` |

Everything else is shared, deliberately. It runs on the same box, behind the same
tunnel, through the same webhook server, and against the **same mongod** — just a
different database on it, so the data is separate without paying for a second
Mongo on a 2GB box. It also takes the same lock as a production deploy, so the two
can never interleave.

### Putting a branch on it

Two ways in, for two different moments:

- **Label the PR `deploy-preview-api`.** Every push to that PR then redeploys the
  preview API from its head commit. This is what you want while actively building
  against a backend change.
- **Run "Backend: Deploy Preview" from the Actions tab**, picking any branch. This
  is how you put it *back* on `main` when you are done.

**Nothing puts it back on its own.** Whatever was deployed last stays deployed,
indefinitely.

### The shared-instance trade

There is one preview API, and every preview points at it. So a branch that
changes the wire protocol breaks every *other* open preview for as long as it is
loaded. That is accepted rather than solved: almost all work here is frontend,
the backend changes maybe twice a year, and a container per PR is a great deal of
machinery to carry for that. If it does become a problem, the shape of the answer
is a container per PR on a wildcard hostname, which is what issue #189 originally
asked for.

Concretely: while PR #620 is loaded, other previews will fail against it, because
it gates every route on a protocol version header they do not send.

### How the frontend finds it

`VITE_API_URL` overrides everything in `web/src/config/config.ts`. Vercel sets it
on the **Preview** environment only; production leaves it unset and falls through
to the live API, and local dev falls through to `localhost:3001` as before. There
is no branch logic in the code — a build points wherever its environment says.

### CORS

A Vercel preview gets a fresh hostname per deployment, so there is no list to
enumerate. The preview API takes `CORS_EXTRA_ORIGINS` from its env file instead: a
comma-separated list where an entry may start with `*.` to match any subdomain.
It is unset in production, which leaves production's CORS exactly as it was.

The matcher parses the origin and compares hostnames rather than doing a string
suffix test, because `https://evil.com/#.vercel.app` ends in `.vercel.app` too.
See `backend/utils/cors.spec.ts`.

### Verifying it

```bash
curl -s https://api-preview.satisfactory-factories.app/health
# {"status":"ok","uptime":624,"database":{"status":"ok","state":"connected",...}}

ssh sf 'docker ps --format "{{.Names}}\t{{.Image}}\t{{.Status}}"'
# sf-backend-preview  maelstromeous/satisfactory-factories:backend-preview  Up 10 minutes (healthy)
```

`/root/deploy.log` on the box carries preview and production deploys interleaved;
the `Deploy requested` line names the compose directory the run was for.

### Things that will catch you here

- **The memory cap is load-bearing.** `mem_limit` is 768m. `main`'s API runs
  `ts-node backend.ts`, which compiles on boot; V8 sizes its heap from the cgroup
  limit, so at 512m it OOM-killed on every single start — exit 134, "Ineffective
  mark-compacts near heap limit", and a container that looks like it is merely
  restarting. Do not lower it to make room for something.
- **The preview Mongo URI needs `?authSource=admin` and production's does not.**
  The root user was created against production's database, so authenticating
  against a *different* database name fails with `AuthenticationFailed` unless the
  URI says where to authenticate. This is the first thing to check if preview
  reports `"database":{"state":"disconnected"}` while production is fine.
- **`/root/docker-preview/docker-compose.yml` is hand-mirrored**, exactly like
  production's, and nothing syncs it. Its mirror here is
  `backend/docker-compose-preview.yml`.
- **The preview JWT secret is its own**, generated on the box and never shared
  with production, so a token minted by preview is worthless against the live API.
- **Preview data is disposable.** Nothing backs up `factory_planner_preview`, and
  nothing prunes it either.

## Verifying a deploy

```bash
ssh sf 'tail -20 /root/deploy.log'
```

A good deploy looks like this (compose's own output is interleaved and trimmed
here):

```
2026-07-27 14:02:11 Deploy requested.
2026-07-27 14:02:11 Pulling backend image...
2026-07-27 14:02:11 Recreating backend if the image changed...
2026-07-27 14:02:18 Image updated: 75e43263865d -> a91c0f4be2d1
2026-07-27 14:02:18 Container state: healthy
2026-07-27 14:02:18 Deployment finished!
```

Three lines are worth reading carefully:

- **`Image updated: <old> -> <new>`** is the only real evidence a deploy landed.
  `Image unchanged` means the pull found nothing — if you expected a change, the
  box is pulling a different tag from the one CI pushes.
- **`Container state: healthy`** means `--wait` actually blocked on the
  healthcheck. If it says `NO HEALTHCHECK`, this box's compose file is missing
  the healthcheck block and the deploy only confirmed the container is *running*.
  The healthcheck probes `/health`, which pings Mongo — so `healthy` means the
  database answered too, and a deploy attempted while Mongo is down will fail
  here rather than going green.
- **`Deployment finished!`** is the last line of a successful run. If the log ends
  anywhere else, the deploy died — and a `DEPLOY FAILED (exit N) at line L` line
  should say where:

```
 Container sf-backend Waiting
container sf-backend is unhealthy
2026-07-27 14:05:02 DEPLOY FAILED (exit 1) at line 82.
2026-07-27 14:05:02   The API may be stopped. Check: docker compose -f /root/docker/docker-compose.yml ps backend
```

Then confirm the API itself:

```bash
curl -s https://api.satisfactory-factories.app/health
# {"status":"ok","uptime":142,"database":{"status":"ok","state":"connected","responseTime":3}}

ssh sf 'docker ps --format "{{.Names}}\t{{.Image}}\t{{.Status}}"'
# sf-backend  maelstromeous/satisfactory-factories:backend-latest  Up 2 minutes (healthy)
```

## Rolling back

Every deploy publishes a `backend-<sha>` tag alongside `backend-latest`, so a
rollback does not need a rebuild. On the box:

```bash
ssh sf
cd /root/docker
docker compose pull backend                     # make sure the tag is local
docker tag maelstromeous/satisfactory-factories:backend-<good-sha> \
           maelstromeous/satisfactory-factories:backend-latest
docker compose up -d --wait backend
```

Then fix forward on `main` — the next real deploy overwrites `backend-latest`
again, so a local retag is a stopgap, not a state anyone else can see.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Actions green, nothing changed on the box | Almost always a genuine no-op pull — `deploy.log` will say `Image unchanged`. A wrong `WEBHOOK_SECRET` and a failed SSH both fail the Deploy step now rather than hiding behind a `200` |
| `Image unchanged` in `deploy.log` after a real change | The box's `/root/docker/docker-compose.yml` still pulls the old `ghcr.io/...` tag. It is not version-controlled — edit it there |
| Deploy step fails with `500` | `WEBHOOK_SECRET` here does not match `webhook.env` on the webhooks box. The daemon logs `error evaluating hook: invalid payload signatures` |
| **Deploy step green but no entry in `deploy.log`** | Routine before 2026-07-28, when `200` came back before the SSH result was known. It should not happen now — if it does, check `app/config/logs/webhooks.log` on the webhooks box: `docker compose -f /root/webhooks/docker-compose.yml logs webhook` |
| `404` from the webhook step | The `satisfactory-factories` hook is not loaded. On the webhooks box: `cd /root/webhooks && ./sync.sh` and check the hook list it prints. `404` is the *only* HTTP status that reliably tells you something is wrong |
| `DEPLOY FAILED` in `deploy.log` after `up --wait` | The new image starts but never turns healthy. `ssh sf 'docker logs sf-backend'` — most likely a bad `sf.env` or Mongo unreachable |
| Publish step fails on `pnpm install --frozen-lockfile` | `backend/pnpm-lock.yaml` is out of date with `backend/package.json`. Run `pnpm install` in `backend/` and commit the lockfile |
| Publish step fails with `ERR_PNPM_CATALOG_ENTRY_NOT_FOUND_FOR_SPEC` | Something changed the build context back to `backend/`. It must be the repo root with `-f backend/Dockerfile` |
| Container healthy, but the app 502s | A port disagrees somewhere. It should be `3001` in `src/main.ts`, in `EXPOSE`, on both sides of the compose mapping, and as the tunnel's origin — check all four rather than adding a translation |
| Container never turns healthy, logs say `Missing required environment variable(s)` | Boot asserts `JWT_SECRET` and `MONGODB_URI` now instead of falling back to a default. Add the name to the box's env file |
| `/health` fine, but no tab ever syncs | The WebSocket upgrade is not getting through to `/ws` on 3001. `curl -i -H 'Connection: Upgrade' -H 'Upgrade: websocket'` against the public origin should answer `101`, not `400` |
| `Container state: NO HEALTHCHECK` in `deploy.log` | The box's compose file is missing the `healthcheck` block, so `up --wait` only confirmed the container is running. Copy it from `backend/docker-compose-server.yml` |
| `Another deploy has held the lock` | A deploy was already running (a workflow and a manual `publish.sh` colliding, most likely). Nothing is broken — re-run once it finishes |

## Required configuration

Repository secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
| --- | --- |
| `DOCKERHUB_USERNAME` | `maelstromeous` |
| `DOCKERHUB_TOKEN` | Docker Hub access token with write scope on `maelstromeous/satisfactory-factories` |
| `WEBHOOK_URL` | The deploy hook endpoint. This repo is public, so the URL is not written down here — it is in the private `Maelstromeous/webhooks` repo |
| `WEBHOOK_SECRET` | The shared webhook HMAC secret |

> The webhook secret is **shared across every project** on that server. A repo
> that can trigger this deploy can trigger the others too.

In Vercel (Settings -> Environment Variables), one-off:

| Variable | Environment | Value |
| --- | --- | --- |
| `VITE_API_URL` | **Preview** only | `https://api-preview.satisfactory-factories.app` |

Leave it unset for Production and Development. Unset means the build falls through
to the live API, which is the old behaviour and the thing the preview API exists to
stop — so if previews start writing to real accounts again, this variable is the
first place to look.

On the box (`ssh sf`), one-off, and not done by any deploy:

- `/root/docker/docker-compose.yml` must match `backend/docker-compose-server.yml`
  — the Docker Hub image and the healthcheck that `up --wait` blocks on. The
  existing `3001:3001` port line is already correct and needs no change.
  **The healthcheck moved from `/hello` to `/health`** and the box's copy has to
  be edited by hand. `/hello` now returns `404`, so a copy still probing it makes
  the container permanently unhealthy and fails the deploy at `up -d --wait`.
- **`JWT_SECRET` must be set in the env file before a v7 image is deployed.** Boot
  asserts it (and `MONGODB_URI`) and exits with
  `Missing required environment variable(s)` rather than falling back to a
  default, which is what the old code did — it signed tokens anyone could forge.
- **`METRICS_TOKEN` must be set in the env file before `/metrics` answers anything.**
  Unlike the two above it is optional and boot does *not* assert it: with the variable
  unset, `GET /metrics` returns **404**, which is deliberate so that a box nobody
  configured cannot serve an open metrics endpoint. Generate a long random value
  (`openssl rand -hex 32`), put it in the env file, and give the same value to the
  Prometheus scrape job as a bearer token. Nothing else reads it, so rotating it means
  editing those two places and restarting the container.

  **The token is the access control, and it is worth being honest about why.**
  `/metrics` carries usernames and plan ids in its top-20 gauges, so it is not a
  page to leave open. Two things people assume protect it and do not:

  - The compose files publish `3001:3001` (and `3002:3002` for preview) on **all**
    host interfaces. Excluding `/metrics` at the tunnel removes the public route but
    does not close the host port. Anything that can reach the box on the LAN can
    reach `/metrics`, and only the token stops it.
  - An application-level "private addresses only" check was considered and rejected.
    Behind Docker port publishing with a tunnel in front, the container sees the
    tunnel as its peer rather than the caller, so such a guard can pass public
    traffic while looking like it blocks it. A guard that fails open is worse than
    none, because it invites trust.

  What actually keeps it private today is that the box holds a private address behind
  NAT with no port forward, plus the token. The first of those is a property of the
  network and is not enforced by anything in this repository.
- The tunnel in front of the API must forward WebSocket upgrades to `/ws` on the
  same origin as the REST routes. Nothing in the repo can prove this; check it
  from the production origin after the first v7 deploy.
- `/root/update.sh` must match `backend/update.sh`, mode `755`.
- The webhooks box's deploy key must be in `/root/.ssh/authorized_keys`
  (fingerprint `SHA256:Y69lglv47Mp3dkMh9a/CL1u9PmYldx4u+NTDb0QiFDs`).
- For the preview API: `/root/docker-preview/docker-compose.yml` must match
  `backend/docker-compose-preview.yml`, and `/root/docker-preview/sf-preview.env`
  must exist beside it, mode 600. It carries the same Mongo credentials as
  production with `factory_planner_preview` as the database and
  `?authSource=admin` appended, its own generated `JWT_SECRET`, `PORT=3002`,
  `ENVIRONMENT=preview`, and `CORS_EXTRA_ORIGINS`. Give it **its own**
  `METRICS_TOKEN` as well, different from production's, or leave it unset and accept
  that preview `/metrics` answers 404.
- The `satisfactory-factories-preview` hook must be loaded on the webhooks box
  (`cd /root/webhooks && ./sync.sh`). It needs no new secret here: the preview
  hook's URL is derived from `WEBHOOK_URL` by swapping the last path segment, and
  the workflow refuses to run if that derivation stops reproducing the secret.
