---
name: project-v07-sync-release
description: Beta v0.7 shipped realtime sync, rooms and offline mode; supersedes the tab-sync-v2 plan, and the launch deck is still outstanding
metadata:
  node_type: memory
  type: project
  volatility: hot
  lastVerified: 2026-09-09
---

Beta v0.7, "Realtime sync, rooms and offline mode", is merged and live. `main` is at v0.7.0
(#674) plus the live-cutover hotfix #678. The `beta7` branch it was built on is deleted.

This supersedes the earlier `tab-sync-v2` plan, which is wrong in two ways worth knowing: that
branch no longer exists, and it stated rooms and WebSockets were explicitly *not* being done
yet. Both shipped. The backend was rewritten in NestJS with a shared package holding the
message formats, plan schema and protocol version.

Still outstanding at the time of writing: the in-app Change Log page
(`web/src/pages/changelog.vue`) covers only the pre-sync half of v0.7 and still says "In
development"; `CHANGELOG.md` is complete but also unstamped; and the "What's new" splash deck
for v0.7 does not exist. Plan for the deck:
`.claude/plans/update7-changelog-and-splash.md`.

**Why:** the sync rework spanned several sessions and branches, so the branch name in the older
memory was the obvious thing to go looking for and it is a dead end.

**How to apply:** read `CHANGELOG.md` for what v0.7 actually contains, not the Change Log page,
until the page catches up. See [[feedback-scope-plans-per-session]] and
[[stale-branch-cherry-pick-not-merge]].
