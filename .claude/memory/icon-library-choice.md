---
name: icon-library-choice
description: Why the planner runs Material Design Icons, and the two gaps MDI does not cover
metadata:
  node_type: memory
  type: project
---

Icons are **Material Design Icons** (`@mdi/font`, Apache-2.0), wired as Vuetify's `mdi` iconset
in `web/src/plugins/vuetify.ts`. Written as `<i class="mdi mdi-name" />`, same shape as the old
Font Awesome classes.

**Why:** the app previously shipped Font Awesome **Pro 5.15.4** as vendored JS committed to this
public repo — outside that licence, and ~1.6MB of render-time DOM replacement. Fifteen of the
icons in use were Pro-only, so Font Awesome Free was not a drop-in. MDI has ~7,400 free icons
and, unusually, the industrial vocabulary this app needs: `pickaxe`, `factory`, `dolly`, `tire`,
`truck-cargo-container`, `shovel`, `drone`, `chef-hat`.

**How to apply:** pick names from the MDI library and check they exist before using one — a
missing MDI class renders *nothing at all*, which is quiet but at least not a decoy glyph the
way Font Awesome's placeholder was. Two known gaps: **no conveyor-belt icon exists in any free
library** (Products uses `cog-transfer`; the game's own belt sprites are in
`web/public/assets/game/building/` if a literal one is ever wanted), and **MDI dropped brand
icons**, so Discord is an inlined Simple Icons glyph in `web/src/components/DiscordIcon.vue`.
See [[fontawesome-dynamic-icons]] — the wrapper-span workaround that FA needed is now obsolete.
