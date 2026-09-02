# Satisfactory Factories
This [web tool](https://satisfactory-factories.app/) is designed to help players of the video game Satisfactory&trade; to plan a comprehensive production chain.

The tool highlights bottlenecks in the production chain, and visually tells the player that they have a problem within their designs.

The player can scale up end product factories as they see fit, and check if their production chain can handle the increased load.

## Components
The repository is a [pnpm workspace](https://pnpm.io/workspaces) containing three components:

| Component | What it does | Docs |
| --- | --- | --- |
| [`web`](web) | The Vue 3 + Vuetify single-page app players actually use, containing both the planner UI and the calculation engine that resolves production chains, links factories together and flags bottlenecks. | [web/README.md](web/README.md) |
| [`backend`](backend) | An Express + Mongoose API providing user accounts, plan syncing across devices and shareable plan links — entirely optional for local development. | [backend/README.md](backend/README.md) |
| [`parsing`](parsing) | A CLI that converts the game's own enormous `Docs.json` into the trimmed `gameData.json` of recipes, items and buildings that the frontend downloads. | [parsing/README.md](parsing/README.md) |

Each component's README covers running it, its tests, and anything else specific to it. This README covers what applies across all three.

## Contributing
Since this is an open source project, all PR requests will be welcomed, as long as proper intent and communication with the project maintainers is maintained.

Please read [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) before you start — in particular, work should have an issue attached to it before you open a PR.

___
## Local Development
This project has the following requirements. We highly recommend you use `nvm` to manage your Node.js version.
- Node.js version >=24 — `nvm use` in the repo root picks up the version pinned in `.nvmrc`, or `nvm install 24 && nvm use 24`
  - You may want to make 24 the default version with `nvm alias default 24`
- pnpm version >=11.3 — `corepack enable` is the recommended way to get it, as that activates the exact version pinned by the `packageManager` field in `package.json` (this is what CI does). `npm install -g pnpm` also works, but installs whatever the latest release happens to be.
- Docker (for the backend) [Docker install docs](https://docs.docker.com/engine/install/)

### pnpm is the mandatory package manager
**Use `pnpm`. Not npm, not yarn, not bun.** This is not a preference — the repository is a pnpm workspace, and the other package managers do not understand `pnpm-workspace.yaml`, the `catalog:` version pins, or the single shared lockfile. Running them here produces a broken install and a lockfile that does not describe what this project builds with.

Concretely:
- **Never commit a `package-lock.json`, `yarn.lock` or `bun.lockb`.** Any PR containing one will be rejected — remove the file and re-run `pnpm install` before pushing.
- `pnpm-lock.yaml` at the repository root is the only lockfile in the project. Commit it whenever your change touches dependencies.
- CI runs `pnpm install` with `CI=true`, which means pnpm's frozen-lockfile behaviour applies: if `pnpm-lock.yaml` is out of step with any `package.json`, the build fails before it reaches lint or tests.

### Quick start
A single `pnpm install` from the repository root installs the dependencies for all three components, so you never need to `cd` into one to set it up.

```sh
pnpm install   # installs web + backend + parsing
pnpm dev       # starts Mongo (Docker), then the backend + frontend together
```

`pnpm dev` runs the frontend on http://localhost:3000 and the backend on http://localhost:3001 in parallel (their logs are interleaved in the one terminal). If something else on your machine already has those, `pnpm dev --port 3100,3101` moves both for that run; see [Ports](#ports). The backend requires Docker to be running. `backend/.env` is committed with working local defaults, so there is nothing to create — just be aware those credentials are for local dev only.

If you only want to work on the planner — which is most of the time — `pnpm dev:web` is enough and needs no Docker.

For anything specific to a single component, see its own README — linked from the [Components](#components) table above.

### Root scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Bring up the Mongo container, then run the backend + frontend dev servers in parallel |
| `pnpm dev [--port <web>[,<api>]]` | The same, on ports of your choosing instead of 3000/3001 |
| `pnpm dev:web` | Run only the frontend dev server |
| `pnpm dev:backend` | Bring up Mongo, then run only the backend dev server |
| `pnpm dev:parsing` | Run the parser |
| `pnpm db:up` / `pnpm db:down` | Start / stop the Mongo container on its own |
| `pnpm build` | Build every package |
| `pnpm lint` / `pnpm lint-check` | Lint (fix) / lint (check only) every package |
| `pnpm test` | Run every package's test suite |

### Dependencies and the lockfile
The reason there is only one lockfile is `sharedWorkspaceLockfile: true` in `pnpm-workspace.yaml` — it must stay `true`, see the comment there for why. Versions that are shared across components are pinned once in the `catalog:` block of the same file and referenced from each `package.json` as `"typescript": "catalog:"`; bump them in the catalog, not in the individual `package.json` files.

You can still run commands from inside a single package if you prefer — `cd web && pnpm dev` works fine. What you don't need is a per-package `pnpm install`: the root install has already put `node_modules` in place for all three. If you do want to install just one package's dependencies, use `pnpm install --filter web` from anywhere in the workspace rather than `cd`-ing in.

### Ports
**Everywhere the app is deployed, the allocation is 3000 for the web app and 3001 for the API, and those two are fixed.** That covers the container, the `EXPOSE`, both sides of every compose mapping, the host port, and the tunnel's origin. Anything else that wants a port should move rather than pushing the API off 3001, and moving one layer means moving all of them: `618e944` put the app on 3010 and left everything else at 3001, which produced a container nothing upstream could reach.

Local dev is the one exception, and only because a dev server has nothing upstream of it. `pnpm dev` still defaults to 3000/3001, and `--port` moves both for one run:

```sh
pnpm dev                     # 3000 + 3001, as before
pnpm dev --port 3100,3101    # web on 3100, API on 3101
pnpm dev --port 3100         # web on 3100, API left on 3001
pnpm dev:web --port 3100     # same flag on the single-server scripts
```

`WEB_PORT` and `API_PORT` do the same job as environment variables, and the flag wins over them. Under the hood `scripts/dev.mjs` also has to tell each half where the other went: the web app gets `VITE_API_URL` so its API calls and its sync socket follow, and the API gets the new web origin appended to `CORS_EXTRA_ORIGINS`, without which every request fails preflight and every socket upgrade 403s. Nothing outside local dev reads either of those two ports.

The e2e suite (`pnpm test:e2e`) is deliberately **not** movable and asserts 3000/3001 are free before it starts. It builds the real client, and a built client bakes its API URL in.

> One known overlap: `web/testing/global-setup.ts` serves the test `gameData.json` on 3001 too, and it *silently skips startup* if the port is taken — so running `pnpm test` in `web/` while the backend is up makes the suite fetch game data from the API, get a 404, and fail confusingly. Stop the backend first, or start it elsewhere with `pnpm dev --port 3000,3011`, which now points the frontend at 3011 as well so save/load keeps working. If it starts to bite often, move **the test fixture** to a port of its own — say 3005 — rather than moving the API.

### Deployment
New versions are trunked to `main` branch. Once `main` has been pushed, GitHub Actions will create a release then deploy the frontend to Vercel, and build a docker image of the backend which is published to Docker Hub and pulled onto my personal server automatically.

See [docs/deployment.md](docs/deployment.md) for the backend chain end to end — including how to tell whether a deploy actually landed, since a green Actions run does not prove it.

### Further reading
- [docs/architecture/](docs/architecture/README.md) — how the app is put together, the calculation engine, and the frontend data flow
- [docs/telemetry.md](docs/telemetry.md): the anonymous usage heartbeat, every field it sends, and why the id in it cannot be tied to an account
- [docs/conventions.md](docs/conventions.md) — commit and code conventions
- [docs/how-do-we-release.md](docs/how-do-we-release.md) and [docs/versioning.md](docs/versioning.md) — the release and versioning strategy
___

## License
This project is licensed under the GNU Affero General Public License v3.0 or later (`AGPL-3.0-or-later`) - see the [LICENSE](LICENSE) file for details.

Please kindly consider opening PRs to improve the project, and make it better for everyone rather than making a clone.

## Acknowledgements
- Many thanks to [Greeny (creator of Satisfactory Tools)](https://github.com/greeny/SatisfactoryTools) for collating all the game assets required to display the various icons for items and buildings.
- Thanks to the author of [Satisfactory Logistics](https://satisfactory-logistics.xyz), who gave me the inspiration to extend what they did but even further.
