# Beta v0.6 "Groundwork" update video script

Covers what is on the splash deck and nothing else: the breaking change, mining, the Raw
Resources Wizard, factory groups, factory icons, the quality of life work, and the fixes.

Target runtime **about 13 minutes**. Beats marked *(cuttable)* come out first for a ~9 minute
version. Every beat has a screen direction and the words to say over it.

Written to be read aloud in first person. No em dashes anywhere, so nothing trips up on a
teleprompter or reads as machine-written in the auto-captions.

## Still to decide

- Runtime target: full 13, or cut to 9 and put the rest in a follow-up.
- Whether to record on the demo plan or on a real save. The script assumes the demo plan for
  the tour and a pre-v0.6 plan for the wizard section.
- Whether the opening shows real red factories from an old save. It lands harder if it does.
- Where the video ends up embedded: setting `launchVideoId` in `SplashV6.vue` puts it on slide 1.

---

## 0. Opening (0:00 to 0:45)

**On screen:** the planner on a tidy plan for the greeting, then load an existing pre-v0.6 save.
Factories turn red one after another. Hold on the red while the explanation runs.

**Voiceover:**

> Hello everyone. Today I want to talk to you about Update 6, the Groundwork update, which is the most foundational change the planner has had.
>
> Now, you may have opened the planner and noticed that your plans have gone red. Don't panic.
> Nothing is broken and nothing has been lost.
>
> Raw resources used to be assumed by the planner. If a factory needed iron ore, the planner quietly assumed you
> were supplying it, and it never asked where from. That assumption is now gone. For Ore, oil, water,
> nitrogen, if nothing in your plan digs it up or imports it, you are short of it, exactly the
> same as you would be short of a screw or a rotor.
>
> That is why every plan built before today shows red. There is a wizard that fixes it in one
> pass, and I will show you that in a few minutes.

---

## 1. Why it changed (0:45 to 2:15)

**On screen:** a small factory. Add a product that needs ore. Show the shortage appearing.

**Voiceover:**

> So I'd like to explain why it changed. The original reason why I chose to assume rather than force raw resources was simply due to not wanting to burden you with describing every single layer, and that most factories would produce raw resources on site, e.g. water.
> However as time went on this made less and less sense. I got repeated calls to make it end-to-end like every other calculator tool out there, and eventually I agreed.
> But I didn't want to just make everyone's plans go red, I wanted to make it easier to migrate them to a raw first plan, and also make it easier to organise your now many mines on the planner.
> 
> Raw resources are first class citizens in the planner. You mine them, you import them, or you are short of them.
> That means your plan finally tells you how many extractors you need, on what purity of node,
> and what they cost you in power.
>
> There is no setting for the old behaviour. This is a fundamental shift in how the planner works, and I am not willing to support two systems. This is why it's classified as a beta.

**On screen:** the Options button, then the wizard opening. Do not run it yet.

> If you would rather not do that by hand across a big plan, the Raw Resources Wizard does it for
> you. It lives in Options, and it is the first thing I would run.

---

## 2. Mining (2:15 to 4:15)

**On screen:** create a new factory. Pick Iron Ore as a product. Show the extractor offered as
the recipe.

**Voiceover:**

> Extraction works like anything else you produce. Pick a raw resource as a product and the
> planner offers you its extractor as the recipe. Build a dedicated mine and export the ore where
> it is needed, or mine it on site in the factory that wants it. Both are supported and the
> planner tracks the logistics either way.

**On screen:** the building groups on that mine. Set a mark, set a purity. Change purity and show
the output move while power stays put.

> A mine is made of building groups, so you can have Miner Mark Threes on your pure nodes and a
> Mark Two on a normal one, in one factory, counted properly. Mark and purity both multiply with
> the group's clock speed exactly as they do in game. Purity changes the yield and never the
> power, which is worth knowing before you go hunting for pure nodes to save electricity.
>
> If a mine falls short, it tells you how many of each mark, at each purity, would close the gap.

**On screen:** a resource well. Show the pressurizer and its satellites by purity.

> Resource wells are one building group: the pressurizer, and how many satellites you have
> standing on impure, normal and pure micro nodes. The pressurizer's clock scales every satellite
> at once. The satellites draw no power of their own because the pressurizer pays for all of them.
>
> This is also the first time Nitrogen Gas is plannable, since wells are its only source.

**On screen:** a Water Extractor. *(cuttable)*

> Water sources have no purity, so a Water Extractor is a plain building at a hundred and twenty
> cubic metres a minute and overclocks like anything else. Oil extractors use node purity as
> normal.

---

