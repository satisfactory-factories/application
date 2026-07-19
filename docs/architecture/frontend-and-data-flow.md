# Frontend, stores, and data flow

## How an edit becomes a recalculation

The single most important wiring in the app: **`Planner.vue` `provide()`s `updateFactory`**, a thin proxy that calls `calculateFactory(factory, getFactories(), gameData, modes)`. Every editing component (`Product.vue`, `PowerProducer.vue`, `BuildingGroup.vue`, `Imports.vue`, the calculators…) `inject('updateFactory')` and calls it after a user edit. There is no watcher-based auto-recalc — recalculation is explicit, and forgetting to call `updateFactory` after a mutation is a classic bug source. Persistence is separate: `app-store` deep-watches `factoryTabs` and writes to `localStorage` on any change.

## Pinia stores (`web/src/stores/`)

- **`app-store.ts`** — the central state. Owns `factoryTabs` (multi-tab plans in `localStorage.factoryTabs`), exposes `factories` for the active tab, factory/tab CRUD, and the staged loading pipeline (see below). `initFactories()` runs save-data migrations and validation on every load.
- **`game-data-store.ts`** — loads and caches `gameData_v{dataVersion}.json` (version from `web/src/config/config.ts`); lookup helpers (`getRecipeById`, `getDefaultRecipeForPart`, …).
- **`auth-store.ts`** — JWT auth against the backend; token in `localStorage`; emits `loggedIn` / `sessionExpired`.
- **`sync-store.ts`** + **`sync/sync-actions.ts`** — background save: listens for `factoryUpdated` → sets `dataSavePending`; a 10-second tick POSTs the whole plan to `/save`; detects out-of-sync against server `lastSaved`.

## Event bus

`web/src/utils/eventBus.ts` is a typed `mitt` instance — the full event contract is enumerated in its `Events` type. It decouples stores from UI; recalculation itself does NOT go over the bus (that's `updateFactory`), but its completion is announced (`factoryUpdated`, `calculationsCompleted`) and some components (e.g. `BuildingGroups.vue`) listen to refresh derived display metrics.

The incremental loading handshake (documented in `docs/Loading.md`): loader dialog mounts → `readyForData` → app-store wipes the planner and pushes factories one at a time with 50 ms delays, emitting `incrementLoad` → `loadingCompleted`. This exists purely to avoid freezing the DOM on large plans.

## Component hierarchy (planner)

```
pages/index.vue
└─ Planner.vue                      (provides updateFactory/findFactory/deleteFactory/…)
   ├─ PlannerFactoryList.vue        (sidebar)
   └─ PlannerFactory.vue            (one factory card)
      ├─ products/ProductsAndPower.vue
      │  ├─ Product.vue / PowerProducer.vue
      │  └─ BuildingGroups.vue → BuildingGroup.vue (one group row)
      ├─ imports/Imports.vue, FactoryImports.vue, RawResources.vue
      ├─ PlannerFactorySatisfaction*.vue + satisfaction/calculator/* (train/truck/drone/tractor export math)
      ├─ Statistics*.vue
      └─ PlannerFactoryTasks.vue / PlannerFactoryNotes.vue
```

Other pages: `graph.vue` (Vue Flow node graph of factory links; nodes/edges from `utils/graphUtils.ts`, layout from `utils/graphLayout.ts`; still WIP), `recipes.vue`, `share/[id].vue` (loads shared plans). Routing is file-based (`unplugin-vue-router`); a global guard loads game data and starts the sync tick before navigation. Components and imports are auto-registered (`components.d.ts`, `auto-imports.d.ts`).

## Backend (`backend/backend.ts`)

One Express file, port 3010, Mongo via Mongoose. `POST /register|/login|/validate-token` (JWT, bcrypt), `POST /save` + `GET /load` (whole-plan blob per user), `POST /share` + `GET /share/:id` (share slugs via `random-word-slugs`), rate limiting throughout. The factory interfaces are duplicated from the frontend (`backend/interfaces/`) — keep in mind when changing `FactoryInterface.ts`.

## Testing layout

Two tiers, both Vitest (config in the `test` block of `web/vite.config.mts`; jsdom, forks pool):

1. **Co-located unit specs** (`web/src/**/*.spec.ts`) — pure function/component tests next to the source. The calc engine is thoroughly covered here.
2. **`web/testing/tdd/`** — behavior suites that mount real Vue components (via `web/testing/helpers.ts#mountItem`, which provides a real `updateFactory` wired to the actual engine) and assert on both DOM and resulting `factory.parts`. Test names carry operation refs (`BG-C-D-2`, `BG-E-B-PROD-4`, …) that map to the status sheets in `docs/testing/`.

Supporting cast:
- `web/testing/global-setup.ts` starts a static server on port 3001 so `fetchGameData()` works in tests.
- **`web/src/utils/factory-setups/`** — prebuilt example plans, many named after the GitHub issue they reproduce (`267-nuclear-waste-handling.ts`, `315-non-exportable-parts-imports.ts`, …), plus `simple-plan.ts` and `complex-demo-plan.ts` (also powers `?setupDemo` in the app). These are the best way to construct realistic factories in new tests.
- `docs/testing/*.md` — hand-maintained sheets of every user operation with Implemented / Unit Tested / Eyeballed status. When working on building groups, this is the source of truth for what is expected vs known-broken.

Run with `cd web && pnpm test` (or `pnpm vitest run <path>` for one suite). The parser (`parsing/`) uses Jest separately and its tests are mandatory.
