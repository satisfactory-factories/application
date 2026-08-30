# Remove the raw-input assumption, and a wizard to migrate to it

## Context

PR #503 made extraction a first-class product and added a switch to turn the raw-input assumption
off. The switch is the mistake. It leaves two ways for a plan to mean something, and the two
interact badly — the bug that prompted this was a factory mining 100 of the 180 limestone it needs
and reading fully green, because `rawChipReason` returned `extracted` before it could ever report
that the other 80 was being assumed. That is one instance of a class. Every feature downstream of
raw supply now has to ask "assumed or not?", and the answer is invisible on the card.

So the assumption goes entirely. Raw resources are mined or imported, like everything else. This is
a **breaking change** and gets announced as one — plans that were green will show shortages.

The exception, and it is decided by the game data rather than by a setting: **11 of the 24 raw
resources have no extractor of any kind.** Leaves, Wood, Mycelia, the four alien remains, the three
power slugs and the FICSMAS Gift are walk-up-and-press-E items. They feed real recipes — Fabric,
Alternate: Charcoal, all Biomass, the Proteins, Power Shard, and three Biomass Burner fuels — so
demanding they be mined would leave those factories permanently red with nothing the planner could
offer. They stay satisfied and say so.

That is the shape of the fix worth noticing: **the assumption does not leave the engine, it becomes
data-driven.** `calculatePartRaw` tops a raw part up if and only if nothing in the game data can
extract it. No setting, no mode, no per-factory flag, and no way for two plans to disagree.

Removing it without help would be cruel, so the same change ships a **Raw Resources Wizard**: every
factory with a now-broken raw resource in one table, one row per item, four choices per row.

### Decisions taken up front

- Un-mineable raws stay satisfied, wearing an amber **Manually gathered** chip. The chip is amber;
  the **factory stays green** — there is no action available, so it must not demote the card.
- **One mine factory per resource, plan-wide.** Every row that chose "mine" for Iron Ore feeds one
  `Iron Ore Mine` sized to their total, exporting to each. Not one per row.
- **Mark and purity are picked once**, at the top of the wizard, default Mk.2 on normal.
- A fourth choice, **Import from an existing factory**, appears only where the plan already has a
  factory extracting that resource, and is preselected there.
- **Water defaults to on-site.**
- The wizard **stays available** from Options, not just on migration day.
- **Apply is transactional**: built off-plan, validated whole, committed in one pass (§3.4).
- The **Options dialog stays** and hosts the wizard button; the switch inside it goes.
- All of it lands in **PR #503**, because trunk deploys mean splitting it is a window in which
  users hit unfixable red plans.

### What the Codex plan review changed

The review returned `RETHINK`. The engine half survived; the wizard half was "a thin loop over a UI
helper without atomicity, revalidation, or a complete extraction model". Accepted and folded in:

- **Resource wells are not auto-creatable.** `getExtractionRecipeForPart` excludes wells on purpose
  (`extraction.ts:66-75`): auto-sizing one multiplies pressurizers instead of satellites and lands
  an order of magnitude out while reading as solved. Nitrogen Gas is well-only. §3.2.
- **The hand-gathered rule must count wells**, or Nitrogen classifies as hand-gathered and its
  shortages vanish silently — the opposite failure, and a worse one. §1.
- **Apply must be atomic**; `addFactory()` persists per call, so a throw mid-run saves orphan
  mines. §3.4.
- **`addShortageToFactory` discards the recipe when a product already exists**, so "import from a
  mine" could expand an unpackaging chain instead. §3.3.
- Its `Math.abs` would convert a surplus into production if a bad amount were passed in. §3.5.
- `addProductToFactory` creates the building group immediately, so setting mark and purity
  afterwards is unproven rather than obviously fine. §3.6.
- A module-level set derived from a per-call `gameData` argument is incoherent. §1.

Rejected, with reasons: capturing the shortfall at open time is *safer* than re-reading it at Apply,
because the modal blocks editing and re-reading is what breaks the summary's promise — the missing
piece is revalidation, not live reads (§3.5). Losing per-factory overrides is a deliberate call, not
an oversight.

