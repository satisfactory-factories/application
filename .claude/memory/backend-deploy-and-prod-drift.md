---
name: backend-deploy-and-prod-drift
description: Production runs a 19-month-old API image that main can no longer rebuild — the deploy automation and its three prerequisite fixes are in PR #439, not yet merged or exercised
metadata:
  type: project
---

As of **2026-07-27**, the live API on `sf` (10.0.5.5) runs an image built ~19 months ago.
`main` has drifted away from it in ways that only surface at deploy time, so **production
is not reproducible from `main`** until PR
[#439](https://github.com/satisfactory-factories/application/pull/439) lands (issue #438):

1. **The image could not be built.** `backend/package.json` uses `catalog:` versions, which
   need `pnpm-workspace.yaml` in the build context; `publish.sh` built from `backend/` and
   died with `ERR_PNPM_CATALOG_ENTRY_NOT_FOUND_FOR_SPEC`. Reproduced on `main`.
2. **The listen port disagreed with everything else.** `618e944` moved the app 3001 → 3010
   but moved nothing else — the server compose still published `3001:3001`, and
   `web/src/config/config.ts` still pointed local dev at 3001. It only worked because the
   running image predates that commit; the first rebuild would have shipped a container
   nothing upstream could reach, and the deploy would still have gone green. Resolved by
   putting the app **back on 3001** everywhere (app, `EXPOSE`, both compose files, host
   port, tunnel origin) rather than mapping between two numbers. **Matt's ruling, 2026-07-27:
   3000 is the web app and 3001 is the API, and those two are fixed** — the overlap with the
   gameData fixture `web/testing/global-setup.ts` binds on 3001 (it silently skips startup
   when taken, so running the backend during a `web` test run 404s the suite) is judged rare
   enough to live with. If it ever does bite, move **the fixture** to its own port (~3005),
   never the API. `PORT` overrides the app's port for local work; nothing deployed sets it.
3. **A failed deploy could not report itself.** The webhook returns `200` before the SSH
   happens, and the old `update.sh` exited `0` whether or not the container survived.

**Why:** all three are invisible from the code — nothing in the repo says what is actually
running on the box, and each one individually looks like it works. Anyone who assumes the
API is deployable from `main` today, or reads a green Actions run as proof, will reach the
wrong conclusion. The pattern to remember beyond these three: **on this project, the deploy
path has no test coverage, so its breakages accumulate silently until someone needs to ship.**

**How to apply:** `docs/deployment.md` (added by #439) is the authoritative description of
the chain once merged — read it rather than re-deriving. Verify a deploy on the box
(`ssh sf 'tail /root/deploy.log'`, container `(healthy)`), never in Actions. Two files —
`/root/docker/docker-compose.yml` and `/root/update.sh` — are mirrored in `backend/` but
synced by nothing, so a repo-side change to either is inert until copied over by hand.
The hook lives in the webhooks repo; its side is
[webhooks#9](https://github.com/Maelstromeous/webhooks/pull/9).
