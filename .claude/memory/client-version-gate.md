---
name: client-version-gate
description: "How the planner's version reaches the API, why it travels as a VITE_ var rather than a Vite define, and the rules the gate must keep"
metadata: 
  node_type: memory
  type: project
  originSessionId: 867eb320-3243-4065-abb3-5dd328262fdf
  modified: 2026-08-13T01:33:38.238Z
---

The web app sends its build version to the API on every request (`X-Planner-Version`), and the
backend refuses writes from anything older than `MIN_CLIENT_VERSION`. The version comes from the
repo **root** `package.json`, read in `web/vite.config.mts`.

**Vite `define` does not reach Vitest.** A `define`d global is replaced only in the client
environment, so under Vitest every module touching it dies on a `ReferenceError` before a single
test runs — and `environments.ssr.define` does not fix it either. Build-time constants therefore
travel as `process.env.VITE_*` set in `vite.config.mts` and read as `import.meta.env.VITE_*`,
which is the same route `VITE_ENV` already takes and works in dev, in the build and in tests.

Rules the gate must keep, because breaking them is silent:

- Compare *older than*, never *different from*. A client newer than the server expects has to
  pass, or whichever of web and backend deploys first locks the other out.
- Reads are never refused — they carry `X-Planner-Client-Outdated` instead. Blocking a read
  would strand a stale tab with no way to see its own plan.
- A refused write must never touch local state. The plan lives in localStorage and that is the
  only copy; the fix is a reload, and anything else loses the user's work.
- Adding a header means adding it to the backend's CORS `allowedHeaders`, and any header the
  client reads back to `exposedHeaders`. Neither failure shows up in a unit test — only in a
  browser, as an opaque "Failed to fetch".

Clients that shipped *before* the gate cannot show the reload dialog — they have no code for it.
They fall through `syncData`'s branches, return undefined, and take the generic sync-error path:
syncing stops and an alert blames a server outage and asks for a Discord report. Refused, safe
and self-limiting, but noisy; no choice of status code improves it, because that code is already
in the wild. Deploy web before the backend so a reload lands on a build that handles it properly.

`plannerVersion` in `web/src/config/config.ts` is a different concept entirely (a property of a
plan, marking it as having answered the raw-resources question) and must not be reused for this.
See [[export-import-chain-invariants]] for what the save payload actually contains.
