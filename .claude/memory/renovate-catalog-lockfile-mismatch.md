---
name: renovate-catalog-lockfile-mismatch
description: Why sharedWorkspaceLockfile must stay true — Renovate catalog bumps break CI without it
metadata: 
  node_type: memory
  type: project
  originSessionId: 523b0cee-f9ca-4574-8cb3-ec2e2cb7ad04
  modified: 2026-07-28T16:50:57.459Z
---

Renovate only ever collects the **workspace-root** `pnpm-lock.yaml` as a changed artifact. It
does run `pnpm install --lockfile-only`, and pnpm does regenerate every lockfile on disk, but
Renovate discards all but the root one
([renovate#37485](https://github.com/renovatebot/renovate/issues/37485) — open, priority-4-low,
unassigned; the documented `postUpgradeTasks` workaround needs self-hosted Renovate, and this
repo is on the hosted Mend app).

While the repo had per-package lockfiles (`sharedWorkspaceLockfile: false`, until 2026-07-28),
that root file was a 9-line stub, so every `catalog:` bump shipped as a one-file diff to
`pnpm-workspace.yaml` and failed **all four** CI checks on `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`
— not just the Docker build, because pnpm defaults `frozen-lockfile` to true when it detects
CI. Deterministic, but only for the seven catalogued packages, so it read as flaky.

**Why it matters now:** the fix was to consolidate onto one root lockfile, which only works
because Renovate's blind spot *is* the per-package files. If anyone flips
`sharedWorkspaceLockfile` back, catalog bumps start failing again on the next eslint or
typescript release. If it ever needs unpicking, the manual remedy on a Renovate branch is
`pnpm install --lockfile-only` from the repo root (recursive), then push — after which
Renovate treats the branch as edited and won't self-rebase, so it needs approving rather than
the rebase checkbox ticking.

See also [[calc-engine-gotchas]] for the other load-bearing-order traps in this repo.
