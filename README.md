# Satisfactory Factories
This [web tool](https://satisfactory-factories.app/) is designed to help players of the video game Satisfactory&trade; to plan a comprehensive production chain.

The tool highlights bottlenecks in the production chain, and visually tells the player that they have a problem within their designs.

The player can scale up end product factories as they see fit, and check if their production chain can handle the increased load.

## Contributing
Since this is an open source project, all PR requests will be welcomed, as long as proper intent and communication with the project maintainers is maintained.

___
## Local Development
This project has the following requirements. We highly recommend you use `nvm` to manage your node and p(npm) versions.
- Node.js version >20.17.0 `nvm install 20.17 && nvm use 20.17`
  - You may want to make 20.17 the default version with `nvm alias default 20.17`
- pnpm version >9.14.4 `npm install -g pnpm`
- Docker (for the backend) [Docker install docs](https://docs.docker.com/engine/install/)

### Quick start
The `web`, `backend`, and `parsing` packages are managed as a [pnpm workspace](https://pnpm.io/workspaces). A single `pnpm install` from the repository root installs the dependencies for all three, so you no longer need to `cd` into each package to set it up.

```sh
pnpm install   # installs web + backend + parsing
pnpm dev       # starts Mongo (Docker), then the backend + frontend together
```

`pnpm dev` runs the frontend on http://localhost:3000 and the backend on http://localhost:3010 in parallel (their logs are interleaved in the one terminal). The backend requires Docker to be running and a `backend/.env` file to exist.

Available root scripts:

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

You can still work inside a single package if you prefer — the per-package instructions below continue to work. Each package keeps its own `pnpm-lock.yaml` (the workspace uses `sharedWorkspaceLockfile: false`), so dependency versions are pinned independently and CI is unaffected.

### Frontend
```sh
cd web
pnpm install
pnpm dev
```

Visit http://localhost:3000 to view the project. You may need to load it twice.

#### Testing
There are tests for the frontend project, run them with `pnpm test`. Tests must pass for PRs to be accepted. Note as of writing the coverage isn't 100%.

### Parsing
The parser is responsible for processing the `Docs.json` from the game and reconstructing a more readable version for our use, since the game's docs file is overwhelmingly large and not very human-readable. The file is located under `X\steamapps\common\Satisfactory\CommunityResources\Docs` on Windows. Replace X with where you have installed your steam library (usually `C:\Program Files (x86)\Steam`)

#### Running the parser and updating the gameData
To run the parser:

```sh
cd parsing
pnpm install
pnpm dev
```

When the parser is run, it outputs to file `/parser/gameData.json`. This file needs copying to `/web/public/gameData_v1.x-xx.json`. The version must directly correlate with the minor version of the game (unless a patch messes with a recipe, unlikely). e.g. `v1.0-11.json` would increment to `v1.0-12.json`. The old version needs deleting when you commit.

Once the new file has been placed, you must also edit `/web/src/config/config.ts` and update the version there too.

This instructs web clients to re-download the game data file with the new version upon refresh and replace their locally stored version.

### Backend
Required for the login and syncing of data features, not required for local development.
1. Start Docker service on your local machine.
```sh
cd backend
pnpm install
./start.sh
```

API will be available on http://localhost:3010.

There are no tests currently available for the backend project.

### Deployment
New versions are trunked to `main` branch. Once `main` has been pushed, GitHub Actions will create a release then deploy the frontend to Vercel, and create a docker image of the backend to deploy to my personal server.
___

## License
This project is licensed under the GNU License - see the [LICENSE](LICENSE) file for details.

Please kindly consider opening PRs to improve the project, and make it better for everyone rather than making a clone.

## Acknowledgements
- Many thanks to [Greeny (creator of Satisfactory Tools)](https://github.com/greeny/SatisfactoryTools) for collating all the game assets required to display the various icons for items and buildings.
- Thanks to the author of [Satisfactory Logistics](https://satisfactory-logistics.xyz), who gave me the inspiration to extend what they did but even further.
