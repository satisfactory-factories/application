# Building group balancing: fractional clocks, per-group balancing, honest tolerance

Four related fixes to the building-group editor, all surfaced by the same plan: a Stone mine with
two groups (5 x Mk.1 impure @ 133.3333% = 200/min, 3 x Mk.1 normal @ 86% = 154.8/min) against a
product of 360/min.

## Tasks

1. Fix the fractional overclock solver so editing a group's part amount lands on the value typed.
2. Add per-building-group Satisfy / Trim buttons that close the whole gap on one group.
3. Show the shortfall as buildings for every product, not just mines, and colour it as buildings.
4. Make the balanced/imbalanced tolerance proportional and configurable, defaulting to 1%.
5. Show what each group costs in power shards and somersloops, and put the totals on the tray bar.

## 1. Fractional overclock solver (done)

`updateBuildingGroupViaPart` solved the clock with `Math.ceil(rawClock)`, so the clock could only
ever be a whole percent. Typing 150 into the 3-miner group solved to 84% and wrote back 151.2, and
any value that did not happen to land on a whole percent silently did nothing (154 stayed 154.8).

Fixed by solving the clock at 4 decimal places — the game's own clock precision, and the precision
every other solver in the file already uses. 150 now solves to 83.3333% = 150/min exactly.

Tests: the extraction case above, an ingredient case in `common.spec.ts`, and the browser-level
`BG-E-I-PROD-5` case that had been asserting the 40.2 the bug produced.

## 2. Per-group Satisfy / Trim

Today the only balancing actions are "Remainder to last" and "Remainder to new group", both of
which pick the group for you. Add a button on each group row instead:

- **Satisfy** when the item is under-producing: add the entire shortfall to this group.
- **Trim** when it is over-producing: take the entire surplus off this group.
- Nothing when the item is balanced. Disabled, with a reason, when this group cannot hold the
  change: a trim deeper than the group goes would need a clock under the game's 1% minimum, and
  1 building at 0.0001% is not something anyone can build.

Mechanically: target = this group's current effective output +/- the item's remainder. Keep the
group's building count and rescale the clock, which is the change the user is least surprised by;
only re-solve the count when the clock would leave the game's 1-250% range. A new solver rather
than `bestEffortUpdateBuildingCount`, which prefers re-solving the count, but it uses the same 4dp
clock precision as (1) — which is what makes the result land exactly. Node purity, extractor mark
and somersloops all reach it through `getGroupOutputMultiplier`, and a group that produces nothing
per building (a well with no satellites) is refused rather than divided by.

Both are absent under Sync by construction: sync keeps the item equal to its groups, so there is
never a gap to close.

Worked example: Satisfy on the 3-miner group takes it from 151.2 to 160/min, i.e. 88.8889%, and
the mine totals exactly 360.

## 3. Shortfall as buildings, in orange

The hints row ("To cover the shortfall, add: Impure: 1 | Normal: 0.5") is extraction-only and its
chips are cyan, the raw-resource colour. Cyan next to a bare number reads as "add 0.293 of
Limestone", when the figure is a count of miners.

- Recolour to orange, the colour the building-count chip already wears.
- Reword so the unit is stated rather than implied.
- Extend to non-extraction items, where the figure is simply the effective buildings short.

## 4. Proportional, configurable tolerance

`correct`/`over`/`under` in `BuildingGroups.vue` and `calculateBuildingGroupProblems` in the engine
both use a flat 0.1 effective buildings. On a mine one effective building is 60/min, so a 360/min
product reads "Balanced" while 6/min short. It is also backwards: the bigger the factory, the
tighter a flat tolerance should be, not looser.

Replace with a percentage of what the item is asking for, default 1% — 3.6/min on the 360/min mine.
The allowance stops growing past 10 effective buildings, so nothing is judged more loosely than it
is today: a straight 1% would give a 100-building factory a whole building of slack where it now
gets 0.1.

Expose it in the Options dialog as **Effective output tolerance** (0.1 / 0.5 / 1 / 2 / 5%, plus a
custom field), stored per browser in `usePlannerOptions` alongside the sidebar toggles, and
range-checked on restore — `typeof` alone lets a stored zero or negative through, which would paint
every plan red with nothing on screen to say why.

Under it sits a working building group rather than a paragraph: a Limestone mine whose amount,
building count, clock and output are all editable, starting 2/min adrift so the verdict changes as
the setting moves. It is a real `Factory` driven by the same engine calls the planner's own group
row makes, so it cannot demonstrate behaviour the planner does not have.

`balanceTolerance` is the single source of truth for both consumers. The status line reads it
through a computed, so it re-renders the moment the option changes; the engine's persisted
`buildingGroupsHaveProblem` does not, so changing the option forces a recalculation of the plan.

The building-group tutorial quotes "0.1 effective building margin of error" and is updated with it.

## 5. Shards and somersloops on show

A group at 133.3333% costs a power shard per building and never said so. Show the group's shard
cost inside the clock chip, where it is a cost of that clock, and the group's total somersloops
beside the per-building input for the same reason. Both appear only when there is a cost.

The tray bar carrying the totals gets the same treatment: chips rather than bare numbers, yellow
for shards and purple for somersloops, on a bar tall enough to seat them.
