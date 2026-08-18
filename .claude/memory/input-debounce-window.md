---
name: input-debounce-window
description: "The shared input debounce restarts per keystroke but its 250ms window is shorter than a normal typing gap, so multi-digit entries commit digit by digit"
metadata: 
  node_type: memory
  type: project
  volatility: durable
  lastVerified: 2026-08-18
  originSessionId: 5b26ed04-5f17-4172-8f9b-b435c92b4104
  modified: 2026-08-18T00:07:19.796Z
---

`debounce()` in `components/planner/products/ItemCommon.ts` is a module-global timer that
**does** `clearTimeout` and re-arm on every call, so the wait is measured from the last
keystroke, not the first. When someone reports "the debounce isn't resetting", check the
window length before the reset logic: the two symptoms are identical.

The default window is 250ms, which is **shorter than the gap between digits when a number is
typed at a normal pace**. Measured in Chromium: at 350ms per keystroke, typing `280` commits
three separate times, once per digit. So "there is no debounce" is usually "the window expired
between my keystrokes".

Whether that matters depends on what the committed action does:

- **Harmless** where the recalculation only derives downstream values. The typed number
  survives; the cost is wasted recalculations.
- **Destructive** where the input *reverse-solves*, which is every building group input.
  `updateBuildingGroupViaPart` solves a count and clock from the amount, and its
  clock-preservation branch only fires while the group is already above 100%. A partial `2`
  knocks the clock below that, so the next solve takes the full re-solve path and a
  deliberate overclock is gone before the number is finished. Partial values compound
  because each solve starts from what the last one left behind.

`runDebounced(key, action, delay?)` in `composables/useDebouncedAction.ts` takes an optional
override; without it callers get the shared 250ms. The Options dialog's tolerance preview
passes 750ms, which holds through 700ms-per-keystroke typing. `window.__sfDebounceMs`
overrides the window in dev builds and is useful for widening it enough to screenshot the
pending state.

Two things that cost time when verifying this in a browser:

- A puppeteer element screenshot takes about a second, longer than the window, so it can
  never capture the pending state. Use a CDP screencast (`Page.startScreencast`) and pick a
  frame, or a `MutationObserver` timestamping each commit — the offset from the *last*
  keystroke is what proves the reset works.
- Sampling after each keystroke with a delay longer than the window measures the settled
  state every time and looks like no debounce at all.

Anything showing a pending edit should use `DebounceSpinner`, keyed per input so only the
field being edited spins. See [[vnumberinput-clamping]] for the separate trap where `:max`
swallows the update event entirely, and [[calc-engine-gotchas]] for what the committed
recalculation then does.