## 3. The Raw Resources Wizard (4:15 to 6:15)

**On screen:** open a genuine pre-v0.6 plan. Red everywhere. Open Options, run the wizard.

**Voiceover:**

> This is the part that matters if you have plans already. The wizard lists every factory in your
> plan that is short of a raw resource, and gives you a choice per row.

**On screen:** walk down the rows, showing the four choices.

> Build a shared mine for it. Mine it on site in the factory that needs it. Import it from a
> factory that already mines it. Or leave that row alone.
>
> Shared mines are sized to everything that asked for the resource, so a plan short of iron in
> eight places gets one Iron Ore Mine that covers all eight, not eight separate mines.
>
> Water defaults to mining on site, since piping water across a plan is rarely what anyone wants.
> Anything you already mine somewhere defaults to importing from there, so you do not end up with
> a second mine next door to the one you have.
>
> Resource wells are the one thing it will not build for you. Satellite nodes each have their own
> purity and the game varies those, so what you are actually trying to build there is your call.
> Nitrogen rows offer nothing at all for the same reason.

**On screen:** hit Review. Show the summary. Show the placement choice and the backup button.

> When you are happy, Review shows you exactly what is about to happen: how many mines, how many
> extraction products, how many imports get wired up. You choose whether new factories land at
> the top or the bottom of your plan, and you can rename them before they exist.
>
> There is a backup button on that screen. Take the backup. Applying cannot be undone.

**On screen:** Apply. Watch the red clear.

> Then apply, and the plan goes green.

**On screen:** the Options button again.

> The wizard is not only for migrating. It stays in Options for any time you add a factory and it
> comes up short.

---

## 4. Factory Groups (6:15 to 8:15)

**On screen:** the sidebar with several groups, coloured, collapsing and expanding.

**Voiceover:**

> Factories can now belong to a group: a named, coloured folder that collapses, reorders, and can
> be dragged around. Anything you have not put in a group sits in Ungrouped at the top.

**On screen:** hover a group header. Point out the count and the product line, then the +N.

> In the sidebar a group header carries its colour, its name, how many factories are in it, and a
> line showing what the group as a whole produces. It fits in as many products as the sidebar has
> room for and folds the rest into a plus N. Each one is green if the group has spare and red if
> the group is short.

**On screen:** drag a factory between groups, reorder inside a group, drag a whole group.

> Drag factories between groups, reorder them inside one, or drag the groups themselves.

**On screen:** the planner view, showing the band and the line down the left.

> In the planner itself a group's factories sit under a collapsible band with a line linking them
> to it, so a big plan reads in sections.

**On screen:** a group carrying a status count, collapsed and expanded.

> Anything wrong inside a group rolls up to its header: how many of its factories are short of
> parts, have building groups that do not add up, or are out of sync with the game. That shows
> whether the group is open or shut, so a collapsed folder still tells you it needs opening.

**On screen:** the group chip on a factory, the menu, then the new group dialog with the palette.

> To move a factory, click its group chip and pick another group, or make a new one from there.
> The Group button at the bottom of the sidebar makes one too. Either way you name it and pick a
> colour, from the shortlist or the full picker.
>
> One piece of advice: leave red and amber alone. Those are the problem and warning colours, and
> a group wearing one reads as a plan full of broken factories.

**On screen:** multi-group edit with a section selected. *(cuttable)*

> If you are organising a plan you already have, Multi-group edit assigns a whole selection in one
> go, with a Select these button for the case it is nearly always going to be.

**On screen:** delete a group holding factories, show the prompt.

> Deleting a group never deletes a factory. If it still has factories in it, it asks where they
> should go first.

---

## 5. Factory Icons (8:15 to 9:15)

**On screen:** a factory with the generic glyph. Click it. The picker opens.

**Voiceover:**

> Factories can have icons. Click the icon on the factory, or the same icon on its row in the
> sidebar, and the picker opens.

**On screen:** scroll the picker. Search "mk5". Pick something.

> There are three hundred and fifty two to choose from: game art for every machine, belt, pipe,
> generator, vehicle, resource and component the planner knows about, plus emoji shapes, digits
> and symbols. Search covers the whole set whichever category you are in, and it ignores
> punctuation, so the game writes Mark full stop five and typing m k 5 still finds it.

**On screen:** a plan using icons. Scroll the imports and exports.

> Once a plan is using them, the icon follows the factory everywhere: on the factory, in the
> sidebar, and on every import and export chip that names it. On a big plan that is the
> difference between reading a name and recognising a shape.
>
> Use default puts the plain glyph back. And if the icon you want is not in there, emoji in the
> factory's name still work, they just will not show up as the icon elsewhere.

