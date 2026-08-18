---
name: surplus-disposition-not-production-tied
description: "Sink/depot style \"where does this surplus go\" features must key off surplus alone, never off whether the factory produces the part"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 2814c14c-3054-4f42-9780-201b731b349a
  modified: 2026-07-31T14:42:04.239Z
---

Any feature that lets a player declare a destination for a surplus — AWESOME Sink, Dimensional
Depot, whatever comes next — must be offered on the basis of **surplus alone**. Never gate it on
"does this factory produce the part", and never derive the rate from products rather than
`amountRemaining`. Decided 2026-07-31 while planning issue #498, and it applies to the parked Sink
work in `.claude/plans/awesome-sink-and-byproduct-routing.md` as much as to the depot work.

**Why:** a very common build is a logistics centre — one factory that imports everything to a
central location for storage, sinking or depoting the overflow. It produces nothing itself, so a
production-gated toggle would never appear there, which is exactly backwards: that factory is the
one whose surplus most needs a declared destination. Keying off surplus also means imports,
byproducts and local production are treated identically, and the player keeps agency over what a
given factory is *for*.

**How to apply:** predicate on `factory.parts[partId].amountRemaining > 0` (plus "or already
flagged", so a surplus drying up doesn't silently drop the row), and take the amount as
`max(0, amountRemaining)`. Guards that reject a part for a *game* reason are fine and unrelated —
fluids can't go on a depot's conveyor input, radioactive items can't be sunk. See
[[project-awesome-sink-plan]] and [[calc-engine-gotchas]] (`factory.parts` is rebuilt every
calculation, so a user flag can never live on `PartMetrics`).
