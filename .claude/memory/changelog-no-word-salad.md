---
name: changelog-no-word-salad
description: "Changelog entries, splash/deck slides and release copy must be short and blunt — state what changed and stop. No rationale essays, no rhetorical framing."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 1bc7deee-e5a8-4397-aac9-1c3f78d18c70
  modified: 2026-08-13T15:14:33.646Z
---

Release-facing copy — `CHANGELOG.md`, the "What's new" splash deck, in-app help text — says
what changed and stops. One or two sentences per point. No paragraph explaining why the old
behaviour was wrong, no "the number you notice is the one you can do least with" style framing,
no restating the same fact in a second clause.

**Why:** long entries do not get read, so a padded changelog conveys *less* than a terse one.
It also reads as machine-written, which undermines the release. Matt's words: *"this whole thing
needs defluffing. You do like to do word salad, don't you?"* — the deck had grown multi-sentence
justifications under every heading.

**How to apply:** write the bullet, then delete every clause that is not the change itself.
Reasons belong in the commit message and in code comments, not in the changelog — a reader
wants to know what is different, not to be persuaded it was a good idea. Bullets that pack
several facts into one sentence get split into separate bullets instead of being made longer.
Match the density of a game patch note. Same rule for slide copy, where it matters more: a slide
is glanced at, not studied. See [[code-comments]] for the equivalent rule in source.
