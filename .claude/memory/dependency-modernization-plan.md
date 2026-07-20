---
name: dependency-modernization-plan
description: State and constraints of the phased dependency-upgrade programme started 2026-07-19
metadata: 
  node_type: memory
  type: project
  originSessionId: 10734531-3141-4073-a0f3-a96bbbd7d690
---

Phased dependency modernization started 2026-07-19. Done & committed: Phase 0 patch/minors (b5eb66c), Phase 1 Vite 7 + Vitest 4 — zero web vulns (010a284), Phase 2 ESLint 9 flat config (8310ffa: neostandard+vue10+vueTs14 in web with vuetify-v1 rules ported; typescript-eslint+import-x in backend/parsing; no-explicit-any/ban-ts-comment kept off in web to preserve baseline). Phase 3 TS 6.0 + vue-tsc 3 done (8465800: tsconfigs lost baseUrl, backend on nodenext, macro imports removed). Phase 4 done (4ece8f4: vue-router 5 w/ vue-router/vite plugin, layouts-next, pinia 4 + @pinia/testing 2, unplugins 21/32/2 — browser-verified via puppeteer on chromium). Next: Phase 5 Vuetify 4, Phase 6 backend majors (express 5, mongoose 9, bcryptjs 3, ts-node→native), Phase 7 Jest 30, Phase 8 later (ESLint 10, Vite 8 Rolldown, TS 7, Vue 3.6, Node 26 CI). Vitest 4 CLI gotcha: `--silent <file>` misparses — use `--silent=true` or drop the flag.

Key constraints discovered (verified against npm registry July 2026):
- **TypeScript ceiling is 6.0.x**, not 7: TS 7 (Go-native) has no stable programmatic API until 7.1, so vue-tsc, typescript-eslint (`<6.1.0` peer) and ts-jest (`<7` peer) all break on it.
- **ESLint target is 9 flat config**, not 10: `eslint-config-standard` is dead (ESLint 8 only); successor is `neostandard` which peers on ESLint 9 only. `--ignore-path` and eslintrc die in ESLint 10.
- **vue-router pinned `~4.4.5`**: 4.5+/4.6 ships a `vue-router/auto` d.ts stub incompatible with unplugin-vue-router 0.10.x. Resolved in the vue-router 5 phase (unplugin-vue-router was merged into vue-router core; `vite-plugin-vue-layouts` successor is `vite-plugin-vue-layouts-next`).
- **Node 26 backend crash is fixed** (jsonwebtoken 9.0.3 dropped SlowBuffer); CLAUDE.md/AGENTS.md updated. Node 24 stays for CI until 26 hits LTS (Oct 2026).
- Vuetify stable VNumberInput gotchas (vs labs): `precision` defaults to 0 → global default `precision: null` set in `src/plugins/vuetify.ts` AND `src/utils/ui-test-bootstrap.ts` (keep in sync); `v-model.number` breaks it (modelModifiers forwarded to VTextField make it emit numbers, `inputText` setter throws on `.replace`) → removed from all v-number-inputs; out-of-range typed values only clamp on blur → app-side clamping (somersloops) must not use `:max`.
- calculateFactory now re-runs itself once when a building-group sync changes item amounts (`groupResync` mode flag) — previously masked by a labs VNumberInput re-emit quirk.
