# `backend` — the sync API

A single-file Express + Mongoose API (`backend.ts`) backing the login, plan syncing and plan sharing features.

**It is optional for local development.** The planner works fine without it — you just lose accounts and syncing, and plans stay in `localStorage`.

Prerequisites (Node, pnpm) and the one-time workspace install are covered in the [root README](../README.md#local-development). There is no separate install step for this component, but you do need Docker running, for Mongo. **pnpm is mandatory**; see [why](../README.md#pnpm-is-the-mandatory-package-manager) before reaching for npm or yarn.

## Running

With Docker running, from the repository root:

```sh
pnpm dev:backend
```

That brings up the Mongo container and then starts the API with nodemon, on http://localhost:3001.

If you'd rather work from this directory, the two steps are separate scripts — `pnpm dev` on its own starts the API but *not* Mongo:

```sh
cd backend
pnpm db:up   # docker compose up -d --wait
pnpm dev
```

To tear the container back down, `pnpm db:down` from either the root or here.

`PORT` is respected if you need to move the API (`PORT=3011 pnpm dev:backend`), but note the frontend's dev API URL is hardcoded to 3001, so only do that when you aren't exercising save/load. See the [port allocation note](../README.md#ports) in the root README.

## Configuration

`.env` is committed with working local defaults, so there is nothing to create. Those credentials — including `JWT_SECRET` — are placeholders for local dev only; the real values live in the deployment environment.

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | Mongo connection string |
| `MONGO_INITDB_ROOT_USERNAME` / `MONGO_INITDB_ROOT_PASSWORD` | Credentials the Mongo container initialises with |
| `JWT_SECRET` | Signing secret for auth tokens |
| `ENVIRONMENT` | `dev` locally |

`docker-compose.yml` is the local Mongo container. `docker-compose-server.yml` and `docker-compose-packaged.yml` are the deployed variants — see the deployment docs before touching those.

## Routes

| Route | Notes |
| --- | --- |
| `POST /register`, `POST /login` | Account creation and JWT issuing |
| `POST /validate-token` | Token check |
| `POST /save`, `GET /load` | Authenticated plan sync |
| `POST /share`, `GET /share/:id` | Shareable plans, separately rate-limited |
| `GET /hello` | Liveness only — 200 whenever the process is up. It never touches Mongo, so don't monitor it |
| `GET /health` | The one to monitor. Pings Mongo and returns **503** if it doesn't answer inside 3s. Rate limited to 10 requests a minute, in its own bucket |

Mongoose models are in `models/`.

## Testing

There are no tests for the backend project currently.

## Deployment

Merges to `main` build a Docker image, publish it to Docker Hub, and a webhook pulls it onto the API box. See [docs/deployment.md](../docs/deployment.md) for the chain end to end — including how to tell whether a deploy actually landed, since a green Actions run does not prove it.

Note that two files on the server, its compose file and `update.sh`, are mirrored here but are **not** synced by any deploy; they have to be copied across by hand when they change.
