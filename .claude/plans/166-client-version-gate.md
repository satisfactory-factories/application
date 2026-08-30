# Client version gate

Brief for an agent. Implement a client-version gate between the planner and its API, so a stale
browser tab can never write to the cloud plan. Closes
https://github.com/satisfactory-factories/application/issues/166.

Repo: `satisfactory-factories` (pnpm workspace; `web/`, `backend/`, `parsing/`). Read `CLAUDE.md`
and `AGENTS.md` first. Check `gh pr view 512 --json state` — if OPEN, branch off `update6`; if
merged, branch off a freshly fetched `main`.

## Tasks

- Establish a single build-time version for the web app and expose it through Vite `define`.
- Send that version as a header on every request the planner makes to the API.
- Add a semver comparison module to the backend and unit test it.
- Reject writes from clients below a configured minimum version, with a machine-readable code.
- Report the current version on reads and on the unauthenticated liveness endpoint.
- Handle the rejection in the client: stop syncing, block with a reload prompt, keep local data.
- Cover the new behaviour with Vitest specs and update `CHANGELOG.md`.
- Open the PR with the manual deploy steps in a heading at the very top.

## Why this is needed

PR #512 changed what `/save` stores. Clients up to v0.5 POST a bare `Factory[]`; from v0.6 they
POST the whole `FactoryTab`, so `powerTarget`, `plannerVersion` and memberless `groups` survive a
restore. The backend stores whatever arrives, wholesale (`backend/backend.ts`, the `/save`
handler). So during any rollout, a v0.5 tab left open in another window autosaves an array over
the richer document and silently destroys that plan-level state. There is no undo and no conflict
detection. An adversarial review rated this critical, and the version gate is the fix: a client
too old to write is refused before it can do the damage.

## What to build

### 1. A single build-time version for the web app

There isn't one today — the root `package.json` says `0.5.0` and is stale, and
`config.plannerVersion` (`'0.6'` in `web/src/config/config.ts`) means "this plan has answered the
raw-resources question", which is a different concept and must not be reused. Pick one source of
truth, expose it through Vite `define` in `web/vite.config.mts`, and make it available to tests.

### 2. Every request to the API carries it

A header (e.g. `X-Planner-Version`) rather than a body field, so `GET /load` and `/share/:id`
carry it too. Put it in one place in `web/src/stores/sync/sync-actions.ts` and wherever else
fetches the API — grep for `config.apiUrl` so nothing is missed.

### 3. The backend rejects clients below a configured minimum

**Critical: compare semver and reject *older*, never merely *different*.** A newer client than the
server expects must pass. Otherwise whichever side deploys first locks the other out.

The minimum comes from an env var (default it to something safe) so it can be raised without
rebuilding the image — the backend is released manually, which issue #166 already flags as the
awkward part. Reject with a distinct status and a machine-readable code in the body, not a bare
400 the client can't tell from a validation error; say what the minimum and the received version
were. Missing header = a client from before this change = reject on writes.

Apply it to writes (`/save`, `/share`) unconditionally. For reads, do **not** block — return the
current version alongside the data so an idle tab learns it is stale without needing to save.
`/health` or `/hello` should report the version unauthenticated, which is what gives #166 its
polling story for free.

### 4. The client handles the rejection loudly and safely

On the stale-version code:

- Stop syncing (`sync-store.ts` already has `stopSync()`) so it doesn't retry in a loop.
- Show a blocking prompt saying an update has been released, nothing will be saved to the account
  until the page is reloaded, and offering a reload button.
- **Never** clear, overwrite or reload local state as part of this. The user's work is in
  localStorage and must survive untouched — losing it here would be worse than the bug.
- Distinguish this from the existing sync-error path, which `alert()`s about server outages and
  tells people to report to Discord. A required reload is not an outage and must not read as one.

## Constraints

- Do not weaken or bypass any existing sanitising in `/save`, and do not change what `/save`
  stores on a successful write.
- The backend has no test suite. Keep the comparison logic in a small pure module so it can be
  unit tested, and test it — do not leave semver comparison untested because "backend has no
  tests".
- Web tests are Vitest with `@pinia/testing`: `cd web && pnpm exec vitest run <pattern>`. Cover the
  header being sent, the rejection stopping the sync, and local data surviving a rejection.
- `pnpm lint` must pass; `web` build runs `vue-tsc --noEmit`.
- Conventional commits, scoped, honest types. Signed commits — never disable signing.
- Update `CHANGELOG.md`.

## Open decisions

Decide these after reading the codebase; either answer is defensible.

- **Status code.** `426 Upgrade Required` is semantically right; `409` is more firewall-proof.
- **Where the version lives.** Root `package.json` versus a dedicated constant.

## PR

Manual steps go in a heading at the very top of the PR body, before anything else: name the new
env var and what breaks until it is set, and state the deploy ordering explicitly — which of
backend and web must go out first, and what users experience in the window between. Reference
issue #166. Keep infrastructure hostnames and addresses out of the PR body entirely.

Also state in the PR whether a server-side merge guard is still worth adding as defence in depth
— i.e. `/save` preserving the stored document's `powerTarget`/`groups`/`plannerVersion` when a
bare array arrives — given the gate now refuses those clients. Recommend, don't implement.

## Out of scope

`/save` accepts any JSON body: one that is neither an array nor `{ factories }` normalises to an
empty list, sanitises nothing, and writes the raw payload back at 200. The version gate does not
touch this, because a current client sending garbage still passes the header check. Leave it
alone — it is a separate fix.

## Report at the end

What you changed, what you tested and the actual output, and anything you could not verify
locally.
