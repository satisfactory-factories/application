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

## What the suite covers

| File | What it proves |
| --- | --- |
| `two-devices` | An edit reaches the account's other device inside 2s; both mirrors end deep-equal. |
| `concurrency` | Same-factory edits converge on one winner; different-factory edits both survive, whether the edit is an add or a note. |
| `tab-lifecycle` | Create, rename (through the tab settings dialog), delete and drag-reorder all reach a second device once it opens the plan from the panel; a hidden plan stays hidden across a reload and Show restores it; a member's rename field is disabled with the reason shown; signing in from the signed-out convert button turns it into the real conversion on the same open dialog; a plan filled in after signing in reaches the cloud through tab settings and comes down on the next device. |
| `sidebar-tabs` | The docked sidebar lists the tab you are on, whether local, synced or joined; a tab too big to render in one flush opens behind the loading overlay, and a small one opens instantly. |
| `new-tab-chooser` | Local is offered to anyone; picking synced without an account signs in on the same dialog and still makes the tab. A plan hidden in this browser is listed on the plus button and comes back whole when opened from there. |
| `invite` | An anonymous visitor joins by link and edits back; a signed-in joiner's plan follows their account and opens from the panel on a second device. |
| `snapshot-link` | `/share/:id` still imports a frozen local copy, and the owner's later edits do not reach it. Reopening the dialog on an untouched plan hands back the same link rather than minting a second one; an edit earns a fresh one. |
| `invite-password` | A wrong password is refused inline, the right one joins, and a rotation kicks the visitor while the member stays. |
| `unshare` | The collaborator keeps a local copy of the last state and loses the live link. |
| `bulk-clear` | "Clear all" on one device empties the other, with nothing left unsent on either. Seeded past `BULK_REMOVAL_THRESHOLD`, so the clear has to declare itself to be accepted. |
| `offline-manual` | The airplane switch makes zero requests, the edits made behind it sync on the way back, and a task written offline survives a rebase onto a room that moved on. |
| `offline-detected` | A dropped socket raises the prompt; the op in flight at the drop and the edits made offline both survive, and so does a rename left unsent by the drop. |
| `offline-conflict` | Edits made while one device was cut off, on factories the other device edited too, raise the conflict prompt naming exactly those factories with live-against-mine figures per product. Keeping both on "My version" carries them plus the untouched device's own edit; a mixed answer lands both clients on that hybrid, every factory whole on the side that won it rather than a blend of the two, with the offline copy holding what was given up as a plain local plan. |
| `adoption` | Two browsers with different local plans adopt into one account and converge on the union; unticking a plan leaves that one local. |
| `preferences` | A synced preference set on one device is there on the next device's first login. |
| `login-chooser` | An interactive sign-in is fronted by the plan chooser; "Not now" opens nothing, and a reload with a persisted session never asks. Open-all on a device that has never seen the account downloads every plan whole, the unselected one included, and a plan left open there catches up on what it missed while the device was away. |
| `version-gate` | A 426 raises the persistent refresh prompt and leaves the planner usable. |
| `field-locks` | A focused note disables the same field for the other client and keeps it disabled while its holder types; blur and a ten-second idle both hand it back, and a second factory's note is never covered. |
| `loading-tab` | A client rendering a big plan makes no writes: no op it sends carries a removal, and both devices end holding every factory. Covered for a tab re-entered, a client with edits still unsent, and a return to the planner from another page. |

## Rate limits, and the address each device claims

The API allows **200 requests per 5 minutes per client address**, and a whole run is well
over that from one address. Every browser context and every API-side registration
therefore claims an address of its own out of the RFC 5737 documentation range, which is
what the deployed topology delivers anyway: the API sits behind one trusted hop
(`trust proxy = 1`) and reads the client from `X-Forwarded-For`.

The browser cannot send that header itself — it is not in the CORS allowlist, and
correctly so — so `helpers/accounts.ts` injects it in a Playwright route instead, after
the browser has made its preflight decision. A test that opens many devices is spending
real allowance: `POST /share` is 5 per 5 minutes and `POST /rooms/:id/auth` is 10, both
per address.

## Writing tests

- Files are `e2e/tests/*.e2e.ts`. The `.spec.ts` name belongs to Vitest, and the unit
  suite would collect anything named that way.
- `helpers/fixtures.ts` gives every test a `client()` fixture: one browser context is one
  device, with its own storage and its own socket. Everything it opens is closed for you.
- `helpers/accounts.ts` registers a fresh account over the API and seeds the session
  through storage state, along with the flags that keep the welcome dialog and the
  release splash from covering the page.
- `helpers/planner.ts` drives the planner: create a synced tab, select one by room id,
  read the tab bar, drag a tab, wait for a revision, add a factory, set a product's
  quantity, read the mirror (a tab by name, a product's amount, one factory's authored
  content, how a tab is held).
- `helpers/rooms.ts` sets up the two-device and shared-room cases and drives the share
  dialog; `helpers/session.ts` drives the sign-in tray and the account panel.
- `helpers/network.ts` counts REST traffic, and puts a gate on one client's WebSocket so
  a test can hold an op in flight or kill the connection at an exact moment.
- **No fixed sleeps** — wait on a condition: an element, a stored revision, a poll over
  the two mirrors. The one exception is the quiet period the offline test needs to claim
  nothing was sent, and it is named as such. `retries` is 0 on purpose.
- `expectQuiesced` is the strongest "it settled" check there is: every client has no
  unsent intent left and they all hold the same bytes at the same revision.

## In CI

`.github/workflows/e2e.yml` runs the same `pnpm test:e2e` on `ubuntu-latest`, path-filtered
to `web/`, `backend/`, `common/` and the workspace files. It caches the Chromium download and
the mongod binary, and uploads `web/test-results/` (traces and screenshots) when the job
fails. Unlike the three sibling check workflows it is free to path-filter because it is not a
required status check; making it required means dropping the filter first.

## Environment switches

| Variable | Effect |
| --- | --- |
| `E2E_SKIP_BUILD=1` | Reuse the existing `web/dist` and `backend/dist`. Fast to iterate on, and wrong the moment either is stale or was built for another environment. |
| `E2E_VERBOSE=1` | Stream the API's and Vite's output into the test run. |
