# `parsing` — the game data parser

A small CLI that turns the game's `Docs.json` into the `gameData.json` the frontend consumes. The game's own docs file is enormous and not remotely human-readable; this reconstructs a trimmed, structured version of the recipes, items and buildings.

Prerequisites (Node, pnpm) and the one-time workspace install are covered in the [root README](../README.md#local-development). There is no separate install step for this package.

## Finding `Docs.json`

On Windows the file lives under:

```
X:\steamapps\common\Satisfactory\CommunityResources\Docs
```

Replace `X` with wherever your Steam library is installed (usually `C:\Program Files (x86)\Steam`).

## Running the parser

Copy `Docs.json` into this directory as `game-docs.json` — that filename is what the `dev` script passes in as its input argument — then:

```sh
cd parsing
pnpm dev
```

Or `pnpm dev:parsing` from the repository root.

The script is `ts-node src/index.ts game-docs.json gameData.json`. If you'd rather not rename anything, the entry point takes the input and output paths as positional arguments, so you can call it directly:

```sh
pnpm exec ts-node src/index.ts <input> <output>
```

Output lands at `parsing/gameData.json`.

## Updating the game data used by the app

The parser output and the frontend's version pin have to move together, or clients keep their stale cached copy:

1. Copy `parsing/gameData.json` to `web/public/gameData_v1.x-xx.json` under a **new** version name. The version tracks the game's minor version (unless a patch messes with a recipe, which is unlikely) — e.g. `gameData_v1.2-05.json` increments to `gameData_v1.2-06.json`.
2. Bump `dataVersion` in `web/src/config/config.ts` to match (currently `1.2-05`).
3. Delete the old `web/public/gameData_*.json` — there should only ever be one.

Bumping the version is what instructs web clients to re-download the game data file on their next refresh and replace their locally stored copy.

## Testing

```sh
pnpm test
```

Jest, run with coverage. **Tests are mandatory in this package** — unlike the frontend, the parser is kept at or near 100% coverage, because everything the app calculates is downstream of what comes out of here.

## Deployment

There isn't one. The parser is a local tool; its output ships as part of a normal web deployment.
