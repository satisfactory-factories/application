<template>
  <introduction source="changelog" />
  <v-container max-width="1200">
    <v-row>
      <v-col cols="12">
        <h1>Change Log</h1>
        <p>
          This is a list of changes made to the site. It is not exhaustive, but it should give you a good idea of what has been added or changed.
        </p>
        <p>Key:</p>
        <ul>
          <li>🆕: New Feature</li>
          <li>👍: Improvement</li>
          <li>🔧: Fixes</li>
        </ul>
        <v-divider />
        <h1>Beta v0.6 - The "Groundwork" Update</h1>
        <p>Everything your plan needs now comes from somewhere. Raw resources are no longer an assumption — ore, water, oil and gas are dug up by buildings you place, planned and exported like anything else — and the plan they feed got the folders, icons and status chips to keep track of it all.</p>

        <h2>🆕 <i class="fas fa-hard-hat ml-1" /><span class="ml-2">Mines</span></h2>
        <p>Pick a raw resource as a product and the planner offers its extractor as the recipe. Because one ore line routinely mixes a Mk.3 on a pure node with a Mk.2 on a normal one, the <b>miner mark and node purity are set per building group</b> — and both stack with the group's clock exactly as they do in game. Build a dedicated mine and export the ore anywhere in your plan, or mine on site and smelt it in the same factory.</p>
        <v-img
          alt="A mine mixing Miner Mk.3s on pure nodes with a Mk.2 on a normal one"
          max-width="1200"
          src="/assets/changelog/beta6/miners.png"
        />

        <v-divider class="subsection" />

        <h2>🆕 <i class="fas fa-water ml-1" /><span class="ml-2">Resource Wells</span></h2>
        <p>A well is one building group: the pressurizer, and how many satellite extractors stand on impure, normal and pure micro-nodes. The pressurizer's clock scales every satellite at once, so a well of 1 normal and 6 pure satellites reads 780 m³/min at 150 MW — and 1,950 m³/min at 503.7 MW once you shove three power shards in it. The satellites are counted as buildings to place but draw no power, because the pressurizer pays for all of them.</p>
        <p><b>Nitrogen Gas becomes extractable for the first time</b>, wells being its only source.</p>
        <v-img
          alt="A resource well pressurizer with its satellite nodes by purity"
          max-width="1200"
          src="/assets/changelog/beta6/resource-well.png"
        />

        <v-divider class="subsection" />

        <h2>🆕 <i class="fas fa-tint ml-1" /><span class="ml-2">Water &amp; Oil</span></h2>
        <p>Water sources have no purity, so the Water Extractor is simply a building that produces a raw resource at a flat 120 m³/min — and overclocks like everything else. Oil Extractors work off node purity in the usual way.</p>
        <v-img
          alt="Water Extractors, which have no node purity"
          max-width="1200"
          src="/assets/changelog/beta6/water-extractor.png"
        />

        <v-divider class="subsection" />

        <h2>🆕 <i class="fas fa-exclamation-triangle ml-1" /><span class="ml-2">Raw inputs are no longer assumed</span></h2>
        <p>Until now the planner quietly topped up any raw resource you were short of, so a plan could never tell you it was missing ore. Every raw resource must now be mined or imported like anything else, and an unmet one is a real shortage — with the usual buttons to mine it on the spot or import it from a factory that does. <b>Plans built before this will show factories in red.</b> Nothing in your plan has been changed or lost; it is only being honest about what was already missing.</p>
        <p><b>There is no setting for it, and that is deliberate.</b> An optional assumption meant the same plan could mean different things to different people, with nothing on screen to say so. The bug that ended it: a factory mining 100 of the 180 Limestone it needed read as <i>fully satisfied</i>, because the chip that would have mentioned the assumed 80 was suppressed by the one saying "extracted".</p>
        <p>The one exception is decided by the game rather than by you. Eleven raw resources have no extractor of any kind — Leaves, Wood, Mycelia, the four alien remains, the three power slugs and the FICSMAS Gift — so demanding you mine those would leave every Fabric, Charcoal, Biomass and Protein factory permanently red with nothing the planner could offer. They stay satisfied and wear an amber <b>Manually gathered</b> chip.</p>

        <v-divider class="subsection" />

        <h2>🆕 <i class="fas fa-shovel ml-1" /><span class="ml-2">The Raw Resources Wizard</span></h2>
        <p>It lists every factory short of a raw resource and offers, per row: create a shared mine factory, mine it right there, import it from a factory that already mines it, or leave it alone. It lives in <b>Options</b> — the wrench beside the share button — and isn't only for migrating; run it any time a new factory comes up short.</p>
        <v-img
          alt="The Raw Resources Wizard listing factories short of a raw resource"
          max-width="1200"
          src="/assets/changelog/beta6/wizard.png"
        />
        <ul class="ml-6 mt-2">
          <li><b>One mine per resource for the whole plan</b> where you ask it to build one, sized to everything that asked for it — a plan short of iron in eight places gets one Iron Ore Mine, not eight.</li>
          <li>New mines are built on <b>Miner Mk.2s at normal purity</b>. Only the building count and the power depend on that guess, never the amount of ore, so adjust each group to the nodes you actually have.</li>
          <li><b>Water defaults to being extracted on site</b>, since that is how it is nearly always built, and a resource already mined somewhere in your plan defaults to importing from there.</li>
          <li><b>Resource wells are the one thing it won't build.</b> A well's rate comes from its satellite nodes, so sizing one automatically would multiply the pressurizer instead and land an order of magnitude out while reading as solved. Nitrogen rows offer an import or nothing, and say why.</li>
          <li>It shows you every factory it will touch, everything they will produce and every export they gain, and <b>writes nothing until you confirm</b>. There is no undo in the planner, so the whole change is built to one side first: if any part of it can't be applied, nothing is written at all. <b>Download a backup</b> from the confirmation screen for a way back.</li>
          <li>You choose whether new mines land at the top or the bottom of the plan, and can rename any of them before they are built.</li>
        </ul>

        <v-divider class="subsection" />

        <h2>🆕 <i class="fas fa-folder-tree ml-1" /><span class="ml-2">Factory Groups</span></h2>
        <p>A plan of thirty factories was a flat list, and the only ways to organise it were the name and the drag order. Factories now belong to a <b>group</b>: a named, coloured folder that collapses like a toggle, reorders, and can be dragged in and out of. Anything in no group falls into <b>Ungrouped</b>, pinned to the top.</p>
        <v-img
          alt="Factories organised into coloured groups in the sidebar"
          max-width="1200"
          src="/assets/changelog/beta6/factory-groups.png"
        />
        <ul class="ml-6 mt-2">
          <li><b>In the sidebar</b>, a group is a header with its colour swatch, an editable name, a factory count, a delete button, and a line showing what the group makes — as many item icons as the sidebar is currently wide enough for, then a <b>+N</b> tile whose tooltip lists the rest. Drag a factory between groups, reorder factories inside one, or drag the groups themselves.</li>
          <li>The sidebar draws a group as a <b>tree</b>: a line in the group's colour down the edge of the section, with an elbow into each member.</li>
          <li><b>In the planner</b>, cards sit under a collapsible band per group, Ungrouped first. Bands only appear once there is more than one section, so a plan that has never used groups looks exactly as it did.</li>
          <li><b>Colour</b> comes from a palette or the picker. Red and amber are deliberately not offered — they are the problem and warning tiers, and a group wearing one would read as a broken factory. A group gives its cards a muted header and a bright left spine, and a status still wins the border, so a factory short of copper stays red while its spine says where it lives.</li>
          <li><b>Assigning</b> is a drag, or the group chip on the factory's header, which lists the groups and can make a new one on the spot. <b>Multi-group edit</b> does the same to a whole selection, so organising an existing plan doesn't mean opening forty cards in turn.</li>
          <li><b>Deleting a group never deletes a factory</b> — one that still holds factories asks where they should go first.</li>
          <li>Groups travel with the plan through save, share links, templates and cloud sync, with nothing to set up. Plans made before this load untouched, entirely ungrouped. One limitation: a group with no members yet has no factory to travel on, so it won't appear on another machine until something is in it.</li>
        </ul>

        <v-divider class="subsection" />

        <h2>🆕 <i class="fas fa-icons ml-1" /><span class="ml-2">Factory Icons</span></h2>
        <p>Every factory drew the same generic industry glyph, so a plan of twenty factories showed twenty identical icons and the only thing distinguishing a sidebar row was a truncated name. Factories now carry <b>an icon you choose</b>, and it shows everywhere the factory is referenced: the card header, the sidebar row, the Factories Summary, the graph node, the import rows, and the import/export chips.</p>
        <v-img
          alt="The factory icon picker"
          max-width="1200"
          src="/assets/changelog/beta6/factory-icons.png"
        />
        <ul class="ml-6 mt-2">
          <li><b>352 icons to pick from.</b> Real game art for every machine, extractor and generator, every belt, lift, splitter, pipe and pump, all the power infrastructure, the stations and storage, the vehicles, the equipment, and every raw resource, fluid and component the planner knows about — plus emoji: coloured squares, circles, diamonds and triangles, the digits 0–10, and a row of symbols.</li>
          <li><b>The picker opens on everything</b>, laid out under category headings so you can scroll it like a sheet rather than hunting through tabs. The category buttons stay on screen, so they double as a map of what is in there.</li>
          <li><b>Search covers the whole set</b> whichever category is selected, and matches names with their punctuation stripped — the game writes "Mk.5" and nobody types the dot, so "mk5" finds it.</li>
          <li>A factory stores only an icon ID, so nothing about how it is drawn is baked into your saved plan. Plans saved before this show the default glyph until an icon is picked.</li>
          <li><b>The Demo plan wears them</b>, with its copper chain folded into a copper-coloured group.</li>
        </ul>

        <v-divider class="subsection" />

        <h2>🆕 <i class="fas fa-heart-rate ml-1" /><span class="ml-2">Factory status indicators</span></h2>
        <p>A factory in the sidebar used to tell you exactly one thing: it was red, or it wasn't. Three unrelated failures collapsed into one red blob, and anything short of outright broken had nowhere to appear. Factories now carry a <b>status list</b> — named conditions rendered as chips under the factory name, so a 30-factory plan can be triaged without opening a single card.</p>
        <v-img
          alt="A factory carrying status chips under its name"
          max-width="1200"
          src="/assets/changelog/beta6/status-chips.png"
        />
        <ul class="ml-6 mt-2">
          <li><b>Two tiers.</b> Red for a problem — the factory can't do what the plan says it does. Amber for a warning — the plan is coherent, but something is probably not what you meant, or your world is behind your plan. The highest tier present paints the border, and chips aren't collapsed, so a factory both short of copper <i>and</i> out of sync shows both.</li>
          <li><b>Six statuses to start with.</b> Red: part shortage, unmet export request, building groups that don't add up. Amber: out of sync with the game, redundant import, duplicate import.</li>
          <li><b>The chips say which items</b> — three shortages are three item icons and "3 shortages", not a generic warning glyph — with the full list in the tooltip. Clicking a chip scrolls to the section it points at.</li>
          <li>The same treatment now applies everywhere factory state was already painted: the sidebar, the card border and header, the section headers, and the Factories Summary — which never painted the amber state at all.</li>
          <li><b>Fixed:</b> a factory whose <i>power generator</i> building groups didn't add up never turned red. The check ran, but the rollup only ever looked at products.</li>
        </ul>

        <v-divider class="subsection" />

        <h2>👍 <i class="fas fa-chart-line ml-1" /><span class="ml-2">Statistics enhancements</span></h2>
        <h3>Item Production</h3>
        <p><b>Product Surplus &amp; Deficit and Produced Items are now one section.</b> They listed the same items twice — one showing the balance, the other the supply. Item Production lists every item, with a search box and filters for surplus, deficit and balanced. The filter counts follow the search, so they say how many match both. The "Show all Products" toggle has gone with the section it controlled.</p>
        <v-img
          alt="The Item Production table, with each item broken down by factory"
          max-width="1200"
          src="/assets/changelog/beta6/statistics-items.png"
        />
        <h3 class="mt-4">Where the numbers come from</h3>
        <p><b>Item Production, Raw Resources and Building Summary are tables</b>, and each says which factories are behind the figure. Item Production lists every factory producing an item with what it makes, in green, alongside any factory short of it, in red. The chips click through to the factory.</p>
        <v-img
          alt="The Building Summary table, listing every factory that holds each building"
          max-width="1200"
          src="/assets/changelog/beta6/statistics-buildings.png"
        />
        <ul class="ml-6 mt-2">
          <li><b>Raw Resources</b> counts what the plan digs up. It used to read the raw supply the planner assumed on your behalf, so it sat empty once that assumption was removed.</li>
          <li><b>Power Consumption and Generation</b> gains a By factory breakdown, heaviest net drain first, collapsed by default.</li>
          <li><b>Building Summary</b> no longer counts a building requirement that has dropped to zero.</li>
        </ul>

        <v-divider class="subsection" />

        <h2>👍 <i class="fas fa-tasks ml-1" /><span class="ml-2">Tasks</span></h2>
        <p><b>Tasks drag into any order</b> now, by the grip handle on the left — the same handle the sidebar's factory list uses. A task's position was fixed the moment it was added, so the only way to reprioritise was to delete it and retype it at the bottom. Completed tasks drag too.</p>
        <v-img
          alt="The factory tasks card with drag handles and checkboxes"
          max-width="1200"
          src="/assets/changelog/beta6/tasks.png"
        />
        <p class="mt-2"><b>Done is a checkbox</b> rather than a pair of buttons, and has moved to the left of the task next to the handle. The old control was a blue button that turned grey, which read as an action to take rather than a state to see. Delete stays on the right and is outlined rather than a solid red block, since it was the loudest thing in the card while being the action you least often want.</p>

        <v-divider class="subsection" />

        <h2>👍 <i class="fas fa-calculator ml-1" /><span class="ml-2">Export Calculator — belts, pipes and Fluid Trucks</span></h2>
        <ul class="ml-6">
          <li><b>Belts are back</b>, now per destination: how many conveyors of a chosen mark it takes to carry the export, across all six marks (60/120/270/480/780/1,200 per min), with the smallest single belt that can carry it picked by default.</li>
          <li><b>Belt groups</b> split an export across several runs, each with its own mark. Enter either an items/min amount or a whole number of belts and the other follows, so you can plan by exact throughput or by "I'll just run four belts". Over-provisioning is fine; only undercapacity raises a warning, with an amber nudge when a whole group could be deleted and the rest would still cover it. Groups persist with the plan.</li>
          <li><b>Pipes</b> do the same for fluids — Mk.1 (300 m³/min) and Mk.2 (600 m³/min) — with their own groups saved separately from the belt ones.</li>
          <li><b>Fluid Trucks</b> (3,200 m³, added in patch 1.2) are supported, so the Truck column calculates fluid exports instead of telling you to package them. Drones and Tractors genuinely can't carry raw fluids, so those columns say so.</li>
          <li>The tray reads as an actual recessed tray now, grows with its content instead of clipping at a fixed height, and its mixed thick/thin column borders were unified.</li>
        </ul>

        <v-divider class="subsection" />

        <h2>👍 <i class="fas fa-compass ml-1" /><span class="ml-2">Finding your way around</span></h2>
        <ul class="ml-6">
          <li><b>The sidebar shows which factory you're looking at</b>, with an orange bar on that entry that follows you as you scroll or jump — no more losing your place in a 30-factory plan. The Statistics and Factories Summary links get the same treatment.</li>
          <li><b>Jump to a requesting factory</b> from any export chip in the satisfaction table, via a small eye button on its edge. Clicking the chip itself still selects that destination in the Export Calculator.</li>
          <li>An <b>Exported</b> chip now sits beside Product and Imported on any item another factory has asked for, so what leaves a factory reads off the item's own row.</li>
          <li><b>Every game image has a tooltip.</b> Hovering an item or building icon that wasn't a wiki link told you nothing, so a row of eight icons was eight guesses.</li>
          <li>Factory names and tasks now show a text caret and underline on hover, because nothing said they were editable — the factory name went as far as showing a pointing hand, the cursor for a button, on a field you type into.</li>
        </ul>

        <v-divider class="subsection" />

        <h2>🔧 <i class="fas fa-ghost ml-1" /><span class="ml-2">Ghost exports, and plans that repair themselves</span></h2>
        <p>A factory could sit there claiming to export a part to another factory that had no matching import — or worse, quietly export the wrong amount. There wasn't one cause, there were five, and each of them is fixed.</p>
        <ul class="ml-6">
          <li><b>Two factories could end up with the same ID.</b> New IDs were drawn at random from 0–9,999 with nothing checking whether the number was in use, so a 60-factory plan had roughly a one-in-six chance of a collision — which merged two factories into one as far as the dependency system was concerned: the wrong factory named on the export chip, the supplier under-producing, and deleting either taking the other's imports with it. IDs are now issued against the plan, and a plan loaded with a collision has the clash broken and its exports rebuilt.</li>
          <li><b>Importing the same part twice from the same factory understated the export</b> — the second import overwrote the first's amount rather than adding to it. Amounts are now totalled and duplicates already saved are merged on load.</li>
          <li>An export could be left behind with nothing in it, a corrupt import pointing at its own factory could take the whole plan's calculation down with it, and a plan that was already wrong stayed wrong through every reload.</li>
          <li><b>Loading a plan now checks the whole import/export chain</b>, repairs what it finds, and <b>tells you what it changed</b> — every automatic correction, grouped by factory, in one dialog. The browser alert that used to fire for this is gone; it appeared before the planner had drawn anything and sent you to the developer console.</li>
          <li>Deleting an import, or a factory that supplies another, no longer stops half way and leaves the supplier producing for an import that doesn't exist.</li>
          <li>Deleting one unfinished import row no longer deletes the other blank ones with it, and copying a factory no longer briefly claims to export everything the original does.</li>
        </ul>

        <v-divider class="subsection" />

        <h2>🔧 <i class="fas fa-ruler-combined ml-1" /><span class="ml-2">Numbers that were a hair off</span></h2>
        <p>Fuel Generators burning Rocket Fuel asked for 2400.002/min instead of 2400, forcing you to hand-override the producing factory to make the two line up. The game data was at fault — the parser divided a generator's power by a fuel rate it had already rounded — and it's fixed at source, along with Compacted Coal, Alternate: Super-State Computer and both Uranium Fuel Rod recipes.</p>
        <p><b>Plans already carrying those numbers repair themselves when they load</b>, since the quantities you asked for are inputs to the calculation rather than outputs and carried the drift forward. The check scales with the value rather than using a flat allowance, so a quantity you genuinely chose is left exactly as you set it, and anything on a building group with a fractional clock is skipped entirely. Anything repaired is listed in a dialog: which factory, which item, and the figure before and after.</p>

        <v-divider class="subsection" />

        <h2>🔧 Fixes &amp; minor adjustments</h2>
        <ul class="ml-6">
          <li>A building group no longer appears to accept more Somersloops than the building has slots for. The calculation was always correct — the engine clamps before it does anything with the value — but the number on screen disagreed with the number being used. Entries are clamped as you type, and the up arrow greys out once the slots are full.</li>
          <li>Editing a group's Somersloops no longer spins the refresh icon on the building count as well, and group chips line up again when one carries a wide caption.</li>
          <li>Refreshing or deep-linking the Parts browser no longer 404s — every route was a hand-maintained list and <code>/parts</code> was never added to it. It's a catch-all now, so adding a page needs no config.</li>
          <li>An unknown URL lands on a proper "page not found" with links back to the planner and the parts browser, rather than the bare CDN 404.</li>
          <li>The hidden sidebar's hover tray no longer sticks open when the cursor leaves the window — flinging it onto another monitor used to trip the peek zone on the way out.</li>
          <li>The API gained a health check that actually fails: it pings the database rather than only proving the process is alive, so an outage raises an alert instead of showing green.</li>
          <li>A tab left open across a release can no longer save over your account. v0.6 saves your whole plan where v0.5 saved only its factories, so an old tab autosaving would have quietly wiped the rest of it. The API now refuses saves from a version too old to send them, and the page tells you to reload — your work stays exactly where it is, and reloading does not lose it.</li>
        </ul>

        <v-divider class="subsection" />

        <h2>👍 <i class="fas fa-file ml-1" /><span class="ml-2">Smaller things</span></h2>
        <ul class="ml-6">
          <li>A new <b>Mining</b> template plan showing all of the above end to end, and the Demo plan gains a Copper Mine feeding its Copper Ingots.</li>
          <li>Every raw resource in the Imports section gets a one-click button to mine it in that factory, at exactly the amount you're short of.</li>
          <li>A mine's building groups report <b>Effective Output</b> rather than effective buildings, and when short they list how many of each miner mark would cover the gap, at every node purity.</li>
          <li>The Converter's ore recipes now name the conversion — "Iron Ore (Convert: Limestone)" — so they don't read as though the ore simply came from limestone.</li>
        </ul>

        <v-divider />
        <h1>Beta v0.5 - The "Overclocked" Update</h1>
        <p>After a long hiatus, we're excited to add the highly anticipated Overclocking and Somersloop support!</p>
        <p>Check out what's new in the video below!</p>
        <youtube-embed
          class="pb-4"
          params="si=aX6DUy_LF4aLPv_G"
          video-id="YsWDeOU3e8o"
        />

        <h2>🆕 <i class="fas fa-layer-group ml-1" /><span class="ml-2">Building Groups</span></h2>
        <p>The headline feature of this update! Each product and power generator can now be split into <b>Building Groups</b>, letting you plan how your production lines are physically laid out in your world. Each group has its own building count and clock speed, and the planner keeps them in sync with your production targets.</p>
        <p>Open them via the new "Open Building Groups" bar underneath each product. With them come two long-requested features:</p>

        <h3 class="d-flex align-center">
          <game-asset height="24px" subject="power-shard" type="item_id" width="24px" /><span class="ml-2">Overclocking</span><span class="mx-2">&amp;</span><game-asset height="24px" subject="somersloop" type="item_id" width="24px" /><span class="ml-2">Somersloops</span>
        </h3>
        <p>Set a clock speed per group and the planner works out the power usage and the number of buildings you need. Slot Somersloops into your groups to amplify production — the planner correctly boosts output (not ingredient consumption!) and applies the increased power draw. The Power Shards and Somersloops required are totalled up for you at a glance.</p>
        <v-img
          alt="Overclocking and Somersloops"
          max-width="1200"
          src="/assets/changelog/alpha5/building-groups.png"
        />

        <v-divider class="subsection" />

        <h2>🆕 <i class="fas fa-bolt ml-1" /><span class="ml-2">The Power Update</span></h2>
        <p>Power planning got a full overhaul:</p>
        <ul>
          <li>
            <b><span class="inline-asset"><game-asset
              height="20px"
              subject="geothermalgenerator"
              type="building"
              width="20px"
            /></span>Geothermal Generators</b> and <b><span class="inline-asset"><game-asset
              height="20px"
              subject="alienpoweraugmenter"
              type="building"
              width="20px"
            /></span>Alien Power Augmenters</b> can now be added to your plans — previously it wasn't possible to plan with them at all. For Geothermal, pick the geyser's purity and the planner handles its fluctuating output.
          </li>
          <li><b>Alien Power Augmenters</b> — add one to a factory as a generator and you'll get a custom UI for it. It boosts your <b>entire grid's</b> generation, with the option to supply Power Matrixes for an even bigger boost.</li>
          <li><b>Variable-power buildings</b> — Particle Accelerators, Converters and Quantum Encoders now show their true draw as an average with the min–max swing, so you can size your grid against the spikes.</li>
          <li><b>A proper power table</b> — the Statistics section now breaks down exactly where your power comes from and where it's going.</li>
          <li><b>Power targets</b> — decide how much power you want to generate across your whole plan, and the planner tells you whether you'll generate enough.</li>
        </ul>
        <v-img
          alt="World power statistics table"
          max-width="1200"
          src="/assets/changelog/alpha5/power-table.png"
        />

        <v-divider class="subsection" />

        <h2>🆕 <i class="fas fa-hat-chef ml-1" /><span class="ml-2">Parts &amp; Recipes page</span></h2>
        <p>The old Recipes page has been completely reworked into <b>Parts &amp; Recipes</b>. Instead of a flat list of recipes, you now browse by <b>part</b> — open any part to see:</p>
        <ul>
          <li><b>Produced by</b>: every recipe that makes the part, now showing the products and rates per minute (previously missing entirely!), plus the building it's made in and its power usage.</li>
          <li><b>Alternate Recipes</b>: tucked into their own dropdown per part, no more wading through them in the main list.</li>
          <li><b>Used in</b>: every recipe that consumes the part, so you can see what it feeds at a glance.</li>
        </ul>
        <p>It's also plan-aware! Parts you're already producing show an <b>"In Plan - X/min"</b> badge totalling your production across all factories, with clickable per-factory chips that jump you straight to that factory in the Planner. A <b>"Produced in Plan"</b> filter narrows the list to just the parts your plan produces.</p>
        <p>Every recipe has an <b>Add to Planner</b> button, which opens a dialog listing your factories — highlighting the ones that already produce or use the part — so you can drop the recipe into any of them (or a brand new factory) at 1 building @ 100% clock, then jump to the Planner.</p>
        <p>Recipe cards lay out in a responsive grid — three across on desktop, down to one on mobile.</p>
        <p>Clicking any part's icon now opens its <b>Satisfactory Wiki</b> page (this works everywhere in the planner, not just here!). Searching has also been massively improved — far more accurate and much quicker.</p>
        <v-img
          alt="Parts and Recipes browser"
          max-width="1200"
          src="/assets/changelog/alpha5/parts-recipes.png"
        />

        <v-divider class="subsection" />

        <h2>🆕 <i class="fas fa-paint-roller ml-1" /><span class="ml-2">UI Refresh</span></h2>
        <p>The planner has been improved across the board, surfacing far more information at a glance:</p>
        <h3>The Sidebar</h3>
        <v-row>
          <v-col cols="12" md="4">
            <video
              autoplay
              class="sidebar-video"
              loop
              muted
              playsinline
            >
              <source src="/assets/changelog/alpha5/sidebar.mp4" type="video/mp4">
              Your browser does not support the video tag.
            </video>
          </v-col>
          <v-col cols="12" md="8">
            <p>The sidebar has been improved in various ways:</p>
            <ul>
              <li>It's now <b>resizable</b>, and can be hidden entirely as a tray.</li>
              <li><b>Jump links</b> take you straight to Statistics and the Factories Summary — no more scrolling all the way up.</li>
              <li>It's <b>power-aware</b> — if your plan runs a power deficit, it warns you right in the sidebar.</li>
            </ul>
          </v-col>
        </v-row>
        <h3>Factories Summary</h3>
        <video
          autoplay
          class="summary-video"
          loop
          muted
          playsinline
        >
          <source src="/assets/changelog/alpha5/factories-summary.mp4" type="video/mp4">
          Your browser does not support the video tag.
        </video>
        <p>The Factories Summary is now a true <b>at-a-glance table</b> summarising each factory's production, satisfaction, exports and imports.</p>
        <h3>Statistics</h3>
        <p>Statistics got improvements all over the board:</p>
        <ul>
          <li>New <b>Power Shards &amp; Somersloops</b> counts showing exactly which factories use them.</li>
          <li>Power generation &amp; consumption now has a <b>much more detailed table</b> describing exactly where your power comes from and where it's going, alongside the new power target.</li>
          <li>Building summaries, raw resources and product surpluses / deficits have been tidied up, and <b>every section is now hideable</b>.</li>
        </ul>
        <h3>Other improvements</h3>
        <ul>
          <li><b>Hidden factories</b> now properly show their imports, exports and raw resources as clickable factory buttons, and have received a general polish.</li>
          <li><b>Colour consistency fixes</b> — colours are now far more consistent across the planner (power, problems, products, etc.).</li>
          <li><b>Tab switching has been reworked</b> — switching between plans is now dramatically faster.</li>
        </ul>

        <v-divider class="subsection" />

        <h2>🆕 <i class="fas fa-rocket-launch ml-1" /><span class="ml-2">Massive Performance Overhaul</span></h2>
        <p>The planner's calculation engine has been fundamentally reworked for <b>large plans</b>. Previously, every edit recalculated your entire plan directly on the live data — rewriting <i>everything</i>, even values that hadn't changed — which forced the planner to re-render far more than it needed to. On big plans this could freeze the planner for many seconds just from adding a factory or tweaking a product.</p>
        <p>The engine now runs its calculations off to the side and only applies the values that <b>actually changed</b> back to your plan. In numbers:</p>
        <ul>
          <li>A recalculation that changes nothing now touches <b>zero</b> reactive state — previously it rewrote ~2,400 values on even a modest 9-factory plan.</li>
          <li>Editing a product on a 124-factory mega-plan now triggers <b>~40 reactive updates instead of ~30,000+</b>, and only the affected fields re-render.</li>
          <li>The "add shortage as a new factory" flow and other whole-plan recalculations no longer hang large plans.</li>
          <li><b>Inputs feel instant</b> — your typed value lands immediately, and a small spinner beside the input shows the (much shorter) pause before the plan recalculates.</li>
        </ul>
        <v-divider class="subsection" />
        <h2>👍 Quality of Life</h2>
        <ul>
          <li>The Products and Satisfaction columns in the Factories Summary are now fixed-width, wrapping their contents instead of stretching the table.</li>
          <li>🆕 <b>Send shortages to other factories</b> - Shortages in the Satisfaction section now show two buttons underneath the shortage chip: <b>[+ New]</b> creates a brand new factory producing the missing amount, and <b>[+ Existing]</b> lets you pick one of your existing factories to produce it (highlighting factories that already make the part). Both automatically set up the import back into the factory with the shortage, resolving the deficit.</li>
        </ul>
        <v-img
          alt="Shortage to factory buttons"
          max-width="1200"
          src="/assets/changelog/alpha5/shortages-factory.png"
        />

        <v-divider class="subsection" />
        <h2>🔧 Fixes &amp; minor adjustments</h2>
        <ul>
          <li><b>Quantities no longer come back a hair off what you typed.</b> Entering a whole number (e.g. 1234 Crude Oil as an ingredient) could display as 1234.001 or 1233.999 after the planner recalculated, because the underlying product amount is a repeating decimal that has to be rounded. Quantities within 0.002 of a whole number now snap to it — if a value works out to 120.001, you almost certainly meant 120. Precision you dial in yourself is respected: if you set a fractional overclock on a building group (say 223.333%), its derived quantities are treated as exact and shown to the decimal, matching the in-game figures.</li>
          <li>Unpackaged liquids that are also a Raw Ingredient e.g. Crude Oil / Water were counted twice as both Raw Import and Production. <a href="https://github.com/satisfactory-factories/application/issues/431">GH Issue</a></li>
          <li>Unpackaged Liquids e.g. Crude Oil are now represented on the Satisfaction section via a "Unpackaged" badge.</li>
          <li>Byproducts e.g. Water production via byproduct of Aluminum Scrap is now considered "Recycled" into the system. The planner no longer incorrectly
            requests you import additional water, and such items are marked with a "Recycled" badge on the Satisfaction section. This should also fix other oddities to do with byproduct liquids. <a href="https://github.com/satisfactory-factories/application/issues/243">GH Issue</a></li>
          <li>It is no longer possible to enter more than .001 of precision into an item's quantity field, as the game doesn't operate any lower than that. Fixed a few rounding error bugs in the process. <a href="https://github.com/satisfactory-factories/application/issues/54">GH Issue</a></li>
          <li>Items that cannot be produced by any recipe e.g. Leaves are no longer selectable as products. Hand-collected items (Leaves, Wood, Mycelia, alien remains, power slugs, SAM etc.) remain available as raw imports and biomass burner fuel. <a href="https://github.com/satisfactory-factories/application/issues/390">GH Issue</a></li>
          <li>Deleting a factory that imported from other factories no longer displays false "corrupted data" error messages for those factories. <a href="https://github.com/satisfactory-factories/application/issues/398">GH Issue</a></li>
        </ul>

        <v-divider />
        <h1>Alpha v0.4</h1>

        <p>Check out what's new in the video below!</p>
        <youtube-embed
          class="pb-4"
          params="si=O0WvISqiPUPKFpCT"
          video-id="xiE7AwfzOpc"
        />

        <h3><a href="https://github.com/orgs/satisfactory-factories/projects/2/views/1?filterQuery=+milestone%3A%22Alpha+4%22+&sortedBy%5Bdirection%5D=asc&sortedBy%5BcolumnId%5D=Title">Click here</a> for an itemised list of changes on GitHub!</h3>

        <p>There was a strong emphasis of planner stability in this update, addressing long running bugs and adding measures to prevent Planner breakages.  We managed to squish over <b>20 bugs</b>! 🐞 Many quality of life changes were added as well.</p>

        <h2>🆕 Export Calculator v2</h2>
        <v-img
          alt="Export Calculator"
          max-width="1200"
          src="/assets/changelog/alpha4/export-calculator.png"
        />
        <p>The export calculator has returned to its former glory and better than ever. It now accounts for multiple transport types:</p>
        <ul>
          <li>Trains (solids &amp; fluids)</li>
          <li>Drones (solids only)</li>
          <li>Trucks (solids only)</li>
          <li>Tractors (solids only)</li>
        </ul>
        <p>If the user attempt to transport a fluid with a transport method, they'll be told to turn it into the packaged version first. I've added timer buttons to the "drivable" transport methods which means you can ride the route, start the timer, and stop it and it'll automatically update the calculator. The calculator also shows the accuracy of each transport method, listing full assumptions  and potential caveats of each method.</p>

        <v-divider class="subsection" />

        <h2>🆕 Loading Sequence</h2>
        <video controls width="1200">
          <source src="/assets/changelog/alpha4/loading.mp4" type="video/mp4">
          Your browser does not support the video tag.
        </video>
        <p>
          The way that factory plans are loaded has been completely redesigned. It now loads each factory in sequence performing checks / validation as it goes to prevent possible plan corruption, and also shows to the user how far along in the loading process it is. Whereas before, if you loaded a large plan, it would just appear to freeze for what could be 30 or so seconds at a time for very big plans. Now the user is given feedback on what's happening at every step of the way.
        </p>

        <v-divider class="subsection" />

        <h2><i class="fas fa-conveyor-belt-alt" /><span class="ml-3">Products</span> section changes</h2>
        <p>The products section has been improved in a variety of ways:
        </p>
        <ul>
          <li>🆕 Product <b>ingredients</b> and <b>buildings</b> can now have their values changed, so if you have say Cables, you can adjust the Wire ingredient and scale the output of Cables appropriately.</li>
        </ul>
        <video controls width="1200">
          <source src="/assets/changelog/alpha4/ingredients.mp4" type="video/mp4">
          Your browser does not support the video tag.
        </video>
        <ul>
          <li>👍 <b>Internal byproducts are taken into account better</b>, where if it creates a product and also creates a byproduct of the same type (e.g. Sulphuric Acid created both as a product and as a byproduct of Encased Uranium Cells) it will no longer show a TRIM button for that product.</li>
          <li>🔧 <b>"FIX PRODUCTION" double buttons has now been removed</b>, and it has been replaced with a proper "Satisfy / Trim" buttons which takes into account more scenarios, including internal requirements and exports.</li>
        </ul>

        <v-divider class="subsection" />

        <h2><i class="fas fa-arrow-to-right" /><span class="ml-3">Imports</span> section improvements</h2>
        <p>Large overhaul of the way factories are chosen as import candidates and fixes to various helper buttons.</p>

        <ul>
          <li>
            👍 <b>Import candidate changes</b>: The way that the Import section was choosing candidates for the factories to import from has been completely re-written. The choice of candidates now more strongly considers the destination factory's requirements, including byproducts. This is a huge improvement over the previous system which had a number of edge cases where it would or wouldn't show a factory or would show factories which weren't relevant (e.g. Water imports showing for no reason).
          </li>
          <li>👍🔧 <b>TRIM and SATISFY buttons now take into account other imports of the same part</b>. Before, it would only check the import being trimmed / satisfied against the factory shortage / overflow, now it takes all other imports and calculates the difference.</li>
          <li>🔧 Imports no longer consider a factory a candidate if the source factory imports a raw resource which the destination factory needs.</li>
          <li>🆕 Redundant imports (where a singular import can handle the demands) are now highlighted with <v-chip class="sf-chip small orange ma-0">
            <i class="fas fa-exclamation-triangle" />
            <span class="ml-2">Redundant!</span>
          </v-chip>. This way this mostly works is to not require re-balancing of imports, and if one import can do the job the others are marked as redundant.
          </li>
          <li>🆕 Imports with no amount set are marked with <v-chip class="sf-chip small red ma-0">
            <i class="fas fa-exclamation-triangle" />
            <span class="ml-2">No amount set!</span>
          </v-chip>.
          </li>
          <li>🔧 TRIM button no longer shows when an import is also a byproduct in the factory.</li>
        </ul>

        <v-divider class="subsection" />

        <h2>👍 Satisfaction section improvements and fixes</h2>
        <p>Satisfaction section got a major set of QoL improvements in this update, in particular surrounding handling of Nuclear Waste products.</p>
        <ul>
          <li>👍 <b>Uranium / Plutonium waste handling</b> - The way the waste was being handled before was sub-optimal. The user had to figure out that in order to create the waste they needed to create a power plant. It was also erroneously possible to select Uranium Waste as a product, with no recipe (and a bug). Now, the user can fix this issue by looking at the Satisfaction section, where there is now a [+Generator] button which adds a Nuclear Reactor with the correct fuel rod at the exact amount required to create that amount of waste.</li>
        </ul>
        <video controls width="1200">
          <source src="/assets/changelog/alpha4/waste.mp4" type="video/mp4">
          Your browser does not support the video tag.
        </video>
        <ul>
          <li>👍 <b>Part Roles</b> - There are new indicators of what roles a part plays in a factory, they can be either a "Product", "Byproduct", "Import" or an "Internal" part. This makes it much easier to understand the way the part interacts with the factory.</li>
          <li>🔧 <b>TRIM / SATISFY button fixes</b> - A lot of edge cases with the buttons were fixed, and take into better account byproducts and imports across the factory. This should now mean they only show up when appropriate to do so. This also fixed bugs with the buttons doing nothing when pressed, which was due to:</li>
          <li>👍 <b>"MANUALLY FIX" indicators</b> - Under certain conditions (such as there being multiple products, imports or byproducts of a same part), we are unsure / unable to automatically fix it as the user may not desire the outcome. Therefore, the user is now prompted to fix the situation manually.</li>
          <li>🔧 <b>Generator Power &amp; Building math</b> - When there were multiple generator groups of the same building and fuel type, the planner was not correctly calculating the power produced or the buildings needed.</li>
        </ul>

        <v-divider class="subsection" />

        <h2>Miscellaneous changes</h2>
        <p>A whole raft of other features / changes / fixes were implemented, so rather than going into detail of them, here they are rapid-fire style:</p>
        <ul>
          <li>🔧 🔧 Fixed a <b>Planner breaking bug</b> surrounding how Chrome, Edge and other Chrome derivatives renders the mobile tray (which completely broke the planner in those browsers).</li>
          <li>👍 <b>GameSync</b> now drops factories out of sync when their power generators change.</li>
          <li>👍 <b>Tab Memory</b> - changing tabs and reloading will remember the last opened tab (before it used to always open the first one).</li>
          <li>👍 <b>Performance Improvements</b> - what seems like a never ending battle, we have improved performance yet again by:
            <ul class="mb-0">
              <li>Ensuring the hidden factories UI is actually hidden itself when a factory is expanded (reducing rendering time slightly).</li>
              <li>Changes to the factory have been reduced, meaning the UI framework has to do less changes (more to come on this).</li>
              <li>Removed various bits of dead code that slowed the calculation of factories down.</li>
            </ul>
          </li>
          <li>👍 The "too many factories open" banner can be dismissed until page reload.</li>
          <li>🔧 Template manager can now open multiple templates without requiring a page reload.</li>
          <li>🔧 Packaged Rocket Fuel now shows the correct icon.</li>
        </ul>

      </v-col>
    </v-row>
  </v-container>
</template>
<script setup lang="ts">

</script>

<style lang="scss" scoped>

.inline-asset {
  display: inline-flex;
  margin-right: 4px;
  vertical-align: text-bottom;
}

// The sidebar demo is a tall vertical capture — cap its height rather than its width
.sidebar-video {
  border-radius: 4px;
  max-height: 500px;
  max-width: 100%;
}

.summary-video {
  border-radius: 4px;
  max-width: 100%;
}

h1,h2,h3,h4,h5,h6 {
  margin-top: 1rem;
  margin-bottom: 1rem;
}

div,p,ul,video {
  margin-bottom: 1rem;
}

ul {
  margin-left: 0;
  margin-bottom: 1rem;

  li {
    margin-left: 1rem;
  }
}

hr {
  border-style: solid;
  border-width: 1px;
  color: #7c7c7c !important;
  opacity: 1 !important;

  &.subsection {
    border-style: dashed;
  }
}

</style>
