---
name: vuetify-4-migration-checklist
description: "Verified execution checklist for Vuetify 3.12→4.1 (Phase 5 of dependency modernization), prepared 2026-07-20"
metadata: 
  node_type: memory
  type: project
  originSessionId: 10734531-3141-4073-a0f3-a96bbbd7d690
---

Part of [[dependency-modernization-plan]]. Facts verified against raw vuetify docs/source (v4.1.5) + local audit. Prereqs all in place (vue 3.5.40, vite-plugin-vuetify 2.1.3 "supports vuetify 4", Vite 7).

Execution checklist:
1. `pnpm add vuetify@^4.1.5` in web.
2. **Typography (biggest)**: MD2 `text-*` classes REMOVED in v4. App uses them 130× (body-1 ×34, h5 ×28, h6 ×25, body-2 ×15, h4 ×14, subtitle-1 ×4, h1-h3 ×9, caption ×1) AND global.scss:214 already overrides h1–h6 sizes with !important ("dial back vuetify text sizes"). Plan: define the used MD2 classes fully in global.scss (keep class names, app keeps exact current look) instead of the 200-line Sass revert or codemod renames.
3. **CSS reset removal**: 150+ raw h1–h6/p/ul in templates get browser margins back. Add the documented "light revert" to global.scss: `@layer vuetify-core.reset { ul,ol,figure{padding:0;margin:0} h1..h6,p{margin:0} }` (must load after vuetify styles).
4. **Cascade layers**: v4 puts ALL its styles in @layer (vuetify-core/-components/-overrides/-utilities/-final) → unlayered global.scss now always beats Vuetify. Visual QA for overrides that previously lost.
5. **Grid**: `<v-row dense>` ×3 in PartPanel.vue (USER's WIP file — coordinate!) → `density="compact"`; `<v-row justify="center">` in AppFooter.vue → `class="justify-center"`. Gap-based gutters may shift layouts; legacy revert CSS documented (grid-legacy-mode.md) if needed.
6. **Breakpoints changed** (md 960→840, lg 1280→1145, xl 1920→1545): app uses smAndDown/lgAndUp heavily. For zero behavior change add `display: { thresholds: { md: 960, lg: 1280, xl: 1920, xxl: 2560 } }` to createVuetify.
7. **VBtn uppercase removed** (128 v-btns): to keep look, `defaults: { VBtn: { class: 'text-uppercase' } }` — decide with user.
8. Theme default now 'system' — we set defaultTheme:'dark' explicitly, unaffected. Icons `vuetify/iconsets/fa` still valid. `defaults: { VNumberInput: { precision: null } }` still correct (v4 skips `undefined` in defaults, use null — we do). VNumberInput no longer clamps model to min/max on mount (PR #21826).
9. Non-issues verified: no elevation >5 usage, no VForm slot-prop usage, no fill-height, no snackbar multi-line, no @layer refs, no labs imports, select/autocomplete `item` slot not used (PlannerFactoryList #item is vuedraggable's).
10. Verify: build/tests/lint + before/after screenshots via puppeteer (headless chromium, port from vite output; kill server after — port 3001 is the test fixture port).