---

## 6. Quality of life (9:15 to 11:45)

**On screen:** a factory carrying status chips, red and amber.

**Voiceover:**

> Factories now say what is wrong with them. A chip on the factory and in the sidebar: red for a
> problem, amber for something that is probably not what you meant.
>
> Red covers a part shortage, an export somebody asked for that you are not meeting, and building
> groups that do not add up to the product. Amber covers being out of sync with the game, a
> redundant import, and a duplicate import.

**On screen:** the Factories Summary header, then collapse it.

> The Factories Summary counts them for the whole plan in its header, and keeps the counts when
> you collapse it.

**On screen:** the statistics page. Scroll through the four tables.

> Statistics gained a fair bit. Raw Resources counts what your plan digs up, per resource and per
> factory. Item Production is every item your plan makes or uses in one table, which replaces two
> separate lists of the same items. Search it, or filter by surplus, deficit or balanced, and each
> row names the factories producing the item in green and any factory short of it in red. Click a
> chip to jump straight there.

**On screen:** the Building Summary and the By factory power table. *(cuttable)*

> Building Summary shows every factory holding each building type and how many are in it. And
> power has a By factory breakdown, heaviest net drain first, collapsed by default.

**On screen:** the tasks card. Drag one, tick one. *(cuttable)*

> Tasks drag into any order now by the grip handle, completed ones included, and Done is a
> checkbox instead of a pair of buttons.

**On screen:** the export calculator on a belt export. Split into two belt groups.

> The export calculator is back and it does more. For any export it tells you how many conveyors
> of each mark it takes, across all six, and picks the smallest single belt that can carry it. You
> can split an export across belt groups, each with its own mark, entering either an amount per
> minute or a whole number of belts, and it will tell you when a group is redundant.

**On screen:** the same tray on a fluid export, showing pipes and Fluid Trucks.

> Export a fluid and the same tray answers in pipes, and Fluid Trucks are supported now at three
> thousand two hundred cubic metres, instead of being told to go and package the fluid.

**On screen:** scroll a long plan, showing the sidebar tracking the active factory.

> Navigation: the sidebar marks the factory you are actually looking at and follows you as you
> scroll, so a thirty factory plan stops losing your place. You can jump to a requesting factory
> from any export chip. And every game image has a tooltip, so hovering a row of eight icons tells
> you what they are.

---

## 7. Fixes (11:45 to 12:45)

**On screen:** the repair dialog on load.

**Voiceover:**

> A few things that were properly broken.
>
> Exports could point at a factory that was not importing them, or show the wrong amount. Five
> separate causes, all fixed. The worst of them let two factories end up with the same ID, which
> merged them as far as imports and exports were concerned. IDs are checked against the plan now,
> and a plan loaded with a clash in it gets repaired.
>
> Loading a plan checks the whole import and export chain, fixes what it finds, and tells you what
> it changed in one dialog. The old browser alert is gone.

**On screen:** a Fuel Generator on Rocket Fuel showing a clean 2400. *(cuttable)*

> And some number maths. Fuel Generators burning Rocket Fuel asked for two thousand four hundred
> point zero zero two a minute rather than two thousand four hundred, which forced you to override
> the factory feeding them. That is fixed, along with Compacted Coal, Super-State Computers and
> both Uranium Fuel Rod recipes. Plans already carrying those numbers repair themselves on load.
> Somersloops are clamped to the building's slots as you type. And a power-only factory that never
> showed red when it had problems now does.

---

## 8. Close (12:45 to 13:15)

**On screen:** the wizard, one more time, clearing a plan.

**Voiceover:**

> So, the one thing to take away: raw resources are no longer assumed, your old plans will be red
> until they are mined or imported, and the Raw Resources Wizard in Options will do the bulk of
> that for you in one pass. Take the backup it offers.
>
> Everything here is in the changelog in full, and the what's new panel walks the same ground with
> screenshots if you would rather read it.
>
> Thanks for using the planner. Go and dig something up.

---

## Notes for the edit

- The red plan in the opening is the single most important shot. It is the thing people will
  see before they see this video.
- The wizard section is the one to protect if the runtime needs cutting. It is the only part
  that is load-bearing for someone with an existing plan.
- Numbers said aloud once each, in words, so the captions do not mangle them: 352 icons, 3,200
  cubic metres for a Fluid Truck, 2400 per minute for Rocket Fuel.
- Nothing in the script names a feature that is not on the splash deck, by design. The AWESOME
  Sink work and anything else in flight stays out.
