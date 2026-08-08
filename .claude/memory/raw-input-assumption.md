---
name: raw-input-assumption
description: Raw resources are no longer assumed to be supplied — the only exception is decided by the game data, and getting that rule wrong silently erases shortages
metadata:
  node_type: memory
  type: project
  originSessionId: 69e1d33d-d5de-48d6-b095-1de878166bc4
  modified: 2026-08-08T01:56:15.347Z
---

Raw resources are mined or imported like anything else. There is **no setting** — no
`factory.assumeRawInputs`, no plan default, no `factory-management/settings.ts`. An optional
assumption meant two people could open the same plan and see different things, with nothing on
screen saying so, and every feature downstream of raw supply had to ask "assumed or not?".

The assumption did not leave the engine, it became **data-driven**. `calculatePartRaw` tops a raw
part up if and only if nothing in the game data can extract it:

```ts
partData.amountSuppliedViaRaw = getHandGatheredParts(gameData).has(part) ? shortfall : 0
```

That is 11 of the 24 raw resources — Leaves, Wood, Mycelia, the four alien remains, the three power
slugs and the FICSMAS Gift. They have no producing recipe of any kind, so demanding they be mined
would leave Fabric, Charcoal, Biomass and Protein factories permanently red with nothing the planner
could offer. They wear an amber "Manually gathered" chip; the factory itself stays green.

**The trap worth remembering.** The classification rule is "no extractor exists", and it *must
count resource wells*. `getExtractionRecipeForPart` deliberately **excludes** wells, and reusing it
here would class well-only Nitrogen Gas as hand-gathered — silently erasing every Nitrogen shortage
in every plan. Two questions that look identical and are not:

- "does an extractor exist at all?" → classification (wells included)
- "can the wizard create one automatically?" → `getExtractionRecipeForPart` (wells excluded, because
  solving a target rate against a fresh one-satellite well multiplies the *pressurizer* and lands an
  order of magnitude out while reading as a solved plan)

`getHandGatheredParts` memoises on a `WeakMap` keyed by the `gameData` object, not once at module
load — `calculatePartRaw` is parameterised by `gameData` and specs pass their own. `parts.spec.ts`
pins the exact 11 ids, because game data is versioned and a regeneration could otherwise reclassify
a resource without anyone noticing.

**Downstream, nothing else needs to know.** Hand-gathered parts leave the engine satisfied, so
`status.ts`'s `rawShortage` and every shortage-button predicate are already excluded by their
existing `!part.satisfied` check. The UI test for the chip is simply
`part.isRaw && part.amountSuppliedViaRaw > 0`, since that is only ever non-zero for them now.

See [[raw-resources-wizard]] for the migration tool, and [[extraction-output-multiplier]] for the
mining feature this serves.
