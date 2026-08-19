---
name: game-data-version-cache
description: "Regenerating gameData without bumping dataVersion leaves every existing browser on stale data — including mine, mid-branch"
metadata: 
  node_type: memory
  type: project
  originSessionId: 69e1d33d-d5de-48d6-b095-1de878166bc4
  modified: 2026-07-31T04:22:48.640Z
---

The planner caches the whole of `gameData` in `localStorage` keyed on `config.dataVersion`, and
`game-data-store.ts` only re-fetches when the stored version differs. So **any change to the game
data needs `dataVersion` bumped and the `web/public/gameData_v<version>.json` file renamed to
match — every time it is regenerated, not just once per release.**

**Why:** reusing a version string across regenerations is silent. Nothing errors; the browser
simply keeps serving the old JSON forever, and the new recipes appear to be missing from the app
even though they are correct on disk. This bit during the mining work: the data was regenerated
three times on one branch (extraction recipes, a display-name change, then resource wells) while
`dataVersion` stayed at `1.2-06`, so my browser was still running the first generation and
Nitrogen Gas looked like it had no extraction recipe.

**How to apply:** treat "regenerated the data" and "bumped the version" as one step, mid-branch as
much as at release. The suffix increments (`1.2-06` -> `1.2-07`); the number before the dash tracks
the game's minor version. Delete the old `gameData_*.json` so only one exists.

The trap is worse than it looks because **verification scripts that call `localStorage.clear()`
never reproduce it** — a cleared browser always downloads fresh. When a change depends on new game
data, check it at least once from a browser with the previous data already cached, or the one
failure mode that will actually reach me is the one thing that goes untested. See
[[verify-tab-navigation]] for the browser-driving setup those scripts use.
