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
         └─ POST https://hooks.mattcavanagh.me/hooks/satisfactory-factories
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

The whole thing exists so that shipping the API is not something only Mael's
laptop can do. It used to be `backend/publish.sh`, run by hand; that script is
still there as a break-glass path and says so at the top.

## Things that surprise you later

- **A green Actions run does not mean the deploy worked.** The webhook returns
  `200` as soon as it accepts the request — it does not wait for the SSH, and it
  does not report the script's exit code. The only honest confirmation is
  `/root/deploy.log` on the box.
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
- **The container listens on 3010, the host publishes 3001.** They are not the
  same number and never were after commit `618e944`. The compose file maps
  `3001:3010`.
- **Two files on the box are not version-controlled by any deploy.**
  `/root/docker/docker-compose.yml` and `/root/update.sh` are mirrored here as
  `backend/docker-compose-server.yml` and `backend/update.sh`, by hand. Changing
  the copy in this repo changes nothing on the box until someone copies it over.

## Verifying a deploy

```bash
ssh sf 'tail -20 /root/deploy.log'
```

A good deploy looks like:

```
2026-07-27 14:02:11 Deploy requested.
2026-07-27 14:02:11 Pulling backend image...
2026-07-27 14:02:19 Recreating backend container...
2026-07-27 14:02:34 Image updated: 75e43263865d -> a91c0f4be2d1
2026-07-27 14:02:34 Deployment finished!
```

`Image unchanged` instead of `Image updated` means the pull found nothing new —
usually the box is pulling a different tag from the one CI pushes.

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
| Actions green, nothing changed on the box | The webhook was accepted but the SSH failed, or the hook is not registered. Check `/root/deploy.log` on `sf`, then `app/config/logs/webhooks.log` on the webhooks box |
| `Image unchanged` in `deploy.log` after a real change | The box's `/root/docker/docker-compose.yml` still pulls the old `ghcr.io/...` tag. It is not version-controlled — edit it there |
| `403` from the webhook step | `WEBHOOK_SECRET` in this repo does not match the webhooks box's `webhook.env` |
| `404` from the webhook step | The `satisfactory-factories` hook is not loaded. On the webhooks box: `cd /root/webhooks && ./sync.sh` and check the hook list it prints |
| `DEPLOY FAILED` in `deploy.log` after `up --wait` | The new image starts but never turns healthy. `ssh sf 'docker logs sf-backend'` — most likely a bad `sf.env` or Mongo unreachable |
| Publish step fails on `pnpm install --frozen-lockfile` | `backend/pnpm-lock.yaml` is out of date with `backend/package.json`. Run `pnpm install` in `backend/` and commit the lockfile |
| Publish step fails with `ERR_PNPM_CATALOG_ENTRY_NOT_FOUND_FOR_SPEC` | Something changed the build context back to `backend/`. It must be the repo root with `-f backend/Dockerfile` |
| Container healthy, but the app 502s | The port mapping. The container listens on 3010; the host must publish `3001:3010` |

## Required configuration

Repository secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
| --- | --- |
| `DOCKERHUB_USERNAME` | `maelstromeous` |
| `DOCKERHUB_TOKEN` | Docker Hub access token with write scope on `maelstromeous/satisfactory-factories` |
| `WEBHOOK_URL` | `https://hooks.mattcavanagh.me/hooks/satisfactory-factories` |
| `WEBHOOK_SECRET` | The shared webhook HMAC secret |

> The webhook secret is **shared across every project** on that server. A repo
> that can trigger this deploy can trigger the others too.

On the box (`ssh sf`), one-off, and not done by any deploy:

- `/root/docker/docker-compose.yml` must match `backend/docker-compose-server.yml`
  — Docker Hub image, `3001:3010`, and the healthcheck that `up --wait` blocks on.
- `/root/update.sh` must match `backend/update.sh`, mode `755`.
- The webhooks box's deploy key must be in `/root/.ssh/authorized_keys`
  (fingerprint `SHA256:Y69lglv47Mp3dkMh9a/CL1u9PmYldx4u+NTDb0QiFDs`).
