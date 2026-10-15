---
name: recipe-unlocks
description: "How a loaded save decides which recipes and buildings are locked: the id mapping traps, why it is one tab field, and how the status chips read it"
metadata:
  node_type: memory
  type: project
  volatility: normal
  lastVerified: 2026-10-15
  originSessionId: d28e2716-3a09-4782-a1ed-106ce4e75bd2
  modified: 2026-10-15T15:48:05.284Z
---

A plan's unlocks live on the tab as `recipeUnlocks: { save: { name, readAt, recipes, buildings, tiers } | null, overrides }`
(`common/src/types/factory.ts`), synced like the depot tiers. `recipes` holds every unlocked recipe, standard and
alternate. Logic is in `web/src/utils/recipe-unlocks.ts`, the store-bound half in `composables/useRecipeUnlocks.ts`, the
UI in `components/GameOptionsDialog.vue` (the Game options button beside Options).

- **No save means nothing is locked.** `save: null` or an absent field both read as "everything unlocked", so old plans and
  users who never load a save see no change. A save stored in the older alternates-only shape also reads as no save.
- **One field, not two, so forgetting is sendable.** The sync diff treats an absent field as "unchanged", so a cleared save has
  to be a value (`{ save: null, overrides: {} }`). It is compared serialized, like `groups`, in `sync/room-state.ts`.
- **Map save names to game ids by membership, not by prefix.** The parser strips `Alternate_` into its own list, but Pure
  Aluminum Ingot is an alternate with no prefix (it sits in the save's standard list) and `Alternate_Turbofuel` is a
  standard recipe in the game data. `unlockedRecipesFromWorld` intersects the game data's recipe ids with everything the
  save made available, which gets both right.
- **The status chips read a leaf.** `status.ts` must not import the app store, so the store's watcher pushes the plan on
  screen into `setActiveRecipeUnlocks`; `recipeLocked` and `buildingLocked` read it. Warnings, never problems: the plan still
  adds up. `buildingLocked` skips products already `recipeLocked` so a product is named once.
- **A rebase merges three ways** (`rebaseRecipeUnlocks`, fed the baseline from before the snapshot replaced it), so a
  resend carries only this client's own padlocks and save. A whole-list resend would undo a peer's padlock.
- **A plan arriving without a save states the forgetting** (`unlocksForArrivingPlan`), or collaborators keep the old save.
- **A save with no recipes is refused**, with a player-facing reason per `SaveProblem` carried across the worker; otherwise it
  would load as a world with everything locked. The load reads unlocks only (`unlocksOnly`); buildings come from the build
  recipes, so the worker needs the game data's building ids passed in.
- **A hand mark that agrees with the save is dropped**, so the next save decides that recipe again. Marks survive a newer save;
  **Forget save** clears them.
- The save header's session name (4th string after three int32 versions) is shown; the map-options string before it carries
  the player's platform identity and is never kept.

See [[game-save-format]] for the parser and [[factory-status-registry]] for the chip.
