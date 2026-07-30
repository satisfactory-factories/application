# Satisfactory Factories
This [web tool](https://satisfactory-factories.app/) is designed to help players of the video game Satisfactory&trade; to plan a comprehensive production chain.

The tool highlights bottlenecks in the production chain, and visually tells the player that they have a problem within their designs.

The player can scale up end product factories as they see fit, and check if their production chain can handle the increased load.

## Contributing
Since this is an open source project, all PR requests will be welcomed, as long as proper intent and communication with the project maintainers is maintained.

Please read [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) before you start — in particular, work should have an issue attached to it before you open a PR.

___
## Local Development
This project has the following requirements. We highly recommend you use `nvm` to manage your node and p(npm) versions.
- Node.js version >=24 — `nvm use` in the repo root picks up the version pinned in `.nvmrc`, or `nvm install 24 && nvm use 24`
  - You may want to make 24 the default version with `nvm alias default 24`
- pnpm version >=11.3 `npm install -g pnpm` (or `corepack enable`, which honours the `packageManager` field in `package.json`)
- Docker (for the backend) [Docker install docs](https://docs.docker.com/engine/install/)

### Quick start
The `web`, `backend`, and `parsing` packages are managed as a [pnpm workspace](https://pnpm.io/workspaces). A single `pnpm install` from the repository root installs the dependencies for all three, so you never need to `cd` into a package to set it up.

```sh
pnpm install   # installs web + backend + parsing
pnpm dev       # starts Mongo (Docker), then the backend + frontend together
```

`pnpm dev` runs the frontend on http://localhost:3000 and the backend on http://localhost:3001 in parallel (their logs are interleaved in the one terminal). The backend requires Docker to be running. `backend/.env` is committed with working local defaults, so there is nothing to create — just be aware those credentials are for local dev only.

If you only want to work on the planner — which is most of the time — `pnpm dev:web` is enough and needs no Docker.

### The packages

| Package | What it is | Docs |
| --- | --- | --- |
| `web` | The Vue 3 + Vuetify planner SPA, and the calculation engine behind it | [web/README.md](web/README.md) |
| `backend` | Express + Mongoose API for login, plan syncing and sharing. Optional locally | [backend/README.md](backend/README.md) |
| `parsing` | CLI that converts the game's `Docs.json` into the `gameData.json` the frontend consumes | [parsing/README.md](parsing/README.md) |

Each package README covers running it, its tests, and anything specific to it. The rest of this section is the parts that apply across all three.

### Root scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Bring up the Mongo container, then run the backend + frontend dev servers in parallel |
| `pnpm dev:web` | Run only the frontend dev server |
| `pnpm dev:backend` | Bring up Mongo, then run only the backend dev server |
| `pnpm dev:parsing` | Run the parser |
| `pnpm db:up` / `pnpm db:down` | Start / stop the Mongo container on its own |
| `pnpm build` | Build every package |
| `pnpm lint` / `pnpm lint-check` | Lint (fix) / lint (check only) every package |
| `pnpm test` | Run every package's test suite |

### Dependencies and the lockfile
There is a **single** `pnpm-lock.yaml`, at the repository root, covering all three packages (`sharedWorkspaceLockfile: true` in `pnpm-workspace.yaml` — it must stay `true`, see the comment there for why). Versions that are shared across packages are pinned once in the `catalog:` block of `pnpm-workspace.yaml` and referenced from each `package.json` as `"typescript": "catalog:"`; bump them in the catalog, not in the individual packages.

You can still run commands from inside a single package if you prefer — `cd web && pnpm dev` works fine. What you don't need is a per-package `pnpm install`: the root install has already put `node_modules` in place for all three. If you do want to install just one package's dependencies, use `pnpm install --filter web` from anywhere in the workspace rather than `cd`-ing in.

### Ports
**The port allocation is 3000 for the web app and 3001 for the API, everywhere** — local dev, the container, the host, and behind the tunnel. Treat those two as fixed; anything else that wants a port should move rather than pushing the API off 3001.

> One known overlap: `web/testing/global-setup.ts` serves the test `gameData.json` on 3001 too, and it *silently skips startup* if the port is taken — so running `pnpm test` in `web/` while the backend is up makes the suite fetch game data from the API, get a 404, and fail confusingly. It is rare enough to live with: stop the backend first, or start it elsewhere with `PORT=3011 pnpm dev:backend` (the frontend's dev API URL is hardcoded to 3001, so only do that when you're not exercising save/load). If it does start to bite, move **the test fixture** to a port of its own — say 3005 — rather than moving the API.

### Deployment
New versions are trunked to `main` branch. Once `main` has been pushed, GitHub Actions will create a release then deploy the frontend to Vercel, and build a docker image of the backend which is published to Docker Hub and pulled onto my personal server automatically.

See [docs/deployment.md](docs/deployment.md) for the backend chain end to end — including how to tell whether a deploy actually landed, since a green Actions run does not prove it.

### Further reading
- [docs/architecture/](docs/architecture/README.md) — how the app is put together, the calculation engine, and the frontend data flow
- [docs/conventions.md](docs/conventions.md) — commit and code conventions
- [docs/how-do-we-release.md](docs/how-do-we-release.md) and [docs/versioning.md](docs/versioning.md) — the release and versioning strategy
___

## License
This project is licensed under the GNU Affero General Public License v3.0 or later (`AGPL-3.0-or-later`) - see the [LICENSE](LICENSE) file for details.

Please kindly consider opening PRs to improve the project, and make it better for everyone rather than making a clone.

## Acknowledgements
- Many thanks to [Greeny (creator of Satisfactory Tools)](https://github.com/greeny/SatisfactoryTools) for collating all the game assets required to display the various icons for items and buildings.
- Thanks to the author of [Satisfactory Logistics](https://satisfactory-logistics.xyz), who gave me the inspiration to extend what they did but even further.
