# Plan: AWESOME Sink + Dimensional Depot on one axis (issues #498, #7)

Status: **executing**. One branch (`claude/dimensional-storage-awesome-sync-swp2fw`), one PR.

Supersedes the parts of `.claude/plans/498-dimensional-depot-tracking.md` and
`.claude/plans/awesome-sink-and-byproduct-routing.md` phases 1–2 that this delivers. The byproduct
*routing* half of the sink plan (phase 3: `byProductRouting`, recycle opt-out, "Divert to…" picker)
is **not** in scope here and that plan still owns it.

## The merge

The two features are one control, not two. A surplus has exactly three destinations:

1. **Another factory** — exports, already modelled.
2. **The Dimensional Depot** — finite storage. Defers a backlog; does not prevent one.
3. **An AWESOME Sink** — genuine disposal. The surplus is gone.

So both live in one new **Storage** column on the satisfaction table, left of Satisfaction, each a
plain number spinner: how many AWESOME Sinks, how many Dimensional Depot Uploaders.

## Decisions

1. **A sink count above zero sinks the WHOLE surplus.** The sink takes whatever the belt brings it,
   so the count is about what to build and what it draws, not a rate cap. Priority-splitter
   semantics: production, power and exports are real demand and always win; the sink only takes
   what is left, recomputed every calculation.
2. **A depot count does NOT change the ledger.** The depot is a container with a finite capacity.
   It fills, then it backs up. Modelling it as demand would tell the user their surplus is handled
   when it is only postponed.
3. **Only a sink clears the backlog advisory.** Follows from 2. Confirmed with the user 2026-08-19.
4. **AWESOME Sinks draw power: 30 MW each** (`Build_ResourceSink_C.mPowerConsumption`, Docs.json).
   The Dimensional Depot Uploader draws 0 MW. Confirmed with the user 2026-08-19.
4b. **The two exclusions are NOT the same.** The sink refuses fluids *and* radioactive items. The
   Uploader refuses fluids only — the wiki's [Radiation](https://satisfactory.wiki.gg/wiki/Radiation)
   page is explicit that uploading a radioactive part to the Depot stops its radiation, which is a
   reason players do it deliberately. So Uranium and Plutonium Waste can be depoted but not sunk,
   and `showDepotControl` asks the game data for `isFluid` rather than reusing `isSinkable`.
4c. **Upload speed is per Uploader and STACKS; storage does not.** 15/min unresearched, doubling
   with each of four upgrades to 240/min, and two Uploaders on one item fill at 480/min — verified
   against a patch-1.0 Steam thread, since the wiki only states the rate as a property of the
   building without addressing stacking. Depot *storage* is per item type and does not stack, which
   is why extra Uploaders buy fill speed rather than a bigger buffer. So capacity is
   `uploaders × rate`. The tier lives on `FactoryTab` beside `powerTarget`: it describes the world
   the plan is written against, so it has to travel with the plan rather than follow the browser.
   Absent means fully researched, which is what the statistics reported before the tier existed.
5. **Named "Dimensional Depot"**, the game's term — matching the shipped icons and the earlier
   plan's locked decision, not issue #498's "Dimension Storage". Confirmed with the user.
6. **One Mercer Sphere per Dimensional Depot Uploader.** Read off the game's own build recipe
   (`Recipe_CentralStorage_C`: 1 Mercer Sphere, 10 SAM Fluctuator, 10 Modular Frame, 100 Wire),
   not off a wiki page.
7. **The backlog advisory is a `warning`.** It shipped on the `note` tier first, which was the
   right call while nothing in the UI could act on it. With the Storage column in the same row there
   is now a control that fixes it, so it is amber and colours the factory amber — the user's call,
   2026-08-19. It stays switchable off in Options for a plan mid-build.
8. **The Depot never reports "nothing spare".** An Uploader is fed off a splitter, so it takes a
   share of everything that passes until it is full and then stops accepting: it is a buffer that
   fills once, not a consumer with a standing appetite. A steady-state surplus of zero therefore
   does NOT mean the Depot stays empty, so the `starved` warning that shipped first was modelling it
   as a consumer and contradicting decision 2. Removed rather than reworded; the one case where it
   really would stay empty — fed from the low-priority leg of a priority splitter, which no player
   would build — is a caveat in the tooltip on the zero.

9. **The controls are offered on every part, not only on a surplus.** The original surplus gate
   excluded the logistics factory — imports balanced exactly, no surplus, no Uploader offered —
   which is the build the Depot is for. The gate protected nothing: `amountRequiredSink` is
   `max(0, surplus)`, so a sink with nothing to take is already inert, and the Depot changes no
   number at all. User's call, 2026-08-19. The physical exclusions (fluids; radioactive for the
   sink) still stand, because those are facts about the buildings rather than judgements about
   the plan.

