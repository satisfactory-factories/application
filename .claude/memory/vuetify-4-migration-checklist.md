---
name: vuetify-4-migration-checklist
description: "Vuetify 3.12→4.1 migration — executed on branch feat/vuetify-4 (PR #490), with the cascade-layer traps that only screenshot diffing found"
metadata: 
  node_type: memory
  type: project
  originSessionId: 10734531-3141-4073-a0f3-a96bbbd7d690
  modified: 2026-07-28T17:42:10.465Z
---

Part of [[dependency-modernization-plan]]. **Done 2026-07-28** on branch `feat/vuetify-4` → PR #490, which supersedes Renovate's bare bump #484 (a feature branch because Vercel ignores `renovate/*`). Everything lives in `web/src/assets/styles/global.scss` (compat block at the top), `vuetify-settings.scss`, `plugins/vuetify.ts` and `index.html`.

What actually mattered, in order of how hard it was to find:

1. **Cascade layers invert the app's relationship with Vuetify.** v4 puts all its CSS in `@layer`; unlayered rules beat layered ones regardless of specificity, so `global.scss` now wins by default where it used to lose. Two real bugs came from this, neither visible by reading the upgrade guide:
   - Font Awesome injects an **unlayered** `.svg-inline--fa { font-size: inherit }` at runtime, so **every icon in the app** shrank to its parent's font size (18px→14px in a button). Fix: `.svg-inline--fa.v-icon { font-size: revert-layer }` — defers to Vuetify's cascade instead of hardcoding, so component rules that outrank `.v-icon--size-*` (28px `.v-alert__prepend`) still win. Same trick fixed our `.fa-bolt` margin vs `mr-1`.
   - **Production-only, invisible in dev**: layers rank by first declaration and the build splits Vuetify's CSS per component, so a component chunk declares `vuetify-components` before the entrypoint declares `vuetify-core` → core sorts last and its reset's `button, input, optgroup, select, textarea { font: inherit }` beats every component's styles (buttons 16px/24px instead of 14px/normal). Fix: bare `@layer vuetify-core, vuetify-components, vuetify-overrides, vuetify-utilities, vuetify-final;` in a `<style>` in `index.html` `<head>`. **Latent in any v4 bump, including #484.**
2. **Breakpoints must be pinned in Sass, not just JS.** `display.thresholds` only moves `useDisplay()`; the media queries behind `.d-*`, `.v-col-*` and `.v-container` are compiled in. So `vite-plugin-vuetify` now takes `styles: { configFile: 'src/assets/styles/vuetify-settings.scss' }` setting `$grid-breakpoints` to the v3 scale (+6% build time). `$container-max-widths` derives from it, so container widths come back too — that alone was a ~100px horizontal shift on /parts.
3. **Typography**: `.text-h1`–`.text-h6` were already redefined in global.scss but only for size/weight — **letter-spacing came from Vuetify** and had to be added (h3/h5 need an explicit `normal`, which resets tracking inherited from the card). Plus `body-1`/`body-2`/`subtitle-1`/`caption`, declared in `@layer vuetify-core` with `!important` on size/letter-spacing and plain line-height: that reproduces v3's cascade exactly, because `!important` inverts layer precedence. (Earlier note that `text-body-1` was a no-op was wrong — it's 16px vs `.v-card-text`'s 14px.)
4. **Grid**: v4 swapped negative-margin gutters for `gap`. Restored v3 geometry in `@layer vuetify-components` (zero the gap vars — doubled `.v-row.v-row` since component CSS imports after global.scss — plus `.v-col { padding: 12px }`, *not* scoped to `.v-row >`: v3 padded every column regardless of parent and the app has cols that aren't direct row children). `<v-row dense>` → `density="compact"`: v4's own deprecation message says `comfortable` and is **wrong** (16px; v3 dense was 8px = compact).
5. Reset + VBtn: v3's `* { margin:0; padding:0 }` is gone (334 raw elements), restored in `@layer vuetify-core.reset`. VBtn lost uppercase *and* tracking — both restored in `@layer vuetify-components` (not a `defaults: { VBtn: { class } }`, which would beat `.text-none` on the factory tabs).
6. Non-issues, verified: no elevation >5, no VForm slot props, no fill-height, no snackbar multi-line, no labs imports, select/autocomplete `item` slot unused, no `rgba(var(--v-theme-*))`, no `offset-*` classes. `defaultTheme: 'dark'` and `VNumberInput: { precision: null }` still correct.

**Method worth reusing**: puppeteer screenshot diff, two vite servers side by side, PIL pixel diff at >32/255. Always capture the baseline **twice against itself** first — it comes out at 0px, which is what makes a 0.9% residual trustworthy. And diff **production builds** (`vite preview` over `dist/`), not just dev: baseline dev-vs-prod is 0px, so when the migration showed 7% it exposed the layer-ordering bug. Final state: changelog pixel-identical, parts 0.05%, planner 0.88%, factory 0.93%, all sub-pixel text antialiasing, and dev-vs-prod 0px on all four.
