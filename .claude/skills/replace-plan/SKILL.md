---
name: replace-plan
description: Replace one of the factory-setups plans with a plan Matt has pasted, then fix everything that depended on the old one. Use whenever he pastes exported plan JSON and says to make it the MegaPlan/demo/template, "copy this into <file>", "make this the Mael plan", or otherwise hands over a plan blob expecting it to land in the repo.
---

# Replacing a plan with a pasted one

When Matt pastes a plan, he means: **replace that file's plan contents outright, and update
anything that depended on the old contents.** Not merge, not append, not "add a second template".
Nothing is preserved from the old plan except the file's surrounding code.

## What the blob is

**Export plan** (was "Copy plan") offers a file or the clipboard, and either way hands over a
`PlanBlob`: `{ name, factories, powerTarget, plannerVersion, groups }` (`utils/plan-backup.ts`).
`factories` is the whole plan: products, building groups, inputs, dependencies, tasks, notes,
group membership, the lot.

## Where it can go

**`maels-big-boi-plan-data.json` — paste verbatim over the whole file.** The wrapper reads
`planData.factories` and `planData.powerTarget` and ignores every other key, so the blob goes in
exactly as it comes out. Nothing to reshape, nothing to strip.

- The `-data` suffix is load-bearing: `vite.config.mts` lists `.json` **before** `.ts` in
  `resolve.extensions`, so a sibling `maels-big-boi-plan.json` would shadow
  `maels-big-boi-plan.ts` for every bare import and `createMaelsBigBoiPlan` would come back
  `undefined`. Never name a data file after its wrapper module.

**`complex-demo-plan.ts`, `mining-demo-plan.ts`, `simple-plan.ts` — these are code, not data.**
They build their factories through `newFactory()` / `addProductToFactory()` / `addInputToFactory()`
calls. A blob cannot be pasted into them. Either translate it into builder calls, or convert that
plan to the `-data.json` pattern first (offer this — it is a one-off cost that makes every future
paste a paste). Say which you are doing rather than silently picking.

## Writing a big blob

A 36-factory plan is ~200 KB and **will not fit in one Write call**. Write it in ~5 KB chunks to
`<scratchpad>/plan/pNN.txt`, splitting at factory boundaries, then
`for f in $(ls p*.txt | sort); do printf '%s' "$(cat $f)"; done > plan.json` and reformat into
place with `python3 -c "json.dump(..., indent=2)"`. `printf '%s' "$(cat ...)"` matters — plain
`cat` adds newlines mid-token.

Track which factories are done as you go; `displayOrder` is the reliable counter.

## Verify the transcription

Hand-transcribing a blob will introduce errors and the compiler cannot see them. Do all of these:

1. **It parses**, and the factory count, unique ids and contiguous `displayOrder` are right.
2. **The chain agrees with itself.** For every `inputs[]` entry, the supplying factory must carry
   a matching `dependencies.requests[<importer id>]` for that part **at the same amount**, and
   every export request must have a matching import. Check both directions — this is what catches
   a mistyped id or figure, and it should come back with **zero** discrepancies.
3. **The engine agrees with the save.** Load the template in a real browser (see the `verify`
   skill) and compare against what the blob claims: the set of `hasProblem` factories, total
   power produced, group names. They should match exactly. No repair dialog should appear — one
   means the loader found the chain broken.

## Then fix what depended on it

- `Templates.vue` — the template's `description` is prose about the old plan. Re-read it against
  the new one (factory count, what it demonstrates, which features it uses).
- **Specs that assert plan contents.** `complex-demo-plan.spec.ts`, `mining-demo-plan.spec.ts` and
  `simple-plan.spec.ts` assert counts, group membership, per-factory amounts, buildings and power
  — replacing those plans means rewriting most of their spec. The MegaPlan is cheap by comparison:
  only `status-regression.spec.ts` and `factory-commit.spec.ts` reference it, and generically.
- **`stress-plan.ts` is 4× the MegaPlan**, so its factory count moves whenever the MegaPlan does.
  Its comments and spec name have gone stale this way before.
- `grep -rl` the plan's factory function across `src` and `testing` before declaring it done.
- Run `pnpm exec vitest run src/utils/factory-setups` plus any spec the grep turned up.

## Commit

The data file is a snapshot of a real save, so `feat(web)` only if the plan is materially
different (new factories, new features shown off); a refreshed copy of the same plan is a `fix`
or `chore`. Say what is in the new plan in the commit body — the diff is 13k lines of JSON and
tells the reader nothing.