10. **A sunk part shows the whole surplus in both places, and the two are not additive.** The
   Codex build review called this a double count and I capped the Depot figure at what its
   Uploaders could take. That was wrong and has been reverted. The planner's model is a
   programmable splitter routing the excess to the sink, not a plain splitter halving the line,
   so the sink takes the whole surplus and nullifies it. The Depot is a finite buffer on the
   same line: it fills, then backs up until the player spends it, and nothing can know when that
   happens. So its intake is not modelled at all, and "Into Depot" is what the plan has spare
   rather than a rate it sustains. The assumption is now stated in the sink tooltip and under
   the Depot table, because the two figures do look addable. User's call, 2026-08-20.

11. **The research tiers travel with the plan, and absence clears rather than inherits.** They
   are on the tab, so every field-by-field transfer path had to be taught them: clipboard copy
   and paste, the backup download, the account restore, and the share link's `addTab`. Absent
   means fully researched, so a path that dropped them silently gave a tier-0 plan 16x the
   upload speed and hid every over-capacity row. Paste and restore assign them even when the
   incoming plan has none, for the same reason `groups` does: what is left otherwise belongs to
   the plan being replaced. A bare-array restore clears them for the same reason a legacy paste
   does. Raised by the Codex build review, 2026-08-20.

12. **The disposal map is repaired on load, and unknown part IDs are left alone.** A share link
   is another player's JSON, so the map arrives without ever having passed through the setters
   that sanitise it: a null record threw when the power total walked it, and a negative or
   string count reached the totals. `repairPartDisposal` applies the setters' own rule. Unknown
   parts stay, because the map is sticky by design and every reader already skips them. Raised
   by the Codex build review, 2026-08-20.

