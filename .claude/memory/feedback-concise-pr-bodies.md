---
name: feedback-concise-pr-bodies
description: "PR bodies must be short — cover the manual steps, the breaking bits and the risky decisions, not the whole reasoning trail"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 69e1d33d-d5de-48d6-b095-1de878166bc4
  modified: 2026-08-09T15:41:00.421Z
---

Keep PR descriptions concise. A 180-line body written for a large branch was rejected outright as
"WAY too long"; the same change read fine at around 60. Cover the manual steps, what breaks, the
decisions a reviewer could disagree with, and how it was validated — then stop.

**Why:** the body is read before the diff, by someone deciding where to spend their attention. Every
paragraph of reasoning I add is a paragraph competing with the parts that actually change what a
reviewer does. Design rationale, measurement tables and the story of how a bug was found belong in
`.claude/memory/`, in the commit messages, or in code comments next to the thing they explain —
places that keep them without charging the reviewer for them.

**How to apply:** write the short version first rather than trimming a long one. One line for manual
steps (even "none"). A section per genuinely separate concern, a few sentences each. Bullets over
paragraphs where the items are independent. Cut any sentence that explains *why the approach was
chosen* unless a reviewer might reasonably propose a different one. Keep the loud parts loud —
`manual-steps-must-be-loud` and breaking-change notices are what the space is for.
