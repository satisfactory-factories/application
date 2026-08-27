# `backend` — the sync API

A NestJS + Mongoose API backing login, plan syncing and plan sharing. Source lives in `src/`, one module per concern (`auth/`, `health/`, `legacy/`), with cross-cutting config in `src/config/` and the version gate in `src/common/`.

**It is optional for local development.** The planner works fine without it — you just lose accounts and syncing, and plans stay in `localStorage`.

Prerequisites (Node, pnpm) and the one-time workspace install are covered in the [root README](../README.md#local-development). There is no separate install step for this component, but you do need Docker running, for Mongo. **pnpm is mandatory**; see [why](../README.md#pnpm-is-the-mandatory-package-manager) before reaching for npm or yarn.

It depends on the `common` workspace package for the wire protocol, the canonical `Factory` types and the zod schemas. `pnpm build` compiles `common` first; a bare `nest build` will not.

## Running

With Docker running, from the repository root:

```sh
pnpm dev:backend
```

That brings up the Mongo container and then starts the API in watch mode, on http://localhost:3001.

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

`JWT_SECRET` and `MONGODB_URI` are **asserted at boot**: the process exits rather than starting without them. There is no longer a fallback signing secret.

`docker-compose.yml` is the local Mongo container. `docker-compose-server.yml` and `docker-compose-packaged.yml` are the deployed variants — see the deployment docs before touching those.

## Routes

Every route except `GET /health` and `GET /share/:id` requires an `X-App-Version` header matching the protocol version exported by `common`. A mismatch, or a missing header, gets **426** with a `{ code: 'version_mismatch', ... }` body, which is how pre-v7 clients are cut off.

| Route | Notes |
| --- | --- |
| `POST /register`, `POST /login` | Account creation and JWT issuing (HS256, `{ id, username }`, 30 days) |
| `POST /validate-token` | Token check |
| `POST /me/password` | Change password while logged in; verifies the current one first |
| `GET /share/:id` | Reads a shared plan and bumps its view counter. Read-only: v7 never writes this collection |
| `POST /save`, `GET /load` | **410 Gone.** Replaced by synced tabs |
| `GET /health` | The one to monitor. Pings Mongo and returns **503** if it doesn't answer inside 3s. Rate limited to 10 requests a minute, in its own bucket |

`GET /hello` is gone — it duplicated `/health` and nothing should have been monitoring it.

Everything else is rate limited to 200 requests per 5 minutes per client, in a single shared bucket that `/health` is exempt from.

Mongoose schemas sit beside the module that owns them (`src/auth/user.schema.ts`, `src/legacy/*.schema.ts`). Collection names are pinned explicitly, because the documents predate the rewrite.

## The realtime gateway

`ws://<host>/ws`, sharing the same HTTP server and port as the routes above. The message unions and `PROTOCOL_VERSION` come from `common`; `src/realtime/` implements them.

- **Handshake.** The Origin is checked at upgrade against the CORS allowlist (a missing Origin is a non-browser client and is allowed). The first message must be `hello {protocolVersion, token?}` within 5s. A version mismatch closes **4426**; a token that does not verify closes **4401**. A database failure during the handshake closes **1011** so the client retries — never 4401.
- **Join.** `join {roomId, lastRevision?, visitorToken?}` needs a membership, or the room shared with no password, or shared plus a visitor token whose `passwordVersion` is current. A tombstoned room is never joinable. The answer is a `snapshot`, or `up_to_date` when `lastRevision` already matches.
- **Ops.** One apply at a time per room. The op is truncated then schema-checked, access is re-verified, a repeated `opId` replays its original ack, and the write only lands at the exact `baseRevision`. Anything else gets `op_reject` with a fresh snapshot. Accepted ops broadcast `op_apply` to the room's other sockets and record an activity row.
- **Revocation.** Unsharing, rotating the invite password or deleting a room re-runs the access check for every socket in it and closes the ones that no longer qualify with **4403**.
- **Limits.** 25MB `maxPayload`, 60 upgrades a minute per client address, 120 messages per 10s per socket, and a 30s server ping/pong that terminates a socket which misses two sweeps.

## Testing

```sh
cd backend
pnpm exec vitest run
```

Vitest, supertest and `mongodb-memory-server`. One mongod is started for the whole run and each test app gets its own database on it; the binary is downloaded and cached on first use, so the first run on a fresh clone is slow.

## Deployment

Merges to `main` build a Docker image, publish it to Docker Hub, and a webhook pulls it onto the API box. The image now runs compiled `dist/` rather than `ts-node`. See [docs/deployment.md](../docs/deployment.md) for the chain end to end — including how to tell whether a deploy actually landed, since a green Actions run does not prove it.

Note that two files on the server, its compose file and `update.sh`, are mirrored here but are **not** synced by any deploy; they have to be copied across by hand when they change.
