---
name: stale-branch-cherry-pick-not-merge
description: A branch that predates a squash-merged release cannot be merged forward; cherry-pick its unique commits onto fresh main instead
metadata:
  type: project
  volatility: durable
  lastVerified: 2026-08-21
---

This repo is trunk-based and lands PRs as **squash** merges. So when a long-lived branch has
already contributed its work to `main` through a squash, that work exists in `main` as one new
commit that shares no ancestry with the branch's own commits. Merging `main` back into the branch
then re-fights every file both sides touched, because git's merge-base predates the squash and
each side looks like an independent change to the same lines.

Measured on `feat/version-poll` (2026-08-21), which branched before Update 6 landed via the #512
squash:

| Approach | Conflicts |
| --- | --- |
| `git merge origin/main` into the branch | **70 files**, including `pnpm-lock.yaml`, `gameData_*.json` and binary PNGs |
| Cherry-pick the one unique commit onto fresh `main` | **2 files**, both a few lines |

**Why:** the merge conflicts are not real disagreements. They are the same work arriving by two
routes, and resolving them means hand-adjudicating 70 files where `main` is simply correct. That
is hours of judgement calls in the calc engine with a real chance of silently reinstating
something Update 6 deliberately changed. The cherry-pick asks the only question that matters:
does this branch's *new* work still apply?

**How to apply:** before merging `main` into any branch more than a release old, find what the
branch actually adds that `main` lacks. `git ls-tree -r --name-only <branch>` against the same on
a test cherry-pick shows files unique to the branch, and
`git rev-list --count <branch> --not --remotes` counts commits on no remote (a squash makes this
number large and alarming while meaning nothing). Then branch fresh from `origin/main`,
cherry-pick only the commits carrying genuinely new work, and keep the old branch pushed as the
archive rather than rewriting it.

The tell that this situation applies: `git branch --merged` and `git cherry` both insist the
branch is unmerged while its content is plainly in `main`. See [[export-import-chain-invariants]]
for the other place ancestry reasoning misleads in this repo.
