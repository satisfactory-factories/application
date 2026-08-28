# Playwright end-to-end suite

`pnpm test:e2e` (from `web/`) is the whole command. It builds both halves of the app,
boots them, runs the tests and shuts everything down again.

## What the harness starts

`global-setup.ts` runs before any test and returns its own teardown:

1. `pnpm --filter backend run build` and `vite build` (with `VITE_ENV=dev`).
2. `mongodb-memory-server`, one mongod for the run.
3. The compiled API (`backend/dist/main.js`) on port **3001**, given `JWT_SECRET` and
   `MONGODB_URI` as environment variables and started in a temporary directory, so
   `@nestjs/config` cannot find `backend/.env` and prefer its values.
4. `vite preview` on port **3000**, serving the production build.

Neither port is configurable. `WEB_ORIGINS` in `backend/src/config/cors.ts` is what the
CORS allowlist and the WebSocket upgrade's Origin check accept, and it names
`http://localhost:3000`; a client built with `VITE_ENV=dev` calls `http://localhost:3001`.
The harness refuses to start if either port is taken rather than picking another one.

## Writing tests

- Files are `e2e/tests/*.e2e.ts`. The `.spec.ts` name belongs to Vitest, and the unit
  suite would collect anything named that way.
- `helpers/fixtures.ts` gives every test a `client()` fixture: one browser context is one
  device, with its own storage and its own socket. Everything it opens is closed for you.
- `helpers/accounts.ts` registers a fresh account over the API and seeds the session
  through storage state, along with the two flags that keep the welcome dialog and the
  release splash from covering the page.
- `helpers/planner.ts` drives the planner: create a synced tab, select one by room id,
  read the tab bar, wait for a revision, add a factory, read the mirror.
- **No fixed sleeps.** Wait on a condition: an element, a stored revision, a poll that
  compares the two mirrors. `retries` is 0 on purpose, so a flake has to be fixed.

## Environment switches

| Variable | Effect |
| --- | --- |
| `E2E_SKIP_BUILD=1` | Reuse the existing `web/dist` and `backend/dist`. Fast to iterate on, and wrong the moment either is stale or was built for another environment. |
| `E2E_VERBOSE=1` | Stream the API's and Vite's output into the test run. |