13. **A one-time explainer on the first sink, and another on the first Uploader.** Both keyed in
   localStorage (`tutorialAwesomeSink`, `tutorialDimensionalDepot`), per browser rather than per
   plan, because it is the player who needs telling and they need it whichever plan they are in.
   Separate keys so one does not silence the other. They follow the building group tutorial's
   pattern.

   The sink one states the two assumptions and nothing else: Programmable Splitters sending the
   excess, and a belt of adequate speed. Both are invisible in the numbers and neither can be
   checked from a plan. The Uploader one says where the plan-wide summary lives, and draws the
   line the engine actually holds: nothing is assumed about what an Uploader takes off the belt,
   only that it eventually backs up, which is what makes the surplus figures right again.
   User's call and wording, 2026-08-20.

   The Depot one carries a button straight to the section, and the section header carries one to
   the Mercer Sphere statistics, both styled as the section's own chips: `.sf-chip small
   dimensional-depot` for the violet text and border, pill-rounded, with only the tonal fill
   stated in the component, because a v-btn cannot resolve that from the token by itself. A dialog cannot reach the planner's
   jump helper, which unhides a collapsed section before scrolling, so it asks for the jump by id
   over the event bus (`jumpToSection`). The statistics card unhides for the Mercer anchor as
   well as its own id, or the jump lands on a section that is not on the page.

14. **The two research levels are settable from the statistics table as well.** Same tab fields,
   read and written through `useDepotResearch`, so a level typed in either place is the one the
   other shows; the composable holds no state of its own, which is what the new spec pins. The
   field sits under its label rather than beside it, because the Mercer column is a third of the
   statistics row and a level on the same line pushed the amounts off the card. No `:max` on the
   field and `:model-value` rather than `v-model`, per #vnumberinput-clamping: with a max set an
   out-of-range entry stops emitting at all, so the clamp never runs. User's call, 2026-08-20.

15. **The research tick boxes are Vuetify's.** They were drawn in CSS because Vuetify's FA
   aliases point at `far fa-square`, which this bundle does not ship. That reasoning was stale:
   `global.scss` already draws the marks for every `v-checkbox-btn` in the app, so the hand-rolled
   box was both redundant and the only one in the app that did not line up with its label.
   `inline` matters, because a selection control is `flex: 1 1 auto` by default and ate the cell.

## Data model

```ts
export interface FactoryPartDisposal { sinks: number; depots: number }
// on Factory, beside exportCalculator:
partDisposal?: { [partId: string]: FactoryPartDisposal }
```

Its own map rather than a field on `PartMetrics`, because `parts.ts` wipes and rebuilds
`factory.parts` every calculation. Sticky by design: never pruned when a part leaves the factory,
so bringing the part back restores the user's intent. Optional so old plans and existing spec
fixtures load unchanged; `newFactory` and `initFactories` still set `{}`.

Two new derived `PartMetrics` fields, both optional (derived every calculation, like `isSinkable`):

- `amountRequiredSink` — what the sinks take.
- `amountRemainingPreSink` — the surplus the part would carry if it were not being sunk. Exists so
  the display can show the number sinking removed.

## Engine

`parts.ts`, in `calculatePartMetrics`, **after** `calculatePartRaw` — sinking an ore surplus must
not pull more ore out of the world:

```
amountRemainingPreSink = amountSupplied - amountRequired
amountRequiredSink     = isSinkable && sinks > 0 ? max(0, amountRemainingPreSink) : 0
amountRequired        += amountRequiredSink
amountRemaining        = amountSupplied - amountRequired      // 0 for a fully sunk part
```

Falls out for free: `shouldShowFix` stops offering Trim on a deliberately-overproducing factory,
and `StatisticsItemsDifference` stops listing sunk parts as loose surplus.

`buildings.ts`, in `calculateFinalBuildingsAndPower`: `sinks × 30 MW` added to `consumed`,
`consumedMin` and `consumedMax` alike (the sink has no clock, so it does not swing).

## Status

New `willBacklog` note, plus three existing entries that stop being true once sinking is real:

- `potentialBlockage` and `noDemand` tooltips said "support for sinking is coming in a future
  update". It is here; both are rewritten to point at the Storage column.
- The `End product` chip said the planner "assumes you deliver it to the Space Elevator, or sink
  it". It no longer assumes — the user says so.

`willBacklog` fires on a significant surplus that no sink is taking. It does not need to test the
sink itself: a sunk part lands at `amountRemaining === 0`, so the surplus test already excludes it.
Suppressed where `potentialBlockage` or `noDemand` already says the same thing about the same part.
Declared above the `note` entries, because the registry is in severity order and the display sites
do not sort.

On by default, switchable off in Options (`showBacklogAdvisory`) — it is the kind of advice that
becomes nagging on a big plan.

## Statistics

- **New top-level `DimensionalDepot.vue` section**, its own card beside Statistics rather than
  inside it, purple header. One row per item: rate into the depot against what its Uploaders can
  take, container count, and a factory pill per contributor carrying that factory's own container
  count. Carries the MAM research selector. Rendered only when the plan actually uses the depot.
- **A sidebar jump-link** beneath the Global Factories Summary, same shape as that one, with
  icon-only chips (items, Uploaders, Mercer Spheres, plus over-capacity when it applies).
- **The trailing gap belongs to the last section**, not permanently to the Factories Summary — that
  is why `mb-4` moved out of `StatisticsFactorySummary.vue` and is bound in `Planner.vue` instead.
  Left as it was, adding a section after it double-spaced above and left none below.
- **A Mercer Sphere icon had to be added.** Every other icon came from greeny's collation, which has
  no Mercer Sphere because it is a collectable rather than a craftable part; this one comes from the
  wiki, noted in `attribution.txt`.
- **The Depot's panel is a deep violet** (`dimensionalDepotPanel`), a separate token from the accent
  the chips use: it has to sit under them without competing, and the muted mauve it started as read
  as grey over a dark card rather than as a colour at all.
- **The Depot's colour is sampled from the Mercer Sphere artwork** (`palette.mercerPurple`, the mean
  of its brightest saturated pixels). It previously shared `mutedPurple` with the Alien Power
  Augmenter's circuit boost and was too close to read apart; it is also magenta-leaning where the
  Somersloop's violet is blue-leaning, so a plan showing both alien trinkets separates by hue. The
  section header, its chips and the sidebar jump-link all draw from the one token.
- **Summary chips live in the section header**, not the body, so collapsing the section still leaves
  the totals on screen — the same reasoning as the power strip on a collapsed Statistics card.
- **`StatisticsShardsSloops.vue` gains a third column**, Mercer Spheres, at one per uploader, plus
  three tick-able research lines under the factories: upload research (`mercerSpheresForTier`: the
  2 unlock nodes + the upload upgrades to the plan's tier, 2 to 48), depot expansion
  (`mercerSpheresForExpansion`, 0 to 46) and the Manual Uploader (3). All off the total by default,
  because they are once-per-save costs. Per-node costs read off the MAM wiki page's Alien
  Technology chain; `disposal.spec.ts` asserts the three lines at full research reconcile to
  `DEPOT_RESEARCH_MERCER_SPHERES` (97), the figure the building page quotes for the whole chain.
- **Mercer Spheres are counted in exactly one place.** The Depot section's header chip, its sidebar
  chip and its caption all reported them too; three copies of one number is not three facts. The
  Depot section keeps both research selectors, because which tier a plan assumes is a decision
  about the Depot, and the statistics count what those decisions cost.
- **The depot table's three number columns are fixed** (350 / 200 / 150) so the factory-pill column
  takes the remainder. 350 fits "Electromagnetic Control Rod", the longest item name in the game
  data, plus its icon.

## Verification

- `parts.spec.ts` — sink bucket math, export shrinks the sunk amount, fluid/radioactive guards,
  raw supply unaffected.
- `status.spec.ts` — `willBacklog` on/off, suppression, tier.
- `statistics.spec.ts` — depot aggregation, Mercer Sphere totals.
- `satisfaction.spec.ts` / `disposal.spec.ts` — predicates and setters.
- `status-regression.spec.ts` must stay green: a note entry cannot change saved-plan colour.
- `pnpm lint` and the `vue-tsc` pass in `pnpm build`.