Measured rather than assumed since the review: with the assumption removed, the **Complex Demo Plan
loses only 1 of 10 factories** (Uranium Power — Stone, Sulfur, Water, Uranium) and the Mining Demo
Plan none. The fixture risk is one factory, not a rewrite.

## Tasks

- Remove the raw-input assumption from the engine and its plumbing.
- Treat the 11 un-mineable raw resources as "Manually gathered".
- Build the Raw Resources Wizard table and apply logic.
- Make the wizard's Apply transactional, with a summary step and row revalidation.
- Rewrite the raw-resources modals as a breaking change.
- Update specs, fixtures and demo plans for the removal.
- Update the docs, changelog and PR #503 body for the breaking change.

---

## 1. Removing the assumption

`web/src/utils/factory-management/settings.ts` holds nothing but this setting — **delete the file**.

`parts.ts` — `factoryAssumesRawInputs` goes. `calculatePartRaw` keeps its shortfall arithmetic
(already correct per #431) and changes only what it does with the result:

```ts
partData.amountSuppliedViaRaw = isHandGathered(part, gameData) ? shortfall : 0
```

**The classification rule is "no extractor exists", not "no recipe produces it".** It must count
**wells**, otherwise Nitrogen Gas — extractable only by a Resource Well Pressurizer — is classed as
hand-gathered and every Nitrogen shortage in every plan disappears without a trace. This is
deliberately *not* `getExtractionRecipeForPart`, which excludes wells for the unrelated reason in
§3.2. Two questions, two helpers; comment the distinction where both are defined, because they look
interchangeable and are not.

Memoise per game-data object, not once at module load — `calculatePartRaw` is parameterised by
`gameData` and specs pass their own. A `WeakMap<DataInterface, Set<string>>` keyed on identity gives
the hot-loop cost of a module constant without the staleness.

Pin the classification with a spec asserting **exactly** the 11 expected ids. Game data is versioned
and regenerated; without that test, a future recipe addition silently converts a hand-gathered
resource into a mandatory planned input, or the reverse.

**Interfaces** — drop `Factory.assumeRawInputs` and `FactoryTab.assumeRawInputs`, and the field from
`newFactory()`.

**`app-store.ts`** — remove `assumeRawInputs`, `legacyRawAssumption`, `applyAssumeRawInputs`,
`planPredatesMining`, `resolvePlanAssumption`, `setAssumeRawInputsSetting`, `rearmRawAssumption` and
`answerRawAssumptionPrompt`, plus the `addTab` parameter and the tab-index watcher's call. Keep a
seen-once flag for the new notice. Strip the dead fields from saved plans in the existing
load-migration path.

**`status.ts`** — `rawShortage`'s `detect` drops its `factoryAssumesRawInputs` guard and its import.
Hand-gathered parts need no special case: they come out satisfied, so `!satisfied` excludes them.

**`satisfaction.ts`** — `isAssumedRaw` becomes `isHandGathered`, keeping shortage buttons off rows
nobody can act on. `rawChipReason` stops being an either/or enum: extraction, import and gathering
are independent facts, and encoding them as one mutually exclusive value is what produced the
original bug. Split into independent predicates like every other chip on that row.

**`inputs.ts`** — `calculateAbleToImport`'s `rawOnly` branch was gated on the assumption; ungate it.

**Components** — the switch in `OptionsDialog.vue` becomes the wizard button; the three-way override
in `imports/RawResources.vue` goes; `Templates.vue` loses `rawAssumption`; `PlannerGlobalActions.vue`
loses the clipboard payload key.

## 2. Manually gathered

Amber **Manually gathered** chip in the name column in place of the cyan `Raw` chip; the amount in
the balance column, matching the shape the assumed chip already uses.

Needs a semantic `sf-chip` alias in `global.scss` resolving to `--sf-status-warning` /
`--sf-status-warning-border`, outlined like its neighbours. Not `.orange` — that is `--sf-building`,
an item colour, and `colors.ts` is explicit about item colours not doubling as status colours.

Icon must be verified against the vendored FA5-era kit before use: an unknown name still renders an
`<svg>` filled with a 1408-character placeholder, so it fails silently and looks like nothing.
Static grepping of the minified bundle proved unreliable — use the browser probe.

## 3. The wizard

Logic in a pure `utils/factory-management/raw-wizard.ts`; rendering in
`components/planner/RawResourcesWizard.vue`. All the risk is in the logic, and it should be testable
without mounting anything.

### 3.1 Rows

```ts
type WizardChoice = 'mine' | 'onsite' | 'import' | 'ignore'

interface WizardRow {
  factoryId: number
  partId: string
  shortfall: number      // captured at open, revalidated at apply
  choice: WizardChoice
  importFrom?: number
  candidates: number[]
  wellOnly: boolean      // no auto-create possible — see 3.2
}
```

Every factory in the current tab, every part where `isRaw && !satisfied`. Hand-gathered parts never
qualify. Power-only factories are included and should be: `rawShortage` deliberately has no
`hasNoProducts` guard, so a coal generator short of Coal is a real shortage.

Defaults: an extracting producer already in the plan → `import`; Water → `onsite`; otherwise `mine`.

### 3.2 Resource wells cannot be created automatically

`getExtractionRecipeForPart` returns `undefined` for well-only resources by design — a well's rate
comes from its satellite field, and solving a target rate against a fresh one-satellite group
multiplies the *pressurizer*, turning 600 m³/min into ten 150 MW pressurizers where one would do.
That reads as a solved plan while being an order of magnitude out.

**Nitrogen Gas is well-only.** So `mine` and `onsite` are unavailable on those rows: the wizard
offers `import` (where a producer exists) and `ignore`, and says why — a well has to be placed and
its satellites described by hand. Getting this wrong is worse than not offering it, because the
resulting plan looks finished.

### 3.3 Recipe identity on both apply paths

`addShortageToFactory` bumps an existing product and **discards the recipe argument**
(`satisfaction.ts:69-78`). A factory may already produce Water, Oil or Nitrogen by unpackaging, as a
byproduct, or via an alternate. Bumping that is not what "import from a mine" says on the tin — it
expands an unrelated chain and creates demand for its ingredients.

So both apply paths must match on **recipe kind, not just part id**:

- **Import candidates** are factories with an *extraction* product for that part. A factory that
  unpackages Water is not a mine and is not offered.
- **On-site and mine** add-or-bump only an existing *extraction* product for that part. Anything
  else means adding a separate extraction product alongside it.

### 3.4 Apply is transactional

`addFactory()` emits `factoryUpdated` and calls `schedulePersist()` per call, so incremental
mutation can persist orphan mines if anything throws mid-run. Instead:

1. Deep-clone the tab's factories into a working set.
2. Revalidate every row against it (§3.5). Any failure aborts the whole apply with a message —
   nothing is written.
3. Create the mine factories in the working set, assigning ids with the plan visible so the
   collision repair that normally lives in `addFactory()` is done up front rather than lost.
4. Apply every row's mutation to the working set.
5. Run `calculateFactories()` once over the working set and confirm it completes.
6. Commit: splice the working set into the store in one pass, emit once, persist once.

The commit is the only step that touches saved state, and it is the one step that cannot fail
partway. Bypassing `addFactory()` means the wizard owns the ID-collision check — that is the point,
not an oversight.

### 3.5 Revalidation and the shared primitive

Rows carry the shortfall captured when the table was read. The modal blocks editing, so this is the
number shown in the summary and the number that should be applied — re-reading `amountRemaining` at
Apply is what would let the two diverge. What is missing is a check, not a live read: before
applying, confirm each row's factory still exists, still has that part, and still reports the same
shortfall; and that the chosen import target still exists and still extracts it. Anything else
aborts.

`addShortageToFactory` gains a **required** `amount` parameter, validated finite and `> 0`, and
loses its internal `Math.abs` — silently converting a negative into production is exactly the bug
that guard would hide. Its two existing callers (`PlannerFactorySatisfactionItems.vue:505`,
`AddShortageDialog.vue:120`) pass `Math.abs(part.amountRemaining)`, which is what the function
computes for them today, so their behaviour is unchanged. Its two existing spec cases cover that.

### 3.6 Mark and purity on created mines

`addProductToFactory` calls `calculateProductBuildings` and `addProductBuildingGroup` immediately
(`products.ts:59,62`), so the group exists with default extraction settings before the wizard can
set anything. Setting `extractorBuilding` and `purity` afterwards and running a normal recalculation
is **not established** to resize the group rather than preserve it — the engine treats groups
differently by calculation origin.

Prove it with a spec before relying on it: a created mine must end with the chosen mark and purity
*and* a building count consistent with them. If a plain recalculation does not do it, drive the same
handler `BuildingGroup.vue` uses for a user-originated change (`origin: 'buildingGroup'`), which is
the path already known to write a group change up to the product.

The mark/purity control only governs the ten solid ores — Water and Crude Oil have one extractor
each. Label it for what it governs.

Empty state: "Nothing to fix — every raw resource in this plan is mined or imported."

## 4. Summary step and modals

Before applying: *"This will create 4 mine factories (Iron Ore Mine, Coal Mine, …), add 6 products
and wire 11 imports."* The counts must be derived from the same pass that applies, not computed
separately, or the summary can promise something the apply does not do.

The announcement modal loses its yes/no question — there is no setting left to answer. It becomes a
breaking-change notice: what changed, that existing plans will now show shortages, and the wizard as
the primary action. It must not block: dismissing it has to leave a usable plan. The seen-once flag
stays.

## 5. Tests

- `parts.spec.ts` — hand-gathered raws topped up; mineable raws not; **Nitrogen classified as
  extractable, not hand-gathered**; the partial case (mine 100 of 180) leaves a real 80 shortfall.
- A spec pinning the exact 11 hand-gathered ids, so a game-data regeneration cannot reclassify one
  silently.
- `raw-wizard.spec.ts` — row collection including power-only factories; Water and import-candidate
  defaults; one mine per resource across several consumers; each choice's effect; summary counts
  matching what applies.
- **Destructive cases, which matter more than the counts** — a throw partway through Apply leaves
  the saved plan untouched; an ID collision is repaired; a factory deleted while the wizard is open
  aborts; a changed shortfall aborts; a repeated/double-clicked Apply does not double-apply; a
  well-only row cannot be assigned `mine`; an existing *non-extraction* product for the same raw is
  not bumped.
- `satisfaction.spec.ts` / `status.spec.ts` — chips and the ungated `rawShortage`.
- Delete the assumption cases in `settings.spec.ts` (with the file), `mining.spec.ts`,
  `inputs.spec.ts` and the four plan-default cases in `app-store.spec.ts`.
- `complex-demo-plan.ts` — Uranium Power is the one factory that goes short. Decide whether the demo
  gains mining or imports for it; nothing else needs touching.

## 6. Verification

`cd web && pnpm test`, `cd parsing && pnpm test`, `pnpm lint`, `cd web && pnpm build`.

In the browser: load a plan built before this, confirm the breaking-change notice reads as one and
dismisses cleanly; run the wizard; confirm Water rows preselect on-site, a row with an existing mine
preselects import, and a Nitrogen row offers no mine option; check the summary counts match what
lands; apply, and confirm one mine per resource rather than one per consumer, with the chosen mark
and purity actually on the groups. Then confirm a Fabric or Biomass Burner factory shows the amber
gathered chip and stays green.

## Risks

- **The PR gets bigger**, and it was already large. Trunk deploys make splitting it worse.
- **`addShortageToFactory` gains a required parameter** and is used by two existing shortage buttons
  — a shared primitive changing under a feature that is not this one.
- **§3.6 is the step most likely to go wrong**, because it depends on engine behaviour that has not
  been demonstrated rather than on anything being written here. Prove it early; if a plain
  recalculation does not resize the group, that is a bigger detour than it looks.
- The wizard writes a lot at once. §3.4 is what makes that safe, and it is the part with no
  precedent elsewhere in this codebase.
