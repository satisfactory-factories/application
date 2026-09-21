---
name: renovate-automerge-blocked-by-ruleset
description: renovate.json says patch/minor automerge, but the "Human review required" ruleset (1 approval) means nothing ever automerges; green Renovate PRs sit until someone merges them
metadata:
  type: project
  volatility: normal
  lastVerified: 2026-09-12
---

`renovate.json` configures automerge for patch and minor updates, and its comments say
"Patch and minor updates merge themselves once the branch is green". They do not. The
`Human review required` ruleset on `main` demands one approving review, and Renovate
cannot approve its own PR, so every Renovate PR waits for a human even when green. On
2026-09-12 an eslint patch had been green for eight days.

**Why:** the automerge config and the ruleset were added independently and nobody
noticed they cancel out. The symptom is quiet: no error, the PRs just accumulate.

**How to apply:** when asked to "clear up the dependencies", the fastest route is one
sweep branch that applies every open Renovate bump at once (see PR #694), rather than
merging and rebasing them one at a time. Renovate closes its own PRs once the versions
are current on `main`. If the automerge is ever meant to work, either the ruleset needs
a bypass for the Renovate app or the automerge config should be removed so the comments
stop lying. Related: [[renovate-catalog-lockfile-mismatch]].
