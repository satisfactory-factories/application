---
name: e2e-concurrency-flake
description: Why the Playwright concurrency test flaked for weeks, how the collision is judged now, and why retries are CI-only
metadata:
  type: project
  volatility: durable
  lastVerified: 2026-09-21
---

Every recurring Playwright failure between 7 and 21 September 2026 was one assertion: the
concurrency test that adds a factory on two devices at once, failing its "exactly one
refusal" poll. In all twelve failing attempts the log showed **two** `stale_base` refusals,
never zero, so the message "neither op was refused" never described what happened.

**Why:** `addFactory` is four UI actions and the add itself arms the 400ms sync debounce
(`OP_DEBOUNCE_MS` in `room-sync-store.ts`). On a loaded runner the bare add goes out as its own
op before the name and note are typed. The gate still holds one op per device at the same base
revision, the server refuses one as it should, then the loser's rebase collides with the
winner's follow-on op for a second refusal. A count-based check then sits on the 30s expect
timeout waiting for 2 to become 1. The server is sound throughout; the final assertions on
both factories and notes never failed. Fixed in #713 by returning the two raced ops from
`raceOneOpEach` and judging those two by `opId` in `rejectedDevice`.

**How to apply:** when a forced-race test fails, read the received value in the log before
trusting the assertion message. Judge collisions on specific op ids, never on a count of every
refusal a device sees. `retries` is `process.env.CI ? 2 : 0` since #712: zero locally so a
flake is noticed on a dev machine, two in CI where the `github` reporter still flags a
pass-on-retry as flaky. Do not set `test.describe.configure({ retries })` on a test, it
overrides the global and would cap it below CI's value. The harness needs ports 3000/3001
exactly, so it cannot run locally while another project holds them. See
[[project-sync-v7-rooms]] for the sync engine this exercises.
