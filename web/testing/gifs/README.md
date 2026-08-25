# Tutorial GIF recorder

Drives the planner in headless Chromium and records scripted demos as GIFs, with a visible
cursor that glides between controls, a green press on each click, and highlight boxes that
frame the values being changed. Output is what `BuildingGroupTutorial.vue` embeds.

## Run

```bash
# from web/
VITE_ENV=dev pnpm exec vite --port 3005 --strictPort &   # warm it: curl localhost:3005 twice
node testing/gifs/record.mjs                 # all scenarios
node testing/gifs/record.mjs sync,overclock  # a subset
node testing/gifs/analyze-stability.mjs ../.gif-out/frames-sync
```

GIFs and frames land in `web/.gif-out/` (gitignored). Copy the ones you want into
`web/public/assets/tutorials/`. `GIF_OUT`, `PORT` and `CHROMIUM` override the defaults;
`GIF_DEBUG_HIGHLIGHT=1` logs each highlight box against the rects it is framing.

## Layout

| Piece | What it is |
| --- | --- |
| `record.mjs` | The engine plus the per-topic scenarios and the `SCENARIOS` table |
| `states/*.json` | Seed plans, injected as `localStorage.factoryTabs` before the app boots |
| `analyze-stability.mjs` | Frame-by-frame translation detector; must report 0 for every scenario |

## Adding a scenario

1. Build the starting plan in the app, then copy `localStorage.factoryTabs` into
   `states/<name>.json`. Note the factory id, item id and group id — scenarios address
   elements by the real DOM ids the components render (`${factory}-${item}-toggle-sync` etc.).
2. Write an `async (page, ctx, base) => { ... }` scenario from the helpers: `clickId`,
   `clickText`, `clickIncrement`, `setNumberInput`, `highlight`, `highlightTwo`, `holdFrames`.
3. Register it in `SCENARIOS` with its `base` and `maxGroups` — the peak number of building
   groups it ever shows, which is what the crop height is measured against.
4. Record it, then **run `analyze-stability.mjs` over its frames and look at real frames.**
   A recording can be perfectly stable and still show nothing happening; see
   `.claude/skills/tutorial-gifs/SKILL.md` for the traps this has actually hit.
