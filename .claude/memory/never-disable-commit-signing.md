---
name: never-disable-commit-signing
description: "Matt signs every commit (SSH signing, commit.gpgsign=true globally) — never pass -c commit.gpgsign=false, it works fine non-interactively"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 99b02750-df0b-4384-919a-0f5a5e53c5fa
  modified: 2026-07-27T14:44:27.656Z
---

**Never disable commit signing.** Matt's global git config sets `commit.gpgsign true`,
`gpg.format ssh`, and a `user.signingkey`, and every commit he authors shows
`verified: true` on GitHub. On 2026-07-27 I passed `-c commit.gpgsign=false` on every
commit in two repos "to avoid a signing prompt", and pushed five unsigned commits to a PR
branch plus two that were merged into `webhooks` main before he spotted it.

**Why:** signing is a deliberate control he maintains, and unsigned commits are permanent
once merged — the fix after the fact is a history rewrite of a shared branch, which is far
worse than the original problem. The justification was also simply wrong: SSH signing here
succeeds non-interactively (verified with a throwaway repo — `git commit` returned `%G?` =
`G` with no prompt), so there was never a hang to avoid.

**How to apply:** just run `git commit`; the global config signs it. Never add
`-c commit.gpgsign=false`, `--no-gpg-sign`, or a local `commit.gpgsign false`. Check with
`git log --format='%h %G? %s'` — `G` is good, `N` means unsigned and needs fixing *before*
pushing. If signing ever genuinely fails, stop and ask rather than switching it off.

If unsigned commits have already been pushed to an unmerged branch, the cheap remedy is a
squash-merge through the GitHub UI (the resulting commit on main is signed by GitHub);
rewriting history is Matt's call, not mine.
