<template>
  <introduction source="changelog" />
  <v-container max-width="1200">
    <v-row>
      <v-col ref="content" cols="12">
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
        <nav v-if="releases.length" class="toc">
          <p class="mb-1"><b>Jump to an update:</b></p>
          <ul class="toc-list">
            <li v-for="release in releases" :key="release.id">
              <a :href="`#${release.id}`" @click.prevent="jumpTo(release.id)">{{ release.title }}</a>
              <span v-if="release.date" class="text-medium-emphasis ml-2">{{ release.date }}</span>
            </li>
          </ul>
        </nav>
        <v-divider />
        <h1>Beta v0.7 <span class="release-date">In development</span></h1>
        <p>Buildings that produce nothing — portals, stations, lights — can now be planned like everything else.</p>
        <nav v-if="sectionsOf('Beta v0.7').length" class="toc">
          <p class="mb-1"><b>In this update:</b></p>
          <ul class="toc-list">
            <li v-for="section in sectionsOf('Beta v0.7')" :key="section.id">
              <a :href="`#${section.id}`" @click.prevent="jumpTo(section.id)">{{ section.title }}</a>
            </li>
          </ul>
        </nav>

        <h2>🆕 <i class="fas fa-building ml-1" /><span class="ml-2">Custom Buildings</span></h2>
        <p>Buildings that make nothing can now be added to a factory, under the products and power generators: portals, train stations, freight platforms, truck stations, drone ports, radar towers, the AWESOME Sink, hypertube entrances, jump pads, pipeline pumps and lights.</p>
        <v-img
          alt="Ten Main Portals added to a factory as a custom building"
          max-width="1200"
          src="/assets/changelog/beta7/custom-buildings.png"
        />
        <ul class="ml-6 mt-2">
          <li>They count towards the factory's power draw and its list of buildings to place.</li>
          <li><b>The Main Portal eats Singularity Cells</b>, two a minute each. That is a demand like any other: import it, or the factory reads as short.</li>
          <li><b>The Demo plan has a Portal Hub</b>: ten Main Portals, 2.5 GW, and 20 Singularity Cells a minute shipped in.</li>
        </ul>

        <v-divider />
        <h1>Beta v0.6 - The "Groundwork" Update <span class="release-date">19/Aug/2026</span></h1>
        <p>Raw resources are no longer assumed. Ore, water, oil and gas are dug up by buildings you place, and planned and exported like anything else. Factory groups, factory icons and status chips arrive to keep a bigger plan in order.</p>
        <nav v-if="sectionsOf('Beta v0.6').length" class="toc">
          <p class="mb-1"><b>In this update:</b></p>
          <ul class="toc-list">
            <li v-for="section in sectionsOf('Beta v0.6')" :key="section.id">
              <a :href="`#${section.id}`" @click.prevent="jumpTo(section.id)">{{ section.title }}</a>
            </li>
          </ul>
        </nav>

        <p>Check out what's new in the video below!</p>
        <youtube-embed
          class="pb-4"
          video-id="vHCUNU37rZ4"
        />

        <h2 class="breaking">🆕 <i class="fas fa-exclamation-triangle ml-1" /><span class="ml-2">Raw inputs are no longer assumed</span></h2>
        <p>The planner used to top up any raw resource you were short of. Every raw resource must now be mined or imported, and an unmet one is a real shortage, with the usual buttons to mine it on the spot or import it.</p>
        <p><b>Plans built before this will show factories in red.</b> Nothing has been changed or lost. The shortages were always there.</p>
        <p>There is no setting for it: an optional assumption would mean the same plan meant different things to different people.</p>

        <v-divider class="subsection" />

        <h2>🆕 <i class="fas fa-hard-hat ml-1" /><span class="ml-2">Mines</span></h2>
        <p>Pick a raw resource as a product and the planner offers its extractor as the recipe, along with any alternate recipe that also produces it. Miner mark and node purity are set per building group, and both stack with the group's clock as they do in game. Mine on site like any other product, or build a dedicated mine and export the ore.</p>
        <v-img
          alt="A mine mixing Miner Mk.3s on pure nodes with a Mk.2 on a normal one"
          max-width="1200"
          src="/assets/changelog/beta6/miners.png"
        />

        <v-divider class="subsection" />

        <h2>🆕 <i class="fas fa-water ml-1" /><span class="ml-2">Resource Wells</span></h2>
        <p>A well is one building group: the pressurizer, plus its satellite extractors on impure, normal and pure micro-nodes. The pressurizer's clock scales every satellite at once and pays the power for all of them. Wells cover Water, Crude Oil and Nitrogen Gas.</p>
        <p><b>Raw Nitrogen Gas is in the planner for the first time.</b> It was only ever available through conversion before, which was a long-standing hole.</p>
        <v-img
          alt="A resource well pressurizer with its satellite nodes by purity"
          max-width="1200"
          src="/assets/changelog/beta6/resource-well.png"
        />

        <v-divider class="subsection" />

        <h2>🆕 <i class="fas fa-tint ml-1" /><span class="ml-2">Water &amp; Oil</span></h2>
        <p>Water is now supported however you get it: Water Extractors, resource wells, alternate recipes and byproducts. Oil is supported from both Oil Extractors and resource wells.</p>
        <v-img
          alt="Water Extractors, which have no node purity"
          max-width="1200"
          src="/assets/changelog/beta6/water-extractor.png"
        />

        <v-divider class="subsection" />

        <h2>🆕 <i class="fas fa-shovel ml-1" /><span class="ml-2">The Raw Resources Wizard</span></h2>
        <p>It lists every factory short of a raw resource and offers, per row: build a shared mine, mine it on site, import it from a factory that already mines it, or leave it alone. It lives in <b>Options</b>, the wrench beside the share button. Run it any time a new factory comes up short.</p>
        <v-img
          alt="The Raw Resources Wizard listing factories short of a raw resource"
          max-width="1200"
          src="/assets/changelog/beta6/wizard.png"
        />
        <ul class="ml-6 mt-2">
          <li><b>One mine per resource</b>, sized to everything that asked for it. Eight factories short of iron get one Iron Ore Mine.</li>
          <li>New mines use <b>Miner Mk.2s at normal purity</b>. That guess only affects the building count and the power, never the ore, so adjust each group to the nodes you have.</li>
          <li><b>Water defaults to on-site extraction.</b> A resource already mined somewhere in your plan defaults to importing from there.</li>
          <li><b>Resource wells are not compatible with the wizard</b>, because of the satellites. Rather than make a bad guess it leaves them to you, and says so on any row it cannot help with. Wiring an import from a well you already have is one click in Imports.</li>
          <li><b>Nothing is written until you confirm.</b> You see every factory, product and export first, and can download a backup from the confirmation screen.</li>
          <li>You choose whether new mines land at the top or the bottom of the plan, and can rename them before they are built.</li>
        </ul>

        <v-divider class="subsection" />

        <h2>🆕 <i class="fas fa-folder-tree ml-1" /><span class="ml-2">Factory Groups</span></h2>
        <p>Factories now belong to a <b>group</b>: a named, coloured folder that can be collapsed, reordered, and have factories dragged between them. Anything ungrouped falls into <b>Ungrouped</b>, pinned to the top.</p>
        <v-img
          alt="Factories organised into coloured groups in the sidebar"
          max-width="1200"
          src="/assets/changelog/beta6/factory-groups.png"
        />
        <ul class="ml-6 mt-2">
          <li><b>In the sidebar</b>, a group header carries its colour, an editable name, a factory count, a delete button, and icons for what the group makes.</li>
          <li><b>In the planner</b>, cards sit under a collapsible band per group, Ungrouped first.</li>
          <li><b>Assign</b> by drag, or from the group chip on the factory header, which can make a new group on the spot. <b>Multi-group edit</b> does the same to a whole selection.
            <v-img
              alt="Multi-group edit assigning several selected factories to one group"
              class="mt-2"
              max-width="1200"
              src="/assets/changelog/beta6/multi-group-edit.png"
            />
          </li>
          <li><b>Every group ends with its own Add Factory button</b>, which makes a factory and puts it straight into that group — no adding it at the bottom of the plan and dragging it back up.</li>
          <li><b>Group power</b> (generated, consumed and the balance) is optional, under <b>Options → Sidebar → Factory groups</b>. A <b>circuit boost</b> chip shows where Alien Power Augmenters are involved.</li>
          <li><b>Deleting a group never deletes a factory.</b> One that still holds factories asks where they should go first.</li>
        </ul>

        <v-divider class="subsection" />

        <h2>🆕 <i class="fas fa-icons ml-1" /><span class="ml-2">Factory Icons</span></h2>
        <p>Factories now carry <b>an icon you choose</b>, shown on the card header, the sidebar row, the Factories Summary, the graph node, the import rows and the import/export chips.</p>
        <v-img
          alt="The factory icon picker"
          max-width="1200"
          src="/assets/changelog/beta6/factory-icons.png"
        />
        <ul class="ml-6 mt-2">
          <li><b>352 icons</b>, using in-game art for every building, product, vehicle and resource, plus emoji: coloured squares, circles, diamonds, triangles, digits and symbols.</li>
          <li>Click the icon on the factory header, or on its sidebar row, to change it.</li>
        </ul>

        <v-divider class="subsection" />

        <h2>🆕 <i class="fas fa-heart-rate ml-1" /><span class="ml-2">Factory status indicators</span></h2>
        <p>A factory in the sidebar was either red or it wasn't, and it never said what was wrong. Factories now carry <b>status chips</b> that name the problem, so you can go straight to it.</p>
        <v-img
          alt="A factory carrying status chips under its name"
          max-width="1200"
          src="/assets/changelog/beta6/status-chips.png"
        />
        <p class="mt-2"><b>The statuses below sit in three tiers.</b> Red is a serious problem. Amber is something to address at some point. Yellow shows on the factory without flagging it. The highest tier present paints the factory, and chips are never collapsed, so a factory short of copper <i>and</i> out of sync shows both.</p>
        <ul class="status-tiers ml-6">
          <li class="tier-problem"><b>Marks the factory red</b>
            <ul>
              <li><b>Shortage</b>: the factory needs more of a part than it can supply.</li>
              <li><b>Export request unmet</b>: another factory asks for more than this one supplies.</li>
              <li><b>Building groups do not add up</b>: the groups on an item do not cover the buildings it needs.</li>
            </ul>
          </li>
          <li class="tier-warning"><b>Marks the factory amber</b>
            <ul>
              <li><b>Unhandled byproduct</b>: a fluid or radioactive byproduct nothing consumes and the sink will not take.</li>
              <li><b>Out of sync</b>: the factory has changed since you marked it built in game.</li>
              <li><b>Redundant import</b>: the part is already covered here, or by another import row.</li>
              <li><b>Duplicate import</b>: the same part imported twice from the same factory.</li>
            </ul>
          </li>
          <li class="tier-note"><b>Shows on the factory, but does not flag it</b>
            <ul>
              <li><b>No demand</b>: nothing asks for this product.</li>
              <li><b>Potential blockage</b>: a byproduct nothing consumes, but the sink would take it.</li>
            </ul>
          </li>
        </ul>
        <v-img
          alt="A product row for a Ballistic Warp Drive, carrying a blue End product chip"
          class="mt-2"
          max-width="900"
          src="/assets/changelog/beta6/end-product-chip.png"
        />
        <p class="mt-2"><b>End product</b>, in blue, marks an item the game itself never consumes, so having no demand is what it is for.</p>
        <ul class="ml-6 mt-2">
          <li><b>Fixed:</b> a factory whose <i>power generator</i> building groups didn't add up never turned red. The check ran, but the rollup only looked at products.</li>
        </ul>

        <v-divider class="subsection" />

        <h2>👍 <i class="fas fa-layer-group ml-1" /><span class="ml-2">Building Groups: Satisfy and Trim</span></h2>
        <p>Every group row now carries its own <b>Satisfy</b> and <b>Trim</b>, which puts the whole gap on that one group and leaves the others alone. Until now the only options were to spread it across every group, or to push it onto the last one.</p>
        <v-img
          alt="Building groups over-producing, each row offering a Trim button"
          max-width="1200"
          src="/assets/changelog/beta6/building-group-trim.png"
        />
        <v-img
          alt="Building groups under-producing, each row offering a Satisfy button"
          class="mt-2"
          max-width="1200"
          src="/assets/changelog/beta6/building-group-satisfy.png"
        />
        <ul class="ml-6 mt-2">
          <li>The group keeps its building count and the clock is rescaled to hit the new output. The count is only re-solved when the clock would land outside the game's 1-250%.</li>
          <li>Where a group cannot hold the change at all, the button is there but disabled, and says why.</li>
          <li>The <b>Satisfy</b> and <b>Trim</b> beside the Qty are the pair you already know, one level up: they match the <i>product</i> to what the factory and its exports ask for. The group buttons match the <i>groups</i> to the product.</li>
          <li>How far the groups may sit from the product before they count as imbalanced is now a percentage of what the product asks for, 1% by default, under <b>Options → Building groups</b>. It was a flat 0.1 buildings, which meant one effective building of Limestone and one of Iron Rods were allowed the same drift, and a 360/min mine read as balanced while 6/min short.</li>
        </ul>

        <v-divider class="subsection" />

        <h2>👍 <i class="fas fa-list ml-1" /><span class="ml-2">Factories Summary</span></h2>
        <p>The summary now aggregates every issue in the plan, in its header and in its sidebar row, so you can see everything wrong at a glance and go from there.</p>
        <v-img
          alt="The Factories Summary, with status counts in its header"
          max-width="1200"
          src="/assets/changelog/beta6/factories-summary.png"
        />
        <p class="mt-2"><b>Click a count to list only the factories behind it</b>, and click it again to clear.</p>
        <v-img
          alt="The Factories Summary filtered to the three factories with shortages"
          max-width="1200"
          src="/assets/changelog/beta6/factories-summary-filtered.png"
        />

        <v-divider class="subsection" />

        <h2>👍 <i class="fas fa-chart-line ml-1" /><span class="ml-2">Statistics enhancements</span></h2>
        <h3>Item Production</h3>
        <p><b>Product Surplus &amp; Deficit and Produced Items are now one section.</b> Item Production lists every item, with a search box and filters for surplus, deficit and balanced. The filter counts follow the search. The "Show all Products" toggle has gone with the section it controlled.</p>
        <v-img
          alt="The Item Production table, with each item broken down by factory"
          max-width="1200"
          src="/assets/changelog/beta6/statistics-items.png"
        />
        <h3 class="mt-4">Buildings</h3>
        <p><b>Building Summary now says which factories hold each building.</b></p>
        <v-img
          alt="The Building Summary table, listing every factory that holds each building"
          max-width="1200"
          src="/assets/changelog/beta6/statistics-buildings.png"
        />
        <h3 class="mt-4">Power</h3>
        <p><b>Power Consumption and Generation gains a By factory breakdown</b>, heaviest net drain first, collapsed by default.</p>
        <v-img
          alt="Power consumption and generation broken down by factory"
          max-width="1200"
          src="/assets/changelog/beta6/statistics-power-by-factory.png"
        />

        <v-divider class="subsection" />

        <h2>👍 <i class="fas fa-tasks ml-1" /><span class="ml-2">Tasks</span></h2>
        <p><b>Tasks drag into any order</b>, by the grip handle on the left. Completed tasks drag too. The card has had a tidy-up while it was open.</p>
        <p><b>A task you have typed is added when you click away</b>, not only when you press enter, so going back to the plan mid-thought no longer loses it.</p>
        <v-img
          alt="The factory tasks card with drag handles and checkboxes"
          max-width="1200"
          src="/assets/changelog/beta6/tasks.png"
        />

        <v-divider class="subsection" />

        <h2>👍 <i class="fas fa-calculator ml-1" /><span class="ml-2">Export Calculator: belts, pipes and Fluid Trucks</span></h2>
        <ul class="ml-6">
          <li><b>Belts are back</b>, per destination: how many conveyors of a chosen mark carry the export, across all six marks (60/120/270/480/780/1,200 per min), with the smallest belt that fits picked by default.</li>
          <li><b>Belt groups</b> split an export across several runs, each with its own mark. Enter an items/min amount or a whole number of belts and the other follows. Only undercapacity warns, with an amber nudge when a whole group could go and the rest would still cover it. Groups persist with the plan.</li>
          <li><b>Pipes</b> do the same for fluids, Mk.1 (300 m³/min) and Mk.2 (600 m³/min), with their own groups.</li>
          <li><b>Fluid Trucks</b> (3,200 m³, added in patch 1.2) are supported, so the Truck column calculates fluid exports. Drones and Tractors can't carry raw fluids, and say so.</li>
        </ul>
        <v-img
          alt="The export calculator on a fluid export: Fluid Freight Cars and Fluid Trucks, with 600 m³/min split across two Mk.1 pipe groups"
          class="mt-2"
          max-width="1200"
          src="/assets/changelog/beta6/export-calculator-fluids.png"
        />

        <v-divider class="subsection" />

        <h2>👍 <i class="fas fa-compass ml-1" /><span class="ml-2">Navigation improvements</span></h2>
        <ul class="ml-6">
          <li><b>The sidebar shows which factory you're looking at</b>, with an orange bar that follows you as you scroll or jump. The Statistics and Factories Summary links get the same treatment.
            <v-img
              alt="The sidebar factory list, with an orange bar marking the factory in view"
              class="mt-2"
              max-width="420"
              src="/assets/changelog/beta6/sidebar-active-factory.png"
            />
          </li>
          <li><b>Jump straight to the import taking an export</b>, from any export chip in the satisfaction table via the small eye button on its edge, or from the part chips under a collapsed factory's "Exporting:" list. You land on the import row itself, not just on the destination factory. Clicking the chip itself still selects that destination in the Export Calculator. An import's <b>View</b> button makes the trip in reverse, landing on the product that supplies it.
            <v-img
              alt="An export chip with the eye button that jumps to the requesting factory"
              class="mt-2"
              max-width="420"
              src="/assets/changelog/beta6/export-chip-jump.png"
            />
          </li>
          <li><b>Every jump pulses what it landed on</b> — the import row, the factory's header, the section's heading — so you can see where you have been taken rather than hunting the screen for what changed. A chip that counts several things lights all of them: "3 shortages" takes you to the first and pulses all three.</li>
          <li><b>A "Full width" button</b> in the sidebar, beside Hide all and Expand all, lets the plan use the entire window on a wide screen instead of the margins the planner normally keeps. On a 2560px monitor that is around 500px of width handed back to the plan. Your choice is remembered.</li>
          <li><b>Every button in the sidebar says what it does</b> on hover, including the greyed-out ones — which now tell you what they are waiting for rather than just sitting there.</li>
          <li>An <b>Exported</b> chip sits beside Product and Imported on any item another factory has asked for.</li>
          <li><b>Every game image has a tooltip.</b></li>
        </ul>

        <v-divider class="subsection" />

        <h2>🔧 <i class="fas fa-bullseye ml-1" /><span class="ml-2">Plan accuracy fixes</span></h2>
        <p>A factory could claim to export a part to a factory with no matching import, or quietly export the wrong amount.</p>
        <ul class="ml-6">
          <li><b>Two factories could have ended up with the same ID</b>, at roughly a one-in-six chance in a 60-factory plan, which merged them as far as imports and exports were concerned. IDs are now entirely unique.</li>
          <li><b>Duplicate imports were counted twice.</b> They are no longer possible, and any already in your plan are repaired when it loads.</li>
          <li><b>Extra validation on the import/export chain.</b> Exports left behind get cleaned up, and imports pointing at factories that no longer exist are removed.</li>
          <li><b>Loading a plan now runs those checks</b>, repairs what it finds, and reports it. An example:
            <v-img
              alt="The plan repair dialog, listing every automatic correction by factory"
              class="mt-2"
              max-width="1200"
              src="/assets/changelog/beta6/plan-repair.png"
            />
          </li>
        </ul>

        <v-divider class="subsection" />

        <h2>🔧 Fixes &amp; minor adjustments</h2>
        <ul class="ml-6">
          <li><b>Various rounding errors have been fixed</b>, in the game data and in plans already carrying the drifted numbers, which repair themselves on load. Please report any more on Discord.</li>
          <li>Tooltips and toasts now escape the text they are given, so nothing carried inside a plan can put markup onto the page.</li>
          <li>A building group no longer appears to accept more Somersloops than the building has slots for. Entries clamp as you type and the up arrow greys out once the slots are full. The calculation was always correct; only the number on screen disagreed.</li>
          <li>The hidden sidebar's hover tray no longer sticks open when the cursor leaves the window.</li>
        </ul>

        <v-divider class="subsection" />

        <h2>👍 <i class="fas fa-file ml-1" /><span class="ml-2">Smaller things</span></h2>
        <ul class="ml-6">
          <li>A new <b>Mining</b> template plan showing all of the above end to end, and the Demo plan gains a Copper Mine feeding its Copper Ingots.</li>
          <li>Every raw resource in the Imports section gets a one-click button to mine it in that factory, at the amount you're short of.</li>
          <li>The Converter's ore recipes name the conversion, "Iron Ore (Convert: Limestone)", so they don't read as though the ore came from limestone.</li>
        </ul>

        <v-divider />
        <h1>Beta v0.5 - The "Overclocked" Update <span class="release-date">21/Jul/2026</span></h1>
        <p>After a long hiatus, we're excited to add the highly anticipated Overclocking and Somersloop support!</p>
        <nav v-if="sectionsOf('Beta v0.5').length" class="toc">
          <p class="mb-1"><b>In this update:</b></p>
          <ul class="toc-list">
            <li v-for="section in sectionsOf('Beta v0.5')" :key="section.id">
              <a :href="`#${section.id}`" @click.prevent="jumpTo(section.id)">{{ section.title }}</a>
            </li>
          </ul>
        </nav>
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
        <h1>Alpha v0.4 <span class="release-date">25/Jan/2025</span></h1>

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
  interface Entry { id: string; title: string }
  interface Release extends Entry { date: string; sections: Entry[] }

  // The contents are read back off the rendered headings rather than kept as a second list beside
  // them: a hand-written one silently goes stale the next time a section is added here.
  const content = ref<{ $el: HTMLElement } | null>(null)
  const releases = ref<Release[]>([])

  const slug = (title: string) =>
    title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

  const sectionsOf = (prefix: string) =>
    releases.value.find(release => release.title.startsWith(prefix))?.sections ?? []

  const jumpTo = (id: string) => {
    const target = document.getElementById(id)
    if (!target) return
    // Deliberately not smooth: the page is 16,000px of unsized screenshots, so images finishing
    // during the animation move the target and the scroll lands thousands of pixels short.
    target.scrollIntoView({ block: 'start' })
    history.replaceState(null, '', `#${id}`)

    // Screenshots above the target finish loading and push it down after the jump. Land it a
    // second time, unless the reader has scrolled themselves in the meantime.
    const landed = document.scrollingElement?.scrollTop ?? 0
    setTimeout(() => {
      if ((document.scrollingElement?.scrollTop ?? 0) !== landed) return
      target.scrollIntoView({ block: 'start' })
    }, 400)
  }

  onMounted(() => {
    const root = content.value?.$el
    if (!root) return

    const found: Release[] = []
    for (const heading of root.querySelectorAll('h1, h2')) {
      // The date is rendered inside the heading so it has one home; it is not part of the title.
      const date = heading.querySelector('.release-date')?.textContent?.trim() ?? ''
      const title = (heading.textContent ?? '').replace(date, '').trim()
      if (!title || title === 'Change Log') continue

      if (heading.tagName === 'H1') {
        if (!heading.id) heading.id = slug(title)
        found.push({ id: heading.id, title, date, sections: [] })
      } else {
        // Scoped to the release: "Fixes & minor adjustments" is a heading in most of them, and a
        // shared id sends every one of those links to the first.
        const release = found.at(-1)
        if (!heading.id) heading.id = `${release?.id ?? 'section'}-${slug(title)}`
        release?.sections.push({ id: heading.id, title })
      }
    }
    releases.value = found

    // A link shared into the page can only resolve once the ids above exist.
    const hash = window.location.hash.slice(1)
    if (hash) nextTick(() => jumpTo(hash))
  })
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
  // Clears the app bar when a contents link lands on a heading.
  scroll-margin-top: 90px;
}

// The breaking change leads the release, so its heading is the one that reads as a warning.
.breaking {
  color: var(--sf-error);
}

// The status tiers, coloured as the chips themselves are: red and amber paint the factory,
// an amber note leaves it green.
.status-tiers {
  li { margin-bottom: 0.1rem; }

  // The nested statuses keep their tier's colour; only the tier headers are bold.
  > li > ul { margin-bottom: 0.4rem; }
}

.tier-problem { color: var(--sf-problem); }
.tier-warning { color: var(--sf-status-warning); }
.tier-note { color: var(--sf-yellow); }
.tier-info { color: var(--sf-blue); }

.release-date {
  color: #bdbdbd;
  font-size: 1rem;
  font-weight: 400;
  margin-left: 0.5rem;
  white-space: nowrap;
}

.toc {
  background-color: rgba(255, 255, 255, 0.04);
  border-radius: 4px;
  padding: 0.75rem 1rem;

  .toc-list {
    columns: 2;
    margin-bottom: 0;

    li {
      break-inside: avoid;
      margin-bottom: 0.15rem;
    }
  }

  a {
    color: rgb(var(--v-theme-primary));
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }
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
