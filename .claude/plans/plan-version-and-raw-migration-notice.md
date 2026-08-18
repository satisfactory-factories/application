# A planner version on the plan, and a raw-resources notice that follows it

Branch: `update6` (PR #512). **Status: built.**

The marker lives on the **tab**, and `/save` now takes the whole tab rather than a bare
`Factory[]` — see "Where it lives" below. That is an API change, and the API must be deployed
before the web app.

Today the raw-resources breaking notice is gated on one global localStorage flag,
`seenRawBreakingNotice`. Dismiss it once and it never speaks again — so the next pre-0.6 plan the
user pastes, opens from a share link or restores from their account says nothing at all, and its
factories simply sit there red with no explanation. The warning belongs to the *plan*, not to the
browser.

## Tasks

- Add `plannerVersion?: string` to `FactoryTab`, stamped on tabs the app creates itself, so every
  plan built from here on is born answered. An imported plan keeps whatever it arrived with,
  including nothing.
- Raise the notice when the tab carries no `plannerVersion` **and** `collectRawWizardRows()`
  finds at least one factory short of a raw resource — asked from `loadingCompleted()`, not from
  the top of `beginLoading()`.
- Stamp the tab when the user answers — the wizard applying, or the notice being dismissed — and
  announce it, since tab-level state reaches neither the local save nor the cloud dirty flag on
  its own.
- Upload the whole tab from `syncData()`, and read both shapes back in `loadServerPlan()`.
- Carry the marker through copy/paste and the wizard's backup download.
- Let the v0.6 splash suppress the notice when it is going to show, since slide 1 says the same
  thing with the tour attached; the deck's own answer stamps the plan too.
- Retire the global `seenRawBreakingNotice`. Keep `rearmRawBreakingNotice()` working for the
  debug template that exists to re-trigger this.
- Cover it: a new plan never asks, a pre-0.6 plan with shortages asks once and never again, a
  pre-0.6 plan that needs nothing stays quiet, and the stamp survives a save/load round trip.

## Where it lives

The marker is plan-level, so it lives on `FactoryTab`. That runs into one thing: **cloud sync used
to upload a bare `Factory[]`** — `syncData()` posted `appStore.getFactories()` — so anything held
on the tab was dropped on restore. Rather than denormalise the marker onto every factory (the
trick `FactoryGroup` uses), `/save` now takes the whole tab, exactly as `/share` already did.

That also fixes existing silent losses: the power target and any memberless groups were being
dropped on every cloud restore too.

**Both shapes must keep working.** Every account saved before this holds an array, and a browser
that has not reloaded will keep sending one. `/save` accepts either; `loadServerPlan()` reads
either, and treats an array as what it is — a plan from before the change.

**Deploy order: the API first.** A new web app posting a tab to an old API hits
`factoryData.forEach` on an object, which throws, and the user's save fails. The reverse is safe.

## What the field means

`plannerVersion` records **the planner version this plan has been reconciled with** — not that its
raw resources are supplied. It is stamped when the user answers for the plan, whether they ran the
wizard or said they would sort it themselves. That is deliberate, and it is why the name is not
`migrated`: dismissing the notice is an answer, and a plan that claims to be *fixed* when the user
only waved the warning away would be a lie that everything downstream would inherit.

The consequence to accept: a dismissed-but-unfixed plan is indistinguishable from a wizard-fixed
one. Nothing today reads the field for anything except whether to raise the notice, so nothing is
misled — but anything added later that wants "is this plan actually supplied" must ask the
wizard's own row collector, not this field.

## Detection

`collectRawWizardRows(factories)` in `factory-management/raw-wizard.ts` is already the pass that
answers "which factories are short of a raw resource, and what are their options" — it is what
the wizard's own table is built from. Reusing it means the notice and the wizard can never
disagree about whether there is anything to do.

```
askRawBreakingNotice() =
  tab && !tab.plannerVersion && collectRawWizardRows(factories).length > 0
```

It is asked from `loadingCompleted()` rather than the top of the load, for two reasons: the
loader can swap in a recovered plan part way through, so that is the first point at which the
plan is the one being loaded; and the check reads the part ledgers, which do not exist until the
plan has been through `initFactories`. It also has to settle *before* `loadingCompleted` is
announced, since the v0.6 splash opens on that event and needs to know whether this plan is
asking for anything.

The second half matters: a plan built before extraction existed that happens to need nothing
(everything already imported, or nothing but raw-free factories) is not something to interrupt
anyone about.

## One thing this turned up

`utils/helpers.ts` called `useGameDataStore()` at module scope. Nothing had imported it early
enough to matter, so it sat there harmlessly — until the store imported the wizard's row
collector, which imports helpers, and the whole app stopped booting with an error naming Pinia
and nothing else. The store is resolved per call now, so the file is importable from anywhere.

Worth knowing: this is invisible to the unit suite, which installs Pinia before importing
anything. Only loading the page catches it.

## Deliberately not doing

- No stamp bump for anything except the raw-resources change. `plannerVersion` is not a general
  migration ledger and should not become one without a second case to justify the shape.
- No back-fill of existing plans. Absent is the correct reading of "built before this".
