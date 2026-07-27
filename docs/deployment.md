# Deploying the backend

How a merge to `main` becomes a running API, what can go wrong, and how to tell
whether a deploy actually landed.

For the release philosophy across all three packages see
[how-do-we-release.md](./how-do-we-release.md). This document is only about
`backend/`. The web app deploys itself via Vercel and needs none of this.

---

## The chain

```
 merge to main  (paths: backend/**, pnpm-workspace.yaml, package.json, .dockerignore)
   └─ Backend: Deploy  (.github/workflows/deploy-backend.yml)
      ├─ Checks          → build-backend.yml    lint-check + tsc
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

- **A green Actions run does not mean the deploy worked.** The webhook returns
  `200` as soon as it accepts the request — it does not wait for the SSH, and it
  does not report the script's exit code. The only honest confirmation is
  `/root/deploy.log` on the box.
- **A wrong `WEBHOOK_SECRET` does *not* fail silently.** Verified against
  `webhook` 2.8.2 on 2026-07-27: a signature computed with the wrong secret
  returns `500` (`invalid payload signatures`) and fails the Deploy step. `404`
  means the hook isn't loaded. `403` means no signature header was sent at all.
  Only `200` is ambiguous — and it is ambiguous in exactly one direction: the
  command ran, but nothing reports whether it *worked*.
- **The image builds from the repo root, not from `backend/`.**
  `backend/package.json` pins `ts-node`, `typescript` and the eslint packages
  with `catalog:`, and a catalog only resolves when pnpm can see
  `pnpm-workspace.yaml`. Building from `backend/` fails with
  `ERR_PNPM_CATALOG_ENTRY_NOT_FOUND_FOR_SPEC`. `backend/Dockerfile` is written
  for a root context; the root `.dockerignore` keeps `web/`, `parsing/` and the
  three `node_modules` trees out of it.
- **`ts-node` is a runtime dependency in all but name.** `pnpm start` is
  `ts-node backend.ts`, so the image deliberately installs dev dependencies. Do
  not add `--prod` to the install, and do not set `NODE_ENV=production` before
  it, or the container will start and immediately die.
- **The API is on 3001, and that number is the same in every layer** — `backend.ts`,
  `EXPOSE`, both compose files, the host port, and the Cloudflare tunnel's origin.
  Keep it that way. `618e944` moved the app to 3010 without moving anything else,
  and the only reason production survived is that it was still running an image
  from before that commit; the first rebuild would have published a container
  nothing upstream could reach. `PORT` can override the app's port for local work
  (web's vitest fixture also binds 3001), but nothing deployed sets it.
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
container. Under `ts-node` the app compiles on boot, so that is roughly ten
seconds of `502`s — paid on every deploy, including the majority where the pull
found nothing new. `up -d` on its own recreates only when the digest actually
changed, which makes a no-op deploy cost about a second and drop nothing.

**2. It could not tell whether the container survived.** `docker compose up -d`
returns when the container has been *started*, not when the app is listening. A
container that boots and dies — bad `sf.env`, unreachable Mongo, a TypeScript
error that only `ts-node` hits at runtime — still exits `0`. Worse, with
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

The rewritten script also reports the container's health state explicitly, which
surfaces the case where the box's compose file has no healthcheck at all — in
that situation `--wait` quietly degrades to "is it running", and most of the
guarantee in point 2 is gone without anything saying so.

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
curl -s https://api.satisfactory-factories.app/hello
# {"message":"Hello, the server is running!"}

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
| Actions green, nothing changed on the box | Three different causes, and **the webhook returns `200` for all of them**: a wrong `WEBHOOK_SECRET`, a failed SSH, or a no-op pull. Work down `/root/deploy.log` on `sf` first — if it has no new entry at all, the hook never ran the script, so suspect the secret. Then `app/config/logs/webhooks.log` on the webhooks box |
| `Image unchanged` in `deploy.log` after a real change | The box's `/root/docker/docker-compose.yml` still pulls the old `ghcr.io/...` tag. It is not version-controlled — edit it there |
| Deploy step fails with `500` | `WEBHOOK_SECRET` here does not match `webhook.env` on the webhooks box. The daemon logs `error evaluating hook: invalid payload signatures` |
| **Deploy step green but no entry in `deploy.log`** | The hook ran `deploy.sh` but the SSH failed — `200` is returned before the SSH result is known. Check `app/config/logs/webhooks.log` on the webhooks box: `docker compose -f /root/webhooks/docker-compose.yml logs webhook` |
| `404` from the webhook step | The `satisfactory-factories` hook is not loaded. On the webhooks box: `cd /root/webhooks && ./sync.sh` and check the hook list it prints. `404` is the *only* HTTP status that reliably tells you something is wrong |
| `DEPLOY FAILED` in `deploy.log` after `up --wait` | The new image starts but never turns healthy. `ssh sf 'docker logs sf-backend'` — most likely a bad `sf.env` or Mongo unreachable |
| Publish step fails on `pnpm install --frozen-lockfile` | `backend/pnpm-lock.yaml` is out of date with `backend/package.json`. Run `pnpm install` in `backend/` and commit the lockfile |
| Publish step fails with `ERR_PNPM_CATALOG_ENTRY_NOT_FOUND_FOR_SPEC` | Something changed the build context back to `backend/`. It must be the repo root with `-f backend/Dockerfile` |
| Container healthy, but the app 502s | A port disagrees somewhere. It should be `3001` in `backend.ts`, in `EXPOSE`, on both sides of the compose mapping, and as the tunnel's origin — check all four rather than adding a translation |
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

On the box (`ssh sf`), one-off, and not done by any deploy:

- `/root/docker/docker-compose.yml` must match `backend/docker-compose-server.yml`
  — the Docker Hub image and the healthcheck that `up --wait` blocks on. The
  existing `3001:3001` port line is already correct and needs no change.
- `/root/update.sh` must match `backend/update.sh`, mode `755`.
- The webhooks box's deploy key must be in `/root/.ssh/authorized_keys`
  (fingerprint `SHA256:Y69lglv47Mp3dkMh9a/CL1u9PmYldx4u+NTDb0QiFDs`).
