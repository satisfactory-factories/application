---
name: factory-groups-invariant
description: Groups are denormalised onto each factory and expressed as a sort of the one flat array — both break silently if you forget
metadata:
  node_type: memory
  type: project
---

Two decisions underpin factory groups, and both fail quietly rather than loudly.

**The group record lives on the factory, not the tab.** `Factory.group` is the whole
`FactoryGroup`, copied onto every member. `FactoryTab.groups` holds only groups with no members
yet. This looks redundant until you look at what actually moves a plan: the cloud save payload is
a bare `Factory[]` (`sync-actions.ts`), `addTab()` rebuilds a tab from four named fields, and
templates and crash recovery all carry factories rather than tabs. A group held on the tab would
be dropped by every one of those, stranding factories that still claimed membership — and the
load-time repair would then clear them. Denormalised, every existing transport carries groups for
free and a cloud restore rebuilds the whole set from the factories alone. The cost is a
write-fanout: renaming or collapsing a group writes to N factories, which is also what gives group
edits their `factoryUpdated` emit and therefore their save and cloud-sync-dirty semantics.

**Grouping is a sort of the one flat factories array**, not a parallel structure:
group-contiguous, in group order, Ungrouped first, `displayOrder` still the index. The planner's
render loop, the scroll-spy's document-order scan and the summary table all read that array or
that index, so they needed no changes. Call `sortFactoriesByGroup()` after any structural change;
break the invariant and nothing throws, the plan just renders in an order the sidebar disagrees
with. Note the mutators reorder the array in place — never iterate `factories` while calling one.

**How to apply:** anything that moves a factory must go through
`utils/factory-management/factory-groups.ts`, and anything that changes group state through the
`useFactoryGroups` composable, which is the single writer (the sidebar is mounted twice at once,
so components must not hold their own copy of the ordering). Movement controls work *within* a
group: keyed on global position, the card's up/down buttons sat enabled at every group boundary
and silently did nothing. See also [[calc-engine-gotchas]] for the load-bearing pass order the
engine has, which this deliberately does not touch.

**A trap worth remembering beyond this feature:** vuedraggable switches Sortable's `draggable`
option to `[data-draggable]` as soon as a list has a header or footer slot, and marks each item's
root element with that attribute. A **multi-root** item component cannot receive a fallthrough
attribute, so the mark is silently dropped and Sortable matches no items — dragging does nothing,
with no error anywhere. Keep `PlannerSidebarFactoryRow` single-root.
