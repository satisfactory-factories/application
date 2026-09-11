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
              <ul v-if="release.summary" class="toc-summary">
                <li>{{ release.summary }}</li>
              </ul>
            </li>
          </ul>
        </nav>
        <v-divider />
        <h1>Beta v0.7 - The "SINKronisation" Update <span class="release-date">09/Sep/2026</span><span class="release-summary">Realtime sync, rooms and offline mode</span></h1>
        <p>The old cloud save has been gutted and a new one built in its place. Every tab is a plan in its own right on your account, a plan can be handed to a friend as a link you both edit at the same time, and offline is a mode you choose rather than a failure state you fall into.</p>
        <nav v-if="sectionsOf('Beta v0.7').length" class="toc">
          <p class="mb-1"><b>In this update:</b></p>
          <ul class="toc-list">
            <li v-for="section in sectionsOf('Beta v0.7')" :key="section.id">
              <a :href="`#${section.id}`" @click.prevent="jumpTo(section.id)">{{ section.title }}</a>
            </li>
          </ul>
        </nav>

        <h2>🆕 <i class="fas fa-folder-open ml-1" /><span class="ml-2">Every tab is local, synced or shared</span></h2>
        <p>The old model saved one tab as a blob every ten seconds and the last writer won, so two devices could quietly overwrite each other and the only fix was a manual force download. That is replaced by three kinds of tab, and you pick.</p>
        <ul class="ml-6 mt-2">
          <li><b>Local</b> lives in this browser and needs no account, exactly like every tab did before. <b>Synced</b> lives on your account and can be opened on any device you sign in on. <b>Shared</b> is a synced tab you have invited other people into, and everyone edits the same plan live.</li>
          <li><b>The + button now opens a chooser</b> rather than silently making a local tab, with a one-time dot pointing it out. Local stays the default, so nothing changes for anyone who never signs in. Pick synced without an account and you can sign in or register on the same dialog.</li>
          <li><b>The + button also lists the cloud plans you have closed in this browser</b>, each with the same Show button the account panel uses. Signed out, or with every plan already open, the list is simply not there.</li>
          <li><b>Each tab wears its kind in the tab bar</b>: a monitor for local, a cloud for synced, a group of people for shared. A shared tab also shows how many people are in it right now.</li>
          <li><b>The pencil on the current tab opens a tab settings dialog</b> instead of renaming in place. It renames the tab, sends a local plan to the cloud, converts a cloud plan back to a local tab, and holds the Share Settings button. Renaming a cloud plan stays owner-only, and the dialog says so.</li>
          <li><b>Tab settings can hide a cloud plan</b>, sat above Convert to local because it is the gentler answer to the same question: hiding closes the tab in this browser and nothing else, where converting takes the plan off your account.</li>
          <li><b>The tab bar's three action icons have moved into tab settings.</b> The share icon duplicated the dialog's own Share Settings button; the copy icon is now <i>Copy to a local tab</i>, in words; and the bin, which sat one mis-click from the plan beside it, is a Delete button in a walled-off red section at the bottom.</li>
          <li><b>Tabs can be dragged into whatever order you like</b>, and the order of your synced tabs follows your account. Local tabs belong to this browser and hold the position you put them in.</li>
          <li><b>A local tab keeps its identity when you sync it.</b> Its ID becomes the plan's ID on the server, so nothing about it is recreated or renamed.</li>
          <li>Synced tabs still write their full contents to this browser exactly as before. That copy is what draws the screen, and it is what you would be left holding if the server were unreachable.</li>
        </ul>
        <v-divider class="subsection" />

        <h2>🆕 <i class="fas fa-link ml-1" /><span class="ml-2">Sharing: two links that are never mixed up</span></h2>
        <ul class="ml-6 mt-2">
          <li><b>Copy snapshot link</b> is what <code>/share</code> has always been: a frozen copy of the plan as it is right now, which whoever opens it keeps as their own. It works on any tab and needs no account.</li>
          <li><b>A snapshot link is made once per version of the plan.</b> Reopening the dialog on a plan you have not touched shows the link you already made rather than minting a second one to identical bytes. It is copied to your clipboard the moment it is made, and the button says <i>Copied!</i> so you can see that it was.</li>
          <li><b>Invite collaborators</b> is new. A synced tab gets a link of the form <code>satisfactory-factories.app/room/three-word-slug</code>, and anyone who opens it is editing <i>your</i> plan with you. You can set your own words for the link, and the dialog tells you live whether they are free.</li>
          <li><b>An invite can carry a password.</b> Set one and anyone new is asked for it once. Change it and anyone who joined anonymously is dropped while people signed in keep their access. Remove it and the link is open again.</li>
          <li><b>Stop sharing puts the plan back to private.</b> Everyone else is removed and keeps their own copy of the last state they saw, and the tab in their bar quietly becomes a local one with a note saying why. Sharing again restores the same link.</li>
          <li>Deleting a shared plan does the same thing to everyone in it. <b>Nobody ever loses data because of something the owner did.</b></li>
          <li><b>Duplicate as a local tab</b> is available on any synced or shared tab, at any time, for an independent copy that answers to nobody.</li>
        </ul>
        <v-divider class="subsection" />

        <h2>🆕 <i class="fas fa-users ml-1" /><span class="ml-2">Editing together</span></h2>
        <p>Changes flow both ways over a single connection and land on the other side in about as long as the network takes. You can both work in the same plan at once.</p>
        <ul class="ml-6 mt-2">
          <li><b>Edits to different factories both survive.</b> Edits to the same factory settle on one of them rather than merging into something neither of you asked for.</li>
          <li>What you see is always your last acknowledged state from the server, plus everything you have changed since, fully recalculated. A change of yours is never dropped in favour of an incoming one, and nothing is ever half-applied.</li>
          <li>The owner can rename, share, unshare, set the link, set a password and delete. Everyone else can edit the plan and leave. Renames reach every device.</li>
          <li><b>One person at a time in a text field.</b> Click into a factory's notes and that box is held for you: everyone else sees it greyed out with "Another builder is editing this" until you click away. Keep typing and it stays yours; leave it alone for ten seconds and it is released. It is per field, so the factory next to yours is still open to everybody.</li>
          <li><b>Emptying a shared plan is something you have to mean.</b> Clearing it, pasting over it or loading a template into it says so as it sends. Anything else that asks to delete most of the plan in one go is refused and handed the server's copy back, so a browser in a bad state cannot take everyone's plan down with it. The server also keeps the plan as it stood immediately before a bulk deletion.</li>
        </ul>
        <v-divider class="subsection" />

        <h2>🆕 <i class="fas fa-plane ml-1" /><span class="ml-2">Offline mode</span></h2>
        <p>A switch <b>in the account panel</b>, on the cloud account tile rather than under Options, puts the planner into offline mode, which means exactly no contact with the server: no connection, no requests, no retries. Keep planning; everything is kept on this device.</p>
        <ul class="ml-6 mt-2">
          <li>Switching it on says so once and then gets out of the way. That you are still in offline mode is shown by the chip in the tab bar and by the account panel, which is also where you switch it back off.</li>
          <li>If the connection drops on its own, a small bar asks whether you want to go offline rather than deciding for you. Say no and it keeps quietly retrying.</li>
          <li><b>Coming back online is manual, like a phone.</b> When you switch it off, the planner reconnects, takes the server's current state, re-applies everything you changed while you were away, recalculates and sends it. Edits made offline survive closing the browser.</li>
          <li><b>If somebody else changed the same factories while you were away, the planner asks before deciding for you.</b> Coming back raises one prompt listing every factory both sides edited, with the live plan's figures beside yours product by product, and you pick which version wins for each. Everything that does not clash syncs safely either way, and a tick box keeps this device's version as a separate local tab whatever you choose.</li>
          <li><b>That prompt survives a refresh.</b> Reloading the page with the question still on screen used to quietly pick your version and send it, overwriting whatever the other person had done.</li>
          <li><b>Two browser tabs open on the same planner no longer overwrite each other's unsent work.</b> Each keeps its own record of what it still owes the server.</li>
          <li><b>If your browser runs out of storage the planner says so and keeps going.</b> Your edits stay on screen and are saved as soon as there is room again.</li>
          <li>Nothing else about this interrupts you. There are no popups to dismiss while you plan, and that prompt is the only question offline work will ever raise.</li>
        </ul>
        <v-divider class="subsection" />

        <h2>🆕 <i class="fas fa-user ml-1" /><span class="ml-2">The account panel</span></h2>
        <p>The account tile has been rebuilt: your username, a live connection indicator, the offline switch, your plans under two tabs, and Change password.</p>
        <ul class="ml-6 mt-2">
          <li><b>The Local tab</b> lists the plans that live in this browser only, each with a cloud button that syncs it to your account on the spot. <b>The Cloud tab</b> splits your synced plans into My Plans (the ones you own) and Joined Plans (the ones shared with you), each showing how many factories it holds and when it last changed.</li>
          <li><b>Cloud plans open where you choose.</b> Every plan on your account is listed with a Show or Hide button. Show opens the plan as a tab in this browser; Hide closes that tab and nothing more. The plan stays on your account and on every other device it is open on.</li>
          <li><b>Every list of your plans now reads at a glance</b>: the plan's size is the factory icon and a number, exactly as the sidebar's Global Factories Summary shows it, and the time beside it is spelled out as "Last updated 38 minutes ago". That goes for the account panel, the sign-in chooser and the + button's list alike.</li>
          <li>Signing in or refreshing no longer opens a tab for every plan on your account. The tabs you had open stay open, and the rest wait in the panel.</li>
          <li><b>Signing in asks which of your plans to open.</b> The dialog lists every account plan this browser does not have open, all ticked, each with its size and when it last changed, with Select all and Select none. Untick what you want left in the panel, or choose "Not now" to open none. A page refresh never asks, and neither does an account with no plans.</li>
          <li><b>Changing your password now signs out every device</b>, including the one that changed it. Sign-ins made on the old password stop working the moment the change lands, so a password you had to change because somebody else knew it takes their access with it.</li>
          <li>The panel's per-plan share buttons are gone; sharing lives on the planner toolbar's share button. The out-of-sync dialog and the force download button are gone too; neither has anything to do now.</li>
          <li><b>A plan you saved to your account before v0.7 is brought over on its own.</b> Sign in, or open the planner while you are already signed in, and the old save becomes a cloud plan without you having to ask, with a short message saying where it came from. It arrives as a tab of its own, so everything already open and every plan already on your account is left exactly as it was. It happens once per account, and the plan comes over whole: its name, its power target, its factory groups and its Depot research.</li>
          <li>Signing in offers to sync any local plans the server does not know about, one at a time, and never forces it. Names that would collide get a "(local)" suffix rather than being merged. <b>The offer is remembered per account, not per browser</b>, so saying "No thanks" on one account no longer silences the question for the next.</li>
          <li><b>A plan pasted in while you are signed in is offered to the cloud on the spot</b>, rather than having nothing pointing at the cloud until you found tab settings yourself. Saying no leaves it local and is not treated as an answer about anything else.</li>
        </ul>
        <v-divider class="subsection" />

        <h2>🆕 <i class="fas fa-file-export ml-1" /><span class="ml-2">Plans go in and out as files</span></h2>
        <ul class="ml-6 mt-2">
          <li><b>Copy plan has become Export plan</b>, and it asks where the plan should go: <i>Save as a file</i> downloads it as JSON named after the plan, and <i>Copy to clipboard</i> is what it always did. <b>Paste plan has become Import plan</b>, which asks where the plan is coming from: a file or the clipboard. Everything either way is the whole plan: every factory, its groups, the power target and the Depot research.</li>
          <li><b>The clipboard half says what your browser is about to do.</b> Reading the clipboard is a permission, and some browsers ask for it themselves: Firefox puts a Paste button by the pointer, and nothing arrives until you press it. If the read is refused, the dialog says so instead of doing nothing at all.</li>
          <li><b>An import that fails now says why, in the dialog it failed in</b>, rather than through a browser alert you have to dismiss before you can try the other way in.</li>
        </ul>
        <v-divider class="subsection" />

        <h2>👍 <i class="fas fa-sliders-h ml-1" /><span class="ml-2">Your settings follow your account</span></h2>
        <p>Preferences that are about <i>you</i> rather than about this computer now travel with your account: satisfaction breakdowns, the group colours you have used, the tutorial and introduction you have already dismissed, the statistics panels you keep hidden and the summary you keep collapsed. Sign in on a new machine and the planner is set up the way you left it.</p>
        <ul class="ml-6 mt-2">
          <li>Settings this browser has that your account has never seen are kept and uploaded rather than overwritten, so signing in for the first time on a machine never wipes what was already there.</li>
        </ul>
        <v-divider class="subsection" />

        <h2>👍 <i class="fas fa-spinner ml-1" /><span class="ml-2">Loading</span></h2>
        <ul class="ml-6 mt-2">
          <li>Switching to a tab the server has already confirmed is current no longer recalculates it. A small plan opens instantly.</li>
          <li>A big plan still gets the loading dialog while it draws, and the dialog now appears the moment you click the tab. Drawing a hundred factory cards takes a moment whether or not there was anything to calculate, and the wait used to happen with nothing on screen to say so.</li>
          <li>Plan data arriving from the server goes through the same loading and validation path as a plan opened from this browser, instead of being written in behind it.</li>
          <li><b>A plan that is still drawing is left alone.</b> Someone else opening a shared plan could previously make everyone's copy lose the factories their screen had not reached yet, which showed up as red factories and a data-corruption warning for everybody else. The plan catches up with the server the moment it has finished drawing.</li>
        </ul>
        <v-divider class="subsection" />

        <h2>👍 <i class="fas fa-clock ml-1" /><span class="ml-2">Knowing what just happened</span></h2>
        <ul class="ml-6 mt-2">
          <li><b>"Last updated" sits beside the search box</b> and says when the plan in the tab you are looking at last changed, flashing as it moves. Your own edits and a collaborator's both count. Renaming a factory or dragging one somewhere else does not, so the line stays worth reading. It works on a local tab too, and it remembers across a refresh.</li>
          <li><b>A notice you need to act on now waits for you.</b> A plan deleted by its owner leaves a notice you close yourself, so it cannot slide past while you are looking elsewhere. A notice that is only keeping you informed counts itself down and then goes.</li>
          <li><b>The planner says so when the backend is having problems.</b> A red bar along the bottom names the Discord to report it on, and says which features are away until it is back. Nothing in your tabs is lost while it is: everything is kept in this browser and syncs when the server answers again. Closes #108.</li>
        </ul>
        <v-divider class="subsection" />

        <h2>🆕 <i class="fas fa-search ml-1" /><span class="ml-2">Search the plan</span></h2>
        <p>A search box now sits next to Options in the tab bar. Type a factory name to jump straight to it, or type a part to see every factory that touches it, with the results appearing under the box as you type.</p>
        <ul class="ml-6 mt-2">
          <li><b>Part results are grouped by what the factory does with the part</b>: Production first, then Byproduct, then Other usage (imports, exports and plain ingredient demand), each row saying which it is and how much per minute.</li>
          <li><b>Clicking a result lands on the row it names</b>, not just the factory card: the product row for production and byproducts, the import row it came from for an import, and the part's satisfaction row for everything else.</li>
          <li><b>Every result wears the factory chip</b> used everywhere else in the planner, and a factory filed under a group carries that group's colour on the chip's left edge.</li>
          <li><b>Ctrl/Cmd+K</b> opens it from anywhere. The arrow keys walk the results and Enter opens one.</li>
          <li>On a narrow screen, where the tab bar has no room for a box, it is a search button that opens the same panel.</li>
        </ul>
        <v-divider class="subsection" />

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

        <h2>🆕 <i class="fas fa-cubes ml-1" /><span class="ml-2">Material Costs</span></h2>
        <p>Power &amp; Buildings now has a Material Costs panel: what it would cost, in parts, to build every production building, power generator and custom building in the factory. Closed by default; toggle it open to see the breakdown.</p>
        <ul class="ml-6 mt-2">
          <li>Each part lists its total quantity, and a chip per building that needs it, showing that building's image and how many of them.</li>
          <li><b>Use this as a guide only.</b> No assumptions are made about belts, foundations, or any other structural or cosmetic building. Only production buildings, power generators and custom buildings directly involved in making your products are counted.</li>
        </ul>
        <v-divider class="subsection" />

        <h2>🆕 <i class="fas fa-recycle ml-1" /><span class="ml-2">AWESOME Sinks and the Dimensional Depot</span></h2>
        <p>Closes #498 and the surplus half of #7. Every item under a factory's Satisfaction now has a <b>Storage</b> column, left of Satisfaction, holding two counts: how many AWESOME Sinks and how many Dimensional Depot Uploaders you have put on that item's surplus.</p>
        <ul class="ml-6 mt-2">
          <li><b>An AWESOME Sink disposes of the surplus, so the planner treats it as gone.</b> Set one or more on an item and its surplus reads <code>0/min surplus</code>, with a gold <b>n/min sunk</b> chip beside it and the pre-sink figure in brackets underneath, so the number sinking removed is never hidden. The sink is a priority splitter, not a consumer with an appetite of its own: internal use and exports are served first and always win, so adding an export request later shrinks the sunk amount by itself. A fully sunk item also stops being nagged with Trim.</li>
          <li><b>Sinks draw power</b>, 30 MW each, counted into the factory's consumption and so into the plan's, matching <code>Build_ResourceSink_C</code> in the game's own data. The Depot Uploader draws nothing.</li>
          <li><b>The sink refuses what the game refuses.</b> No control is offered for fluids (the sink has a conveyor input only) or radioactive items, and a count left on one from an earlier edit stays inert. The Uploader takes a conveyor and nothing else too, so fluids are excluded from it, but it has no objection to radioactive items, since uploading one is how you stop it irradiating you.</li>
          <li><b>Both controls are offered on every item</b>, whether the factory makes it, imports it, or is short of it. They first shipped gated on a surplus, which hid them from the build the Depot is most useful for: a logistics factory that imports a part precisely so it can upload it has imports that balance exactly, so it had no surplus, so it was offered no Uploader.</li>
          <li><b>A Dimensional Depot Uploader deliberately changes no number.</b> The Depot is finite storage: it fills, and then it backs up like any other container. Marking an item for the Depot records what you are building and what it costs, and leaves the surplus exactly as it is.</li>
          <li><b>New "Will cause backlog" warning.</b> Any item left with a surplus nothing consumes, nothing exports and no sink takes will fill the belt and stall the buildings making it, including the case nothing could previously see, where a factory makes 200 Iron Plates, ships 100, and the other 100 quietly back up. It is an amber warning and marks the factory amber, because there is now a control in the same row that fixes it; it can be switched off entirely under <b>Options → Satisfaction</b> for a plan mid-build.</li>
          <li><b>New Dimensional Depot section</b>, its own card under the Statistics summary and only on plans that use it. One row per item: what the plan has spare to upload, how many Uploaders are on it, and a pill per factory carrying that factory's own count. It flags an item arriving faster than its Uploaders can take it (240/min each, fully researched), so the remainder still backs up. Clicking a factory pill lands on that item's own row under the factory's Satisfaction, unhiding the card and opening its group on the way.</li>
          <li><b>The Depot's MAM upload research is part of the plan.</b> An Uploader moves 15/min unresearched and doubles with each of the four upgrades to 240/min, and the rate is per Uploader. The section reports each item's rate against what its own Uploaders can take (<code>40 / 480/min</code>). <b>The expansion research sits beside it</b>: how many stacks of each item the Depot holds, 1 to 5. It changes no calculation, because the planner tracks rates rather than how full a container is, but it is what "the Depot is finite" actually means. Both are saved on the plan, so a shared plan carries the world it was written against.</li>
          <li><b>Mercer Spheres join Power Shards and Somersloops</b> in the statistics, at one per Uploader, read off the game's build recipe, with the MAM research the Depot costs listed under them with a tick-box each: upload research, depot expansion, and the optional Manual Uploader. All three are off the total by default, since they are paid once per save rather than once per plan. Ticked together at full research they come to the 97 the wiki quotes for the whole chain, which a test now pins. The Mercer Sphere icon is new, since it is a collectable rather than a craftable part.</li>
          <li><b>The Dimensional Depot has a sidebar entry</b>, beneath the Global Factories Summary, carrying icon-only counts of items tracked, Uploaders and Mercer Spheres, plus an over-capacity warning when it applies.</li>
          <li><b>The first sink and the first Uploader each get a one-off explainer.</b> The sink one states the two assumptions behind a sunk item: Programmable Splitters sending the excess to your sinks, and a belt of adequate speed feeding them. The Uploader one points at the plan-wide summary and is clear that nothing is assumed about how much an Uploader takes off the belt, only that it eventually backs up.</li>
          <li><b>The Demo plan uses the Depot</b>, so the section is visible on the first plan anyone opens: two Uploaders on Copper Ingot, and one each on Circuit Board, Copper Sheet and Plastic.</li>
          <li>Three tooltips that promised sinking was "coming in a future update" now point at the control that does it, and the <b>End product</b> chip no longer claims the planner assumes you sink it; you say so.</li>
        </ul>
        <v-divider class="subsection" />

        <h2>👍 <i class="fas fa-list-check ml-1" /><span class="ml-2">Checklist: a desynced item now says what changed</span></h2>
        <p>A ticked checklist item whose number the plan has since moved was flagged only as "desynced", which said something had changed but not what, so the only way to find out was to remember what the number used to be.</p>
        <ul class="ml-6 mt-2">
          <li><b>Every desynced row now carries an amber chip with both numbers</b>: <code>560/min → 720/min</code> for a product, import or export, <code>4 buildings → 6 buildings</code> for a power generator. Hovering it spells out the two ways forward: build the difference and confirm it, or change the plan back to match what you have already built. <b>Clicking that chip confirms the new number</b>, exactly as re-ticking the row's checkbox does.</li>
          <li><b>The Checklist panel opens with an amber summary</b> when anything has drifted, saying how many items are affected, with a <b>Reconfirm all</b> button for when you have already rebuilt the lot. Reconfirming only touches rows that actually moved.</li>
          <li><b>The factory's Checklist chip counts them</b>, reading <code>Checklist: 12/14 · 2 to reconfirm</code> instead of saying <code>(desynced)</code>, so a collapsed factory card tells you whether it is one stale row or nine.</li>
          <li><b>A desynced checklist is now a factory status of its own</b>, so it wears an amber <b>Checklist desync</b> chip everywhere the other statuses appear: the card header, the sidebar entry, the Factories Summary, and the plan- and group-level tallies. It carries the icons of the items that moved. Previously the only clue in the sidebar was a counter quietly changing colour, which said a factory was amber without saying why.</li>
          <li><b>The Checklist panel is three tables side by side</b>: Products (with Power beneath it), Imports and Exports, in place of one list stacked four groups deep. Imports and Exports are listed by item, with a tick per source or destination factory hanging off it, so a factory buying three parts from the same neighbour names that neighbour once per part rather than repeating the item name for every factory it deals with.</li>
          <li>The checkboxes on the Products, Imports, Power and Satisfaction rows carry the same two numbers in their hover text, where there is no room for a chip.</li>
        </ul>
        <v-divider class="subsection" />

        <h2>🆕 <i class="fas fa-bolt ml-1" /><span class="ml-2">Power generators: match the fuel to what the factory can supply</span></h2>
        <ul class="ml-6 mt-2">
          <li><b>A generator burning fuel its own factory makes now offers to match its draw to the supply</b>, with the same green <b>Expand to supply</b> and yellow <b>Trim to supply</b> pair the product rows carry, and the figure it would land on named on the button. A Fuel-Powered Generator set to 1,280 Liquid Fuel a minute in a factory that only has 1,120 spare offers <b>Trim to supply (1120)</b>.</li>
          <li><b>The figure accounts for everything else that wants the fuel</b>, not just the generators. An oil plant that sends 120 Liquid Fuel a minute to Recycled Rubber and 40 to a Packager has 160 less to burn than it makes, which is exactly the sum this saves you doing by hand. Exports to other factories count too, and so does another generator burning the same fuel.</li>
          <li><b>A surplus the AWESOME Sink is currently mopping up still counts as spare</b>, because burning fuel beats sinking it. Take it, and the sinks drop out of the plan by themselves.</li>
          <li>The buttons appear only where there is something to match against: a generator whose fuel is entirely imported is left alone, as are Geothermal Generators, which have no fuel, and Alien Power Augmenters, whose matrix demand is decided by their building groups.</li>
          <li><b>The generator's row now wraps</b> rather than running off the edge of the card. It is the widest row in the planner, and on a 1440px screen with the sidebar open the new button had nowhere left to go.</li>
          <li>A debug template, <b>"#656: Generator fuel draw"</b>, shows it working: two self-contained factories, one offering the Trim and the other the Expand, both landing on the same 400.</li>
        </ul>
        <v-divider class="subsection" />

        <h2>🔧 <i class="fas fa-sort ml-1" /><span class="ml-2">Arrange the plan without dragging</span></h2>
        <p>The sidebar could not be scrolled on a phone. Picking a factory or a group up is the same gesture as scrolling the list, so a touch meant to scroll dragged the row instead. Dragging is now offered only where the pointer is precise enough for it.</p>
        <ul class="ml-6 mt-2">
          <li><b>Arrange</b> opens a dialog for reordering the plan with buttons: groups against each other, factories within their group, and factories from one group into another.</li>
          <li>Groups can still be dragged in that dialog, and in the sidebar, wherever there is a pointer to drag with.</li>
          <li><b>Add Factory moved to the top of the sidebar.</b> It used to sit below every group, so a plan with a lot of groups meant scrolling all the way down to add one more ungrouped factory, which then appeared back at the top. (#597)</li>
          <li><b>The sidebar now follows the orange scroll-spy indicator.</b> Scroll the plan and the sidebar smoothly scrolls itself to keep the highlighted factory in view, instead of leaving it to drift off-screen. Closes #598.</li>
        </ul>
        <v-divider class="subsection" />

        <h2>👍 <i class="fas fa-window-maximize ml-1" /><span class="ml-2">Interface</span></h2>
        <ul class="ml-6 mt-2">
          <li><b>Every dialog in the planner now has the same header and spacing.</b> Vuetify's stock card title sat the heading flush in the top-left corner with no breathing room, and each dialog had drifted its own way from there: some closed from a button at the bottom of the actions row, some had no way out but the scrim, and body text came in three different sizes. They now share one shell: a padded title row with the icon beside the heading, the close button in the top-right corner where a dialog's way out belongs, and body text at a single size. Dialogs that ask for a decision before they will go away still have no corner close, deliberately.</li>
          <li><b>The "Show Info" toggle is gone</b>, along with the explanatory paragraphs it hid throughout the planner. Nobody was clicking it, and the copy behind it hadn't kept pace with the app for several updates. The always-visible ⓘ tooltips elsewhere are unaffected.</li>
          <li><b>Statistics and the Global Factories Summary now start collapsed.</b> A fresh visitor, or anyone opening a demo plan, used to land on a page-length wall of stats above the factory cards themselves. Item production, power shards, raw resources and building summaries within Statistics start collapsed too. Each section remembers your choice once you toggle it.</li>
        </ul>
        <v-divider class="subsection" />

        <h2>🔧 <i class="fas fa-wrench ml-1" /><span class="ml-2">Fixes</span></h2>
        <ul class="ml-6 mt-2">
          <li><b>Enter accepts a task you are editing</b> instead of dropping a newline into it. Task titles are edited in an auto-growing textarea, so pressing enter grew the row and left the edit sitting there uncommitted, while the new-task field right above it has always taken enter as "add this". Shift+enter still types a second line.</li>
          <li><b>Checklist mode: ticks on the Products, Imports and export-chip checkboxes are reliable again</b> (#592, #593). The export tick sat inside the chip's own clickable area, so the chip's click handler and ripple layer could win the click before it ever reached the checkbox; it is now a sibling of the chip instead. Separately, all three checkboxes could lose a race against the browser's own "revert to pre-click state" step when a click was cancelled: the state change landed, but the box itself could stay visually unticked.</li>
          <li><b>Fix Product no longer ignores what the factory imports</b> (#595). The shortfall it wrote counted only what the factory produced itself, so a part with 1425/min imported against 2740/min needed was fixed to 2740 rather than 1315, and the figure named on the Satisfy and Trim buttons was wrong in the same way. Where a part is imported as well as made on site, local production only has to cover what the imports don't. That button is labelled <b>Trim to import shortfall</b> rather than just Trim, since it deliberately stops short of the full requirement, and Trim can no longer name a negative quantity.</li>
          <li><b>A factory that consumes its own output no longer reports a phantom surplus to export</b> (#540). Export supply was read gross, so a mine extracting 480 ore a minute and smelting every bit of it on site still offered 240 of it to another factory and called the request satisfied. The figure is now what the factory actually has spare once production, power, buildings and sinking have taken their share.</li>
          <li><b>An over-committed mine can be given imports again</b> (#541). A mine shipping out more than it extracts matched the "nothing here could ever import anything" shortcut, because extraction takes no ingredients, so its Add Import button was disabled even with another mine in the plan able to cover the difference. Together with #540 the two halves are coherent: the mine goes red and the fix for it is available in the same place.</li>
          <li><b>The Share button now shares the plan you are actually looking at</b> (#535). It took its copy of the open tab once, when the page loaded, and the button never remounts, so after switching tabs it went on sharing the plan that had been open at load, under that tab's name.</li>
          <li><b>Two power generators in one factory can no longer be issued the same ID</b> (#546). Generator IDs were drawn at random with nothing checking whether the factory already held that number, and those IDs key the Game Sync snapshots, so a collision (roughly one factory in 200 with ten generators) made the factory drop out of sync the moment it was marked as built, permanently and with nothing on screen explaining why.</li>
          <li><b>The Raw Resources Wizard's backup no longer zeroes an older power target</b> (#536). If you set a power target before targets became per-plan, the backup recorded it as 0, and since the backup is the only undo for a migration that can't be reversed, restoring stamped that 0 in for good.</li>
        </ul>
        <v-divider class="subsection" />

        <h2>👍 <i class="fas fa-server ml-1" /><span class="ml-2">Under the hood</span></h2>
        <ul class="ml-6 mt-2">
          <li><b>The backend is a new application.</b> It has been rewritten in NestJS with a real module structure, typed configuration, graceful shutdown, and a test suite covering the routes, the live connection, concurrent edits, passwords, revocation, deletion and the hourly cleanup.</li>
          <li>A new shared package holds the message formats, the plan schema and the protocol version that the planner and the server both build against, so the two can no longer drift apart.</li>
          <li>Every plan that reaches the server is validated against one schema with explicit limits: 150 factories per plan, 10 plans of your own, 25 plans in your tab bar, and the same name and note truncation the planner has always applied.</li>
          <li>Multi-step changes are built as steps that can each be repeated safely, so a request that fails halfway leaves nothing stranded and simply resumes. Deleting a plan marks it dead first, which makes it inert instantly, and clears up afterwards.</li>
          <li>Who changed what, and when, is recorded per plan. There is no history view yet; the record is being kept from day one so that there can be.</li>
          <li>Every request now carries the app version and is refused if it is out of date, and an out-of-date tab shows a persistent "refresh to continue" bar instead of failing silently. <code>/save</code> and <code>/load</code> are retired, and <code>/hello</code> is gone since <code>/health</code> had already replaced it.</li>
          <li><b>Developer tool: the offline conflict prompt can be staged from the Templates menu.</b> It builds a local tab of its own, fabricates a clash against a pretend live plan and opens the real dialog over it, so the prompt can be seen without two devices. Nothing is sent to the server. The entry shows on a development build, or anywhere once <code>sfDevTools</code> is set to <code>true</code> in local storage.</li>
          <li><b>The planner now sends an anonymous usage heartbeat</b>, because a plan that is never synced and a user who never signs in are both invisible to the server, and between them that is most of the planner's use. It reports six numbers and one flag: how many tabs are open, how many of those are synced, how many factories they hold in total, whether somebody is signed in, and which build is running. No names, no plan contents, no account details. The identifier attached to it is random, minted by your browser, and cannot be tied to an account. Offline mode stops it along with everything else, and so does any tracker blocker.</li>
        </ul>

        <v-divider />
        <h1>Beta v0.6 - The "Groundwork" Update <span class="release-date">19/Aug/2026</span><span class="release-summary">Raw resources, mines, resource wells and factory groups</span></h1>
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

        <h2>👍 <i class="fas fa-arrow-to-bottom ml-1" /><span class="ml-2">Satisfy &amp; Trim say what they will set</span></h2>
        <p>Every <b>Satisfy</b> and <b>Trim</b> now names the figure it would land on, right there on the button. No more pressing one to find out what it does, then trying to remember the old number to undo it.</p>
        <v-img
          alt="A product's Trim (480) button above an import's Trim to Capacity (360) button"
          max-width="1200"
          src="/assets/changelog/beta6/satisfy-trim-targets.png"
        />
        <ul class="ml-6 mt-2">
          <li>Products, imports and building groups all carry it, each in its own units: a product's new Qty/min, an import's new quantity, and the output a building group would be left producing (MW for a power generator's group).</li>
          <li><b>New: Trim to Capacity.</b> An import that asks a factory for more than it can make now offers to trim itself to fit. Nothing used to stop you requesting 1,015 of something from a factory producing 900 — and the 115 it could never deliver showed up on the <i>supplier</i>, a long way from the row that caused it.</li>
          <li>Capacity is what the supplier has <b>spare</b>: what it makes, less what its own production and generators consume, less everything it has already promised to other factories.</li>
          <li>It only ever shrinks a request. A row that already fits is left alone, so this is not a second <b>Satisfy</b>: Satisfy sizes an import against what <i>this</i> factory needs, Trim to Capacity sizes it against what the supplier can actually give.</li>
          <li>The shortfall doesn't vanish, it moves to where it belongs: the supplier goes green, and this factory shows the gap it always really had.</li>
        </ul>

        <v-divider class="subsection" />

        <h2>👍 <i class="fas fa-arrow-to-top ml-1" /><span class="ml-2">Satisfy an import to what the supplier can spare</span></h2>
        <p>Being short of more than a supplier can make used to take two presses: <b>Satisfy</b> asked for the lot, over-asked the supplier, and put a <b>Trim to Capacity</b> button on screen to take it straight back down. <b>Satisfy to Capacity</b> lands on the right figure in one.</p>
        <v-img
          alt="An import row offering both Satisfy to Need (520) and Satisfy to Capacity (360)"
          max-width="1200"
          src="/assets/changelog/beta6/satisfy-to-capacity.png"
        />
        <ul class="ml-6 mt-2">
          <li>Every button on an import row now says which question it answers: <b>Satisfy to Need</b> and <b>Trim to Need</b> size the row against what this factory wants, <b>Satisfy to Capacity</b> and <b>Trim to Capacity</b> against what the supplier can actually give.</li>
          <li><b>Satisfy to Capacity</b> only turns up when it has something of its own to say — not when the supplier can cover the whole need, not when the row already over-asks (that's <b>Trim to Capacity</b>, already on screen saying the same figure), and not when the supplier has nothing spare.</li>
          <li>It doesn't pretend the shortfall is solved: the supplier goes green and fully committed, and this factory keeps the gap it always really had, with <b>Satisfy to Need</b> still there for when you find it a second supplier.</li>
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
          <li>You now get told when a new version of the planner is released, whether or not you are signed in. A message appears at the bottom of the page naming the version that is live, with a reload button. Dismiss it and keep planning, or reload when you reach a sensible point; your plan is kept either way.</li>
        </ul>

        <v-divider class="subsection" />

        <h2>👍 <i class="fas fa-file ml-1" /><span class="ml-2">Smaller things</span></h2>
        <ul class="ml-6">
          <li>A new <b>Mining</b> template plan showing all of the above end to end, and the Demo plan gains a Copper Mine feeding its Copper Ingots.</li>
          <li>Every raw resource in the Imports section gets a one-click button to mine it in that factory, at the amount you're short of.</li>
          <li>The Converter's ore recipes name the conversion, "Iron Ore (Convert: Limestone)", so they don't read as though the ore came from limestone.</li>
        </ul>

        <v-divider />
        <h1>Beta v0.5 - The "Overclocked" Update <span class="release-date">21/Jul/2026</span><span class="release-summary">Overclocking, Somersloops, building groups and power</span></h1>
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
        <h1>Alpha v0.4 <span class="release-date">25/Jan/2025</span><span class="release-summary">Export Calculator v2 and a new loading sequence</span></h1>

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
          <li>🆕 Redundant imports (where a singular import can handle the demands) are now highlighted with <v-chip class="sf-chip small status-warning-outlined ma-0">
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
  interface Release extends Entry { date: string; summary: string; sections: Entry[] }

  // The contents are read back off the rendered headings rather than kept as a second list beside
  // them: a hand-written one silently goes stale the next time a section is added here.
  const content = ref<{ $el: HTMLElement } | null>(null)
  const releases = ref<Release[]>([])

  const slug = (title: string) =>
    title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

  /** The heading's own words: whatever it carries beside them has its own home in the contents. */
  const titleOf = (heading: Element) => {
    const clone = heading.cloneNode(true) as HTMLElement
    for (const aside of clone.querySelectorAll('.release-date, .release-summary')) aside.remove()
    return (clone.textContent ?? '').trim()
  }

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
      // The date and the one-line summary are rendered inside the heading so each has one home,
      // and neither is part of the title. Taken off a clone rather than by trimming the string,
      // so a title that happens to contain its own date keeps it.
      const date = heading.querySelector('.release-date')?.textContent?.trim() ?? ''
      const summary = heading.querySelector('.release-summary')?.textContent?.trim() ?? ''
      const title = titleOf(heading)
      if (!title || title === 'Change Log') continue

      if (heading.tagName === 'H1') {
        if (!heading.id) heading.id = slug(title)
        found.push({ id: heading.id, title, date, summary, sections: [] })
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

// Its own line under the release name: "The SINKronisation Update" says which release this is,
// and this says what was in it.
.release-summary {
  color: #bdbdbd;
  display: block;
  font-size: 1.1rem;
  font-weight: 400;
  margin-top: 0.25rem;
}

.toc-summary {
  color: #bdbdbd;
  font-size: 0.9rem;
  list-style: none;
  padding-left: 1rem;
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
