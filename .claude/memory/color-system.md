---
name: color-system
description: "Unified semantic color tokens for the web planner — use sfColors / --sf-* vars, never new literal hexes"
metadata: 
  node_type: memory
  type: project
  originSessionId: 56360a54-ad5e-44b5-86fa-26aae6e138ad
---

The web planner's colours are centralised in `web/src/utils/colors.ts` (created 2026-07-20). It is the **single source of truth**: a raw `palette` plus semantic `sfColors` tokens. `applySfColorVars()` runs once from `main.ts` and publishes every token as a `--sf-*` CSS custom property on `:root`.

**How to use colour going forward — do NOT introduce new literal hexes:**
- In SCSS: reference `var(--sf-<token>)` / `var(--sf-<token>-border)` (e.g. `var(--sf-power-consumption)`).
- In `.sf-chip` markup: use the semantic class — `.product`, `.byproduct`, `.raw-resource`, `.building`, `.import`, `.somersloop`, `.consumption`, `.generation`, `.circuit-boost`, `.peak-consumption`, `.success`, `.error`. Legacy colour-name classes (`.blue`, `.cyan`, `.orange`, `.green`, `.red`, `.sloop`, `.boost`, `.max-consumption`, `.yellow`) still work — they're aliased to the same vars in `global.scss` — but prefer the semantic name.
- In a `.vue` script (e.g. a Vuetify `color=` prop needing a real hex): `import { sfColors } from '@/utils/colors'` and bind `sfColors.circuitBoost.color`.

**Semantic tokens:** factory=white/`#7f7f7f` border/bg `rgba(43,43,43,0.4)` (shared with the card header bg — anything referencing another factory uses `.sf-chip.factory` or the `.factory-group-chip` pattern in PlannerFactory.vue), product=blue `#2196f3`, byproduct=light-blue `#4fc3f7`, rawResource=cyan `#a3ceff`, building=orange `#f57f17`, import=grey `#bdbdbd`, somersloop=purple `#bd67ff`, powerConsumption `#e59344`, powerGeneration `#9e9e9e`, circuitBoost `#9f6d9f`, peakConsumption `#5cb0c5`, success=green `#4caf50`, error=red `#f44336`, problem=border `#a00000`/bg `#4b171c` (bg deliberately OPAQUE — the old rgba(140,9,21,.4) composited differently per surface; that was the sidebar-vs-card mismatch).

Tokens may carry an optional `background` → published as `--sf-<name>-bg`.

**Still un-unified (flagged to user as follow-ups, not yet migrated):** Vuetify `color="error"` props resolve to Material pink `#cf6679` and `color="green"`/`color="red"`/`text-green` props to Material defaults — the fix is defining a theme palette in `plugins/vuetify.ts` mapped to sfColors (not yet done); Notice.vue/Toast.vue keep their own literal color maps; somersloop text in a couple of spots is still Vuetify `text-purple`. See [[dependency-modernization-plan]] context if touching plugins. A red-audit artifact documenting all this was published 2026-07-20.

Was the source of drift: consumption was `#e59344` in the power table but `.orange`/`yellow` as chips; generation was grey in the table but yellow as a chip; the sidebar power chips used the wrong icon (`fa-scale-balanced` vs the stats `fa-balance-scale`) and wrong colours before this unification.
