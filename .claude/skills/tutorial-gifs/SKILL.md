---
name: tutorial-gifs
description: Record animated GIF demos of the planner for in-app tutorials, with a gliding cursor, click feedback and highlight boxes. Use when asked to "create some animations for X", "create tutorial gifs for X", record a demo of a feature, or regenerate the existing Building Groups tutorial GIFs.
---

# Recording tutorial GIFs

The toolkit is committed at `web/testing/gifs/` — read its `README.md` for how to run it and
how to add a scenario. This file is the part that isn't obvious from the code: the traps, and
why each piece of the pipeline exists. Every one of these cost a full regeneration cycle to
find.

## Why custom rather than off-the-shelf

Screen Studio and its open-source clones (Recordly, OpenScreen, screen-demo) do exactly this
polish, but they record a human driving a GUI — they need a display and a person, and every
take differs. These GIFs get regenerated wholesale whenever the app's palette or layout moves,
so reproducibility beats convenience. Chrome DevTools Recorder / Playwright codegen only
author the script. `pagecast` (Playwright + ffmpeg, injects a cursor and click ripple) is the
closest match but records ad-hoc navigation and has no answer for the crop stability below.
`ghost-cursor` generates real bezier mouse paths, but it exists to defeat bot detection, so it
adds tremor and overshoot that read as sloppiness in a tutorial.

Revisit that call if the requirement ever stops being "regenerate all of these from scratch,
identically, in a container".

## The stability rules (this is most of the work)

A jiggling GIF is the complaint that comes back every time. Three separate causes, all fixed
in `record.mjs`, all of which will bite again in a new scenario:

- **Crop the same rectangle every frame.** Measure it once per scenario, never per frame.
  Re-measuring means a transient mid-transition layout gets captured as a real position and
  snaps back on the next frame.
- **The crop is effectively viewport-relative.** The app scrolls an inner `div`, so
  `visualViewport.pageTop` never moves and a document-coordinate clip behaves as a stationary
  viewport rect. Anything that shifts the anchor row inside the viewport slides the whole
  scene under the crop, so every frame re-anchors the row to the y it started at.
- **Reserve space for conditional rows.** The "To cover the shortfall…" row is a `v-if` that
  blinks in and out as numbers cross in and out of balance. Each toggle moved everything below
  it ~33px. It gets a permanently reserved band instead of being hidden. **Pin that reserve
  from a measurement taken up front and force the row to one line** — an earlier version
  learned it at runtime, latched onto a wrapped 3-line hint from the intermediate value while
  typing "20" (it passes through "2"), and left a ~100px gap for the rest of the recording.

`analyze-stability.mjs` is the arbiter: it cross-correlates row and column brightness profiles
across consecutive frames and reports any that translated. **It must print 0 for every
scenario.** Do not ship on "looks fine to me" — the eye misses a 2px shift that reads as
jitter at speed.

## position:fixed overlays and scrollbar-gutter

The cursor and highlight boxes are `position: fixed`, placed from `getBoundingClientRect`
coordinates. `scrollbar-gutter: stable` is injected to stop scrollbar pop shifting the layout —
but it **must not be `both-edges`**, which also reserves a gutter on the left and moves the
origin of the initial containing block. Under `both-edges` every overlay rendered ~15px right
of where it was told to go: the ring sat off its target and highlight boxes clipped the
leading digit of the value they framed. Symptom to recognise: an overlay's `style.left` and
its `getBoundingClientRect().x` disagree by a constant.

## Aiming and framing

- **Aim at the value, not the box.** A Vuetify field can be `text-align: start` with 16px of
  lead padding, so the geometric centre is not where the number is. `centerOf` measures the
  glyph run with the input's own computed font and honours `text-align`.
- **Highlight the whole readout.** A value is often several sibling spans plus bare text
  ("2.00 | 2.00 short" is three spans and a `|`). Pass `highlight` a list of ids and it boxes
  their union; missing ids (a `v-if` suffix that vanishes when balanced) are skipped.
- **Highlights re-measure every frame.** A box measured only when shown freezes at that size,
  and a value that grows outgrows its own box.

## Pacing

Output runs at `7 * HOLD_REPEAT` fps. Everything except cursor travel is written `HOLD_REPEAT`
times, so pauses, typing and highlights hold their reader-facing pace while travel gets every
frame. That is the knob for "smoother" — raising the rate alone just makes it faster, and
adding steps alone just makes it slower. Repeats are file copies of one screenshot: free to
capture, near-free to encode. Cursor travel is ease-in-out with a slight perpendicular bow and
step count scaled to distance.

Feedback that has come back more than once: **too fast**. Err slow.

## Verify content, not just stability

The trap that produced six perfectly stable, perfectly wrong GIFs: the click helper blurs the
focused element afterwards (right for buttons, since a focused button can trigger the
browser's own scroll-into-view), which threw away the focus `setNumberInput` had just
established, so every keystroke landed on the body and not one value ever changed.
`setNumberInput` now asserts the field holds what it typed. When adding scenarios:

- Look at real frames — first, last, and each moment something is meant to change.
- Check the final state is the state the scenario describes.
- A `maxHint` of 0 where a shortfall was expected means nothing went out of balance, which
  usually means nothing happened at all.

## Encoding

Two-pass palette, `stats_mode=diff`, `dither=none` (bayer tripled size for no visible gain on
this flat UI), width 1040. Stable frames compress dramatically better than jiggling ones —
when the stabilisation landed, total size fell from 14.8MB to 1.87MB. A GIF that is
unexpectedly huge is a hint that something is moving that shouldn't be.
