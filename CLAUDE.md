# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

A companion `AGENTS.md` exists with project-domain context (factory connections, flow rebalancing, bottleneck concepts) — read it for the "why" behind the calculation logic. This file focuses on architecture and commands.

## Repository layout

This is a pnpm workspace (`pnpm-workspace.yaml`) with three packages under `application/`:

- **`web/`** — Vue 3 + Vuetify 3 SPA (the planner UI). This is where most work happens.
- **`backend/`** — Express + Mongoose API for auth and saving/sharing plans. Optional for local dev.
- **`parsing/`** — CLI that converts the game's `Docs.json` into the `gameData.json` the frontend consumes.

Each package keeps its **own** `pnpm-lock.yaml` (`sharedWorkspaceLockfile: false`) — versions are pinned per package.

## Commands

Run from the repo root (`application/`):

| Command | Purpose |
| --- | --- |
| `pnpm install` | Install all three packages |
| `pnpm dev` | Mongo (Docker) + backend + frontend in parallel (web :3000, backend :3010) |
| `pnpm dev:web` | Frontend only (no Docker needed) — sufficient for most planner work |
| `pnpm dev:backend` | Mongo + backend only |
| `pnpm dev:parsing` | Run the parser |
| `pnpm build` / `pnpm lint` / `pnpm lint-check` / `pnpm test` | Recursive across all packages |

Per-package (from inside `web/`, `backend/`, or `parsing/`):

- Frontend tests: `cd web && pnpm test` (Vitest, runs with coverage).
- **Single test file / pattern:** `cd web && pnpm exec vitest run <path-or-pattern>` (e.g. `pnpm exec vitest run factory-management/products`). Use `vitest` (no `run`) for watch mode.
- Parser tests: `cd parsing && pnpm test` (Jest). The parser **must** stay near 100% coverage — it feeds all calculations.
- Backend has **no tests**.
- `web` build runs `vue-tsc --noEmit` first, so a type error fails the build.

Node **>= 24** (Node 26 works since jsonwebtoken 9.0.3 dropped its transitive `SlowBuffer` dependency). pnpm **>= 11.3**.

## Architecture

### The calculation engine (`web/src/utils/factory-management/`)

This is the core of the app. Everything else is UI around it.

- **`factory.ts`** — `calculateFactory()` recomputes one factory through a fixed sequence of layered passes (products → sync state → power → buildings → dependencies → parts → building groups → problems). Order matters and is documented inline; don't reorder passes casually. `calculateFactories()` is "the beating heart" — it runs every factory **twice** (first in `loadMode` to build part metrics, then for real after cross-factory dependencies resolve).
- Each pass lives in its own file (`products.ts`, `parts.ts`, `dependencies.ts`, `power.ts`, `buildings.ts`, `problems.ts`, `syncState.ts`, `exports.ts`, `inputs.ts`, `satisfaction.ts`, `building-groups/`). Nearly all have a co-located `.spec.ts` — mirror this when adding logic.
- **Factories are linked by item flows.** A producer's output feeds consumer factories' `inputs`; `dependencies.ts` resolves these and flags imbalances via the `hasProblem` flag rendered in the Vue Flow graph. `flushInvalidRequests()` prunes inputs whose target factory/part no longer exists.
- The canonical shape is `Factory` in `web/src/interfaces/planner/FactoryInterface.ts`; `newFactory()` in `factory.ts` is the single source of truth for a fresh factory's fields.

### State (`web/src/stores/`, Pinia)

- **`app-store.ts`** — factories are grouped into `factoryTabs` persisted in `localStorage`. Contains defensive "SAFE MODE" recovery for corrupted tab data. Recalculation flows through here.
- **`game-data-store.ts`** — loads/caches the versioned `gameData` JSON.
- **`auth-store.ts`** / **`sync-store.ts`** (+ `stores/sync/`) — talk to the backend for login and plan save/load/share.
- Tests mock stores with `@pinia/testing`; update the `.spec.ts` when changing store shape.

### Backend (`backend/backend.ts`)

Single-file Express app. Routes: `/register`, `/login`, `/validate-token` (JWT), `/save` + `/load` (authenticated plan sync), `/share` + `/share/:id` (shareable plans, rate-limited). Mongoose models in `backend/models/`. API base URL is selected in `web/src/config/config.ts` by `VITE_ENV`.

### Game data versioning (important, easy to get wrong)

When game recipes/items change, regenerate data via the parser, then:
1. Copy the parser output to `web/public/gameData_v<version>.json` with a **new** version name.
2. Bump `dataVersion` in `web/src/config/config.ts` (currently `1.2-01`) — this triggers clients to re-download.
3. Delete the old `web/public/gameData_*.json`.

The version tracks the game's minor version. See `README.md` for the full parser workflow.

## Conventions

- **TypeScript everywhere.** Vue components use `<script setup>` + Composition API and Vuetify components for UI.
- 2-space indent, LF endings, trailing newline, no trailing whitespace. `pnpm lint` (auto-fix) must pass before commit — CI blocks otherwise.
- **Conventional Commits**, scoped by component: `feat(web): ...`, `fix(parser): ...`, `chore(repo): ...`. Universal SemVer across all packages.
- Update `CHANGELOG.md` for significant changes. Deploys are trunk-based off `main` (GitHub Actions → Vercel for web, Docker image for backend).
