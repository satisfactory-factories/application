<template>
  <v-dialog
    v-model="showSplash"
    :max-width="currentSlide === 0 ? 1200 : 1000"
    scrollable
  >
    <v-card>
      <v-card-title class="deck-title d-flex align-center justify-center py-4">
        <span class="header-accent">What's new in Beta v0.7</span>
        <v-btn
          class="deck-close"
          density="comfortable"
          icon="fas fa-times"
          title="Close what's new"
          variant="text"
          @click="closeSplash"
        />
      </v-card-title>
      <v-card-text ref="slideBody">
        <!-- Slide 1: The headline. Cloud saving was not taken away — it was gutted and rebuilt,
             and saying it the other way round is what every returning user will assume. -->
        <div v-if="currentSlide === 0">
          <h2 class="text-h4 text-center mb-2">Realtime sync is here</h2>
          <p class="text-center text-medium-emphasis mb-4">Plan together, on the same plan, at the same time.</p>
          <youtube-embed
            v-if="launchVideoId"
            class="mb-4"
            :video-id="launchVideoId"
          />
          <v-img
            v-else-if="hasDemoClip"
            alt="Two browsers side by side, an edit in one appearing in the other"
            class="mb-4 mx-auto rounded"
            max-width="1200"
            :src="shots.demo"
          />
          <p class="hero-blurb mb-3">
            <b>The old cloud save has been gutted and a new one built in its place.</b> It is still
            cloud saving. It is a different cloud saving.
          </p>
          <p class="hero-lead mb-4">
            The planner used to push your whole plan up as one blob every ten seconds, and the last
            writer won — so two devices could quietly overwrite each other. That is gone. Every tab
            is now a plan in its own right on your account.
          </p>
          <ul class="ml-6 mb-4">
            <li><b>Every tab is a first-class plan</b>, not one save slot shared between all of them.</li>
            <li><b>A plan follows your account</b> to every device you sign in on.</li>
            <li><b>A plan can be handed to a friend as a link</b>, and you both edit it live.</li>
            <li><b>Offline is a mode you choose</b>, not a failure state you fall into.</li>
          </ul>
          <p class="mb-2">There's a lot in this one, so jump to what interests you, or take the full tour!</p>
          <ul class="contents-list ml-6">
            <li v-for="(slide, index) in slides.slice(1)" :key="slide.nav">
              <a class="d-inline-flex align-center ga-2" href="#" @click.prevent="goToSlide(index + 1)">
                <i :class="slide.icon" />
                <span>{{ slide.title }}</span>
              </a>
            </li>
          </ul>
        </div>

        <!-- Slide 2: The three kinds of tab. The icon beside each heading is the same glyph the
             tab bar wears, so the heading and the thing on screen are recognisably one. -->
        <div v-if="currentSlide === 1">
          <h2 class="text-h5 text-center mb-2">
            <i class="fas fa-folder-open" /><span class="ml-2">Every tab is local, synced or shared</span>
          </h2>
          <p class="mb-4">
            The <b>+</b> button now asks which kind you want rather than silently making a local
            one, and each tab wears its kind in the tab bar.
          </p>

          <div v-for="kind in tabKinds" :key="kind.key" class="tab-kind mb-4">
            <h3 class="section-heading d-flex align-center ga-3 mb-2">
              <!-- The capture of the real tab where there is one, the bare glyph where there
                   isn't: either way the heading carries what the tab bar shows. -->
              <v-img
                v-if="hasTabShots"
                :alt="kind.alt"
                class="tab-shot rounded"
                :src="kind.image"
                :width="kind.width"
              />
              <i v-else class="tab-glyph" :class="kind.icon" />
              <span>{{ kind.label }}</span>
            </h3>
            <p class="mb-0">{{ kind.blurb }}</p>
          </div>

          <v-divider class="my-4" />

          <h3 class="section-heading mb-2">The pencil opens tab settings</h3>
          <p class="mb-2">
            Renaming in place is gone. The pencil on the current tab opens a dialog that does
            everything to that tab in one place.
          </p>
          <v-img
            v-if="hasTabSettingsShot"
            alt="The tab settings dialog, opened from the pencil on the current tab"
            class="mb-3 mx-auto rounded"
            max-width="720"
            :src="shots.tabSettings"
          />
          <ul class="ml-6 mb-2">
            <li><b>Rename</b> it — Apply, Enter or clicking away all save. Renaming a cloud plan stays owner-only, and the dialog says so.</li>
            <li><b>Convert to cloud</b> sends a local plan to your account, keeping its identity: nothing is recreated or renamed.</li>
            <li><b>Hide</b> closes a cloud plan in this browser and nothing else. The plan stays on your account, and the dialog says where to open it from again.</li>
            <li><b>Convert to local</b> takes the plan off your account and keeps it here. It sits below Hide, because Hide is the gentler answer to the same question.</li>
            <li><b>Share Settings</b>, on every tab — local ones included, because any plan can hand out a snapshot link.</li>
            <li><b>Delete</b>, in a walled-off red section at the bottom rather than a bin icon one mis-click from the plan beside it.</li>
          </ul>
          <p class="mb-2">
            <b>Local is still the default and still needs no account.</b> Nothing changes for anyone
            who never signs in. Tabs can also be dragged into whatever order you like, and the order
            of your synced ones follows your account.
          </p>
        </div>

        <!-- Slide 3: Collaboration proper. -->
        <div v-if="currentSlide === 2">
          <h2 class="text-h5 text-center mb-2">
            <i class="fas fa-users" /><span class="ml-2">Editing together</span>
          </h2>
          <v-img
            v-if="hasRoomShot"
            alt="Two people editing the same plan, the invite dialog open"
            class="mb-4 mx-auto rounded"
            max-width="1200"
            :src="shots.room"
          />
          <p class="mb-4">
            Invite someone into a synced tab and they are editing <i>your</i> plan with you. Changes
            flow both ways over one connection and land on the other side in about as long as the
            network takes.
          </p>

          <h3 class="section-heading mb-2">The invite link</h3>
          <ul class="ml-6 mb-4">
            <li>Of the form <code>satisfactory-factories.app/room/three-word-slug</code>. You can set <b>your own words</b> for it, and the dialog tells you live whether they are free.</li>
            <li><b>An invite can carry a password.</b> Set one and anyone new is asked for it once. Change it and anyone who joined anonymously is dropped, while people signed in keep their access.</li>
            <li><b>Stop sharing puts the plan back to private.</b> Everyone else is removed and keeps their own copy of the last state they saw. Sharing again restores the same link.</li>
            <li>Deleting a shared plan does the same. <b>Nobody ever loses data because of something the owner did.</b></li>
          </ul>

          <v-divider class="my-4" />

          <h3 class="section-heading mb-2">What happens when you both type at once</h3>
          <ul class="ml-6 mb-4">
            <li><b>Edits to different factories both survive.</b> Edits to the same factory settle on one of them rather than merging into something neither of you asked for.</li>
            <li><b>One person at a time in a text field.</b> Click into a factory's notes and that box is held for you; everyone else sees it greyed out with "Another builder is editing this". Keep typing and it stays yours. Leave it alone for ten seconds and it is released.</li>
            <li>It is per field, so the factory next to yours is still open to everybody.</li>
            <li>The owner can rename, share, unshare, set the link, set a password and delete. Everyone else can edit the plan and leave.</li>
          </ul>

          <v-divider class="my-4" />

          <h3 class="section-heading mb-2">The snapshot link is still there</h3>
          <p class="mb-2">
            <b>And it is a separate thing.</b> <i>Copy snapshot link</i> is what <code>/share</code>
            has always been: a frozen copy of the plan as it is right now, which whoever opens it
            keeps as their own. It works on any tab and needs no account. The two sit in the same
            dialog, clearly apart, so they can't be mixed up.
          </p>
        </div>

        <!-- Slide 4: Offline mode. Where it is comes first: it is not under Options, which is
             where everybody will look for it. -->
        <div v-if="currentSlide === 3">
          <h2 class="text-h5 text-center mb-2">
            <i class="fas fa-plane" /><span class="ml-2">Offline mode</span>
          </h2>
          <v-alert
            class="mb-4"
            density="comfortable"
            type="info"
            variant="tonal"
          >
            <b>It lives in the account panel</b>, on the cloud account tile — not under Options.
            That is also where you switch it back off.
          </v-alert>
          <v-img
            v-if="hasOfflineSwitchShot"
            alt="The offline mode switch on the account panel's cloud tile"
            class="mb-4 mx-auto rounded"
            max-width="620"
            :src="shots.offlineSwitch"
          />
          <p class="mb-4">
            Offline mode means <b>exactly no contact with the server</b>: no connection, no
            requests, no retries. Keep planning; everything is kept on this device. Switching it on
            says so once and then gets out of the way, and a chip in the tab bar is what reminds you
            it is still on.
          </p>
          <ul class="ml-6 mb-4">
            <li><b>If the connection drops on its own</b>, a small bar asks whether you want to go offline rather than deciding for you. Say no and it keeps quietly retrying.</li>
            <li><b>Coming back is manual, like a phone.</b> Switch it off and the planner reconnects, takes the server's state, re-applies everything you changed while you were away, recalculates and sends it.</li>
            <li>Edits made offline survive closing the browser.</li>
          </ul>

          <v-divider class="my-4" />

          <h3 class="section-heading mb-2">If somebody else moved the same factories</h3>
          <v-img
            v-if="hasOfflineConflictShot"
            alt="The conflict prompt, this device's figures beside the live plan's, product by product"
            class="mb-3 mx-auto rounded"
            max-width="1000"
            :src="shots.offlineConflict"
          />
          <p class="mb-2">
            Coming back raises <b>one prompt</b>, listing every factory both sides touched, with the
            live plan's figures beside yours <b>product by product</b>, and you pick which version
            wins for each. Everything that does not clash syncs safely either way, and a tick box
            keeps this device's version as a separate local tab whatever you choose.
          </p>
          <p class="mb-2">
            <b>It survives a refresh.</b> Reloading with the question still on screen used to quietly
            pick your version and send it. Nothing goes anywhere now until you have answered.
          </p>
          <p class="mb-0">
            That prompt is the only question offline work will ever raise. There are no popups to
            dismiss while you plan.
          </p>
        </div>

        <!-- Slide 5: The account panel. -->
        <div v-if="currentSlide === 4">
          <h2 class="text-h5 text-center mb-2">
            <i class="fas fa-user" /><span class="ml-2">Your account, your plans</span>
          </h2>
          <p class="mb-4">
            The account tile has been rebuilt: your username, a live connection indicator, the
            offline switch, <b>Change password</b>, and your plans under two tabs.
          </p>

          <v-row class="mb-4" no-gutters>
            <v-col class="pr-md-4" cols="12" md="6">
              <h3 class="section-heading mb-2">Local</h3>
              <p class="mb-2">
                The plans that live in this browser only, each with a cloud button that syncs it to
                your account on the spot.
              </p>
              <v-img
                v-if="hasAccountPanelShots"
                alt="The account panel's Local tab, listing the plans held in this browser"
                class="rounded"
                :src="shots.accountLocal"
              />
            </v-col>
            <v-col class="pl-md-4" cols="12" md="6">
              <h3 class="section-heading mb-2">Cloud</h3>
              <p class="mb-2">
                <b>My Plans</b> — the ones you own — and <b>Joined Plans</b> — the ones shared with
                you. Each says how many factories it holds and when it last changed.
              </p>
              <v-img
                v-if="hasAccountPanelShots"
                alt="The account panel's Cloud tab, split into My Plans and Joined Plans"
                class="rounded"
                :src="shots.accountCloud"
              />
            </v-col>
          </v-row>

          <ul class="ml-6 mb-4">
            <li><b>Cloud plans open where you choose.</b> Every plan on your account is listed with a Show or Hide button. Show opens it as a tab here; Hide closes that tab and nothing more.</li>
            <li><b>Every list of your plans reads at a glance</b>: the size as a factory icon and a number, and the time spelled out as "Last updated 38 minutes ago".</li>
            <li><b>Changing your password signs out every device</b>, the one that changed it included. A password you had to change because somebody else knew it takes their access with it.</li>
          </ul>

          <v-divider class="my-4" />

          <h3 class="section-heading mb-2">Signing in asks which plans to open</h3>
          <v-img
            v-if="hasSignInChooserShot"
            alt="The sign-in chooser, listing every account plan this browser does not have open"
            class="mb-3 mx-auto rounded"
            max-width="900"
            :src="shots.signInChooser"
          />
          <p class="mb-4">
            Signing in or refreshing no longer opens a tab for every plan on your account. The
            chooser lists everything this browser does not have open, all ticked, with
            <b>Select all</b> and <b>Select none</b>. Untick what you want left in the panel, or
            choose "Not now" to open none. A refresh never asks.
          </p>

          <v-divider class="my-4" />

          <h3 class="section-heading mb-2">Settings follow your account</h3>
          <p class="mb-4">
            Preferences that are about <i>you</i> rather than about this computer now travel with
            your account: satisfaction breakdowns, group colours you have used, tutorials you have
            dismissed, the statistics panels you keep hidden. Sign in on a new machine and the
            planner is set up the way you left it — and settings this browser has that your account
            has never seen are kept and uploaded rather than overwritten.
          </p>

          <v-divider class="my-4" />

          <h3 class="section-heading mb-2">Your old cloud save comes over on its own</h3>
          <p class="mb-4">
            <b>A plan you saved to your account before v0.7 is brought over without you asking.</b>
            It arrives as a tab of its own, so everything already open here and every plan already on
            your account is left exactly as it was. It happens once per account, and it comes over
            whole: its name, its power target, its factory groups and its Depot research.
          </p>

          <v-divider class="my-4" />

          <h3 class="section-heading mb-2">Plans go in and out as files now</h3>
          <p class="mb-2">
            <b>Copy plan has become Export plan</b>, and it asks where the plan should go:
            <i>Save as a file</i> downloads it as JSON named after the plan, or
            <i>Copy to clipboard</i> as before. <b>Paste plan has become Import plan</b>, which asks
            where the plan is coming from: a file, or the clipboard. Everything either way is the
            whole plan.
          </p>
        </div>

        <!-- Slide 6: Sinks and the Depot. -->
        <div v-if="currentSlide === 5">
          <h2 class="text-h5 text-center mb-2">
            <i class="fas fa-recycle" /><span class="ml-2">AWESOME Sinks and the Dimensional Depot</span>
          </h2>
          <p class="mb-4">
            Every item under a factory's Satisfaction now has a <b>Storage</b> column, left of
            Satisfaction, holding two counts: how many AWESOME Sinks and how many Dimensional Depot
            Uploaders you have put on that item's surplus.
          </p>
          <v-img
            v-if="hasSinkShot"
            alt="The Storage column, with sink and Uploader counts against an item's surplus"
            class="mb-4 mx-auto rounded"
            max-width="1200"
            :src="shots.sink"
          />

          <h3 class="section-heading mb-2">A sink disposes of the surplus</h3>
          <ul class="ml-6 mb-4">
            <li><b>So the planner treats it as gone.</b> Set one and the item reads <code>0/min surplus</code>, with a gold <b>n/min sunk</b> chip beside it and the pre-sink figure underneath — what sinking removed is never hidden.</li>
            <li><b>It is a priority splitter, not an appetite.</b> Internal use and exports are served first and always win, so adding an export request later shrinks the sunk amount by itself.</li>
            <li><b>30 MW each</b>, counted into the factory's consumption and so into the plan's.</li>
            <li>No control is offered where the game refuses one: fluids, and radioactive items.</li>
          </ul>

          <v-divider class="my-4" />

          <h3 class="section-heading mb-2">An Uploader deliberately changes no number</h3>
          <p class="mb-4">
            The Depot is finite storage: it fills, and then it backs up like any other container.
            Marking an item for the Depot records what you are building and what it costs, and
            <b>leaves the surplus exactly as it is</b>.
          </p>

          <v-divider class="my-4" />

          <h3 class="section-heading mb-2">New: "Will cause backlog"</h3>
          <p class="mb-4">
            Any item left with a surplus that nothing consumes, nothing exports and no sink takes
            will fill the belt and stall the buildings making it — including the case nothing could
            previously see, where a factory makes 200 Iron Plates, ships 100, and the other 100
            quietly back up. Amber, because there is now a control in the same row that fixes it,
            and switchable off entirely under <b>Options → Satisfaction</b> for a plan mid-build.
          </p>

          <v-divider class="my-4" />

          <h3 class="section-heading mb-2">A Dimensional Depot section of its own</h3>
          <v-img
            v-if="hasDepotShot"
            alt="The Dimensional Depot section, one row per item with its Uploaders and factories"
            class="mb-3 mx-auto rounded"
            max-width="1200"
            :src="shots.depot"
          />
          <ul class="ml-6 mb-2">
            <li>Under the Statistics summary, and only on plans that use it. One row per item: what the plan has spare to upload, how many Uploaders are on it, and a pill per factory carrying that factory's own count.</li>
            <li><b>It flags an item arriving faster than its Uploaders can take it</b> — 240/min each, fully researched — so the remainder still backs up.</li>
            <li><b>It has a sidebar entry</b> too, beneath the Global Factories Summary.</li>
            <li><b>Mercer Spheres join Power Shards and Somersloops</b> in the statistics, at one per Uploader, with the MAM research the Depot costs listed under them.</li>
            <li><b>The upload and expansion research are saved on the plan</b>, so a shared plan carries the world it was written against.</li>
          </ul>
        </div>

        <!-- Slide 7: Everything else in the planner half of the release. -->
        <div v-if="currentSlide === 6">
          <h2 class="text-h5 text-center mb-2">
            <i class="fas fa-sparkles" /><span class="ml-2">Also new in the planner</span>
          </h2>

          <h3 class="section-heading mb-2">Search the plan</h3>
          <v-img
            v-if="hasSearchShot"
            alt="The search box in the tab bar, with results grouped by what each factory does with the part"
            class="mb-3 mx-auto rounded"
            max-width="1000"
            :src="shots.search"
          />
          <p class="mb-4">
            A box beside Options. <b>Ctrl/Cmd+K</b> opens it from anywhere. Type a factory name to
            jump to it, or a part to see every factory that touches it — grouped by what the factory
            does with the part, and landing on the row it names rather than the top of the card.
          </p>

          <v-divider class="my-4" />

          <h3 class="section-heading mb-2">Custom buildings</h3>
          <v-img
            v-if="hasCustomBuildingsShot"
            alt="Custom buildings added to a factory, counting towards its power draw"
            class="mb-3 mx-auto rounded"
            max-width="1200"
            :src="shots.customBuildings"
          />
          <p class="mb-4">
            <b>Twenty buildings that make nothing</b> can now be added to a factory: portals, train
            stations, freight platforms, truck stations, drone ports, radar towers, the AWESOME
            Sink, hypertube entrances, jump pads, pipeline pumps and lights. They count towards the
            factory's power draw and its building list — and the Main Portal's
            <b>Singularity Cells are a real demand</b>, two a minute each, so a portal room short of
            cells reads as a shortage.
          </p>

          <v-divider class="my-4" />

          <h3 class="section-heading mb-2">Material costs</h3>
          <v-img
            v-if="hasMaterialCostsShot"
            alt="The Material Costs panel under Power & Buildings"
            class="mb-3 mx-auto rounded"
            max-width="1000"
            :src="shots.materialCosts"
          />
          <p class="mb-4">
            Power &amp; Buildings has a <b>Material Costs</b> panel: what it would cost, in parts, to
            build every production building, power generator and custom building the factory needs.
            <b>A guide only</b> — no assumptions are made about belts, foundations or anything
            structural or cosmetic.
          </p>

          <v-divider class="my-4" />

          <h3 class="section-heading mb-2">Checklist rework</h3>
          <v-img
            v-if="hasChecklistShot"
            alt="The Checklist panel as three tables, a desynced row carrying both numbers"
            class="mb-3 mx-auto rounded"
            max-width="1200"
            :src="shots.checklist"
          />
          <ul class="ml-6 mb-4">
            <li><b>Three tables side by side</b> — Products (with Power beneath), Imports and Exports — instead of one list stacked four groups deep.</li>
            <li><b>A desynced row now says what changed</b>: an amber chip reading <code>560/min → 720/min</code>, rather than the word "desynced" and a memory test. Click the chip to confirm the new number.</li>
            <li><b>The panel opens with a summary</b> of how many rows have drifted, with <b>Reconfirm all</b> for when you have already built the lot.</li>
            <li><b>A desynced checklist is a factory status of its own</b>, so it wears an amber chip everywhere the other statuses appear.</li>
          </ul>

          <v-divider class="my-4" />

          <h3 class="section-heading mb-2">Power generators: match the fuel to the supply</h3>
          <v-img
            v-if="hasGeneratorFuelShot"
            alt="A fuel generator offering Trim to supply against what its factory can spare"
            class="mb-3 mx-auto rounded"
            max-width="1200"
            :src="shots.generatorFuel"
          />
          <p class="mb-4">
            A generator burning fuel its own factory makes now offers the same green
            <b>Expand to supply</b> and yellow <b>Trim to supply</b> pair the product rows carry,
            with the figure it would land on named on the button. <b>It accounts for everything else
              that wants the fuel</b> — other recipes, other generators, exports to other factories —
            which is exactly the sum this saves you doing by hand.
          </p>

          <v-divider class="my-4" />

          <h3 class="section-heading mb-2">And around the edges</h3>
          <ul class="ml-6 mb-2">
            <li><b>The sidebar has an Arrange dialog</b>: groups against each other, factories within a group, and factories from one group into another, all with buttons. Dragging on a phone was the same gesture as scrolling, so scrolling dragged.</li>
            <li><b>The sidebar follows the scroll-spy indicator</b>, keeping the highlighted factory in view instead of letting it drift off-screen.</li>
            <li><b>Every dialog now shares one header</b>: a padded title row with the icon beside the heading, and the close button in the top-right corner where a dialog's way out belongs.</li>
            <li><b>Statistics and the Global Factories Summary start collapsed</b>, rather than a page-length wall of stats above the factory cards.</li>
            <li><b>"Last updated" sits beside the search box</b>, saying when the plan in this tab last changed, flashing as it moves. Your own edits and a collaborator's both count.</li>
            <li><b>The "Show Info" toggle is gone</b>, along with the paragraphs it hid. The ⓘ tooltips are unaffected.</li>
          </ul>
        </div>

        <!-- Slide 8: Fixes, the backend, and the way out to the detail. -->
        <div v-if="currentSlide === 7">
          <h2 class="text-h5 text-center mb-2">
            <i class="fas fa-wrench" /><span class="ml-2">Fixes</span>
          </h2>
          <ul class="ml-6 mb-4">
            <li><b>Enter accepts a task you are editing</b> instead of dropping a newline into it. Shift+enter still types a second line.</li>
            <li><b>Checklist ticks are reliable again</b> (#592, #593). The export tick sat inside the chip's own clickable area, so the chip could win the click before the checkbox ever saw it.</li>
            <li><b>Fix Product no longer ignores what the factory imports</b> (#595). Local production only has to cover what the imports don't, and Trim can no longer name a negative quantity.</li>
            <li><b>A factory that consumes its own output no longer reports a phantom surplus</b> (#540). A mine extracting 480 ore and smelting every bit of it still offered 240 of it to somebody else.</li>
            <li><b>An over-committed mine can be given imports again</b> (#541). Extraction takes no ingredients, so its Add Import button was disabled — even with another mine able to cover the difference.</li>
            <li><b>Share shares the plan you are actually looking at</b> (#535). It took its copy of the open tab once, at page load, and never remounted.</li>
            <li><b>Two power generators in one factory can no longer be issued the same ID</b> (#546). Those IDs key the Game Sync snapshots, so a collision dropped the factory out of sync permanently, with nothing on screen explaining why.</li>
            <li><b>The Raw Resources Wizard's backup no longer zeroes an older power target</b> (#536). The backup is the only undo for a migration that can't be reversed, so restoring stamped that 0 in for good.</li>
          </ul>

          <v-divider class="my-4" />

          <h3 class="section-heading mb-2">The backend is a new application</h3>
          <p class="mb-4">
            None of this would have held on the old one. It has been rewritten from the ground up in
            NestJS with a real module structure, typed configuration and a test suite covering the
            routes, the live connection, concurrent edits, passwords, revocation, deletion and the
            hourly cleanup. A shared package holds the message formats, the plan schema and the
            protocol version that the planner and the server both build against, so the two can no
            longer drift apart — and every plan that reaches the server is validated against that one
            schema. Who changed what, and when, is recorded per plan from day one, so that a history
            view can exist later.
          </p>

          <p class="text-center text-medium-emphasis">
            Missed the last one?
            <v-btn class="mx-1" variant="tonal" @click="showV6Splash">
              <i class="fas fa-backward" /><span class="ml-2">What's new in Beta v0.6</span>
            </v-btn>
          </p>
        </div>
      </v-card-text>
      <v-card-actions class="px-4 pb-4">
        <v-btn v-if="currentSlide > 0" variant="tonal" @click="prevSlide">
          <i class="fas fa-arrow-left" /><span class="ml-2">{{ slides[currentSlide - 1].nav }}</span>
        </v-btn>
        <v-spacer />
        <span class="text-medium-emphasis slide-counter">{{ currentSlide + 1 }} / {{ slides.length }}</span>
        <v-spacer />
        <!-- The deck is the summary; the changelog is the detail. Reachable from every slide
             rather than only from the last one, which is the slide fewest people reach. -->
        <v-btn
          class="mr-2"
          color="green"
          href="/changelog"
          prepend-icon="fas fa-list"
          variant="outlined"
        >
          Full details on the Change Log
        </v-btn>
        <v-btn color="primary" variant="elevated" @click="nextSlide">
          <template v-if="currentSlide === slides.length - 1">
            <i class="fas fa-check" /><span class="ml-2">Got it!</span>
          </template>
          <template v-else>
            <i class="mr-2" :class="slides[currentSlide + 1].icon" />
            <span class="mr-2">{{ slides[currentSlide + 1].nav }}</span><i class="fas fa-arrow-right" />
          </template>
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
  import eventBus from '@/utils/eventBus'

  // Set this to the v0.7 launch video id and the slot appears on slide 1; empty, it is skipped.
  // Deliberately not seeded with the previous release's id: that ships last release's video as
  // this one's, which is worse than no video at all.
  const launchVideoId = ''

  // Bound rather than literal paths: these live in public/, and a static src makes vite try to
  // resolve them at transform time — which fails the whole module while a capture is missing.
  const shots = {
    demo: '/assets/changelog/beta7/sync-demo.gif',
    tabLocal: '/assets/changelog/beta7/tab-local.png',
    tabSynced: '/assets/changelog/beta7/tab-synced.png',
    tabShared: '/assets/changelog/beta7/tab-shared.png',
    tabSettings: '/assets/changelog/beta7/tab-settings.png',
    room: '/assets/changelog/beta7/room-invite.png',
    offlineSwitch: '/assets/changelog/beta7/offline-switch.png',
    offlineConflict: '/assets/changelog/beta7/offline-conflict.png',
    accountLocal: '/assets/changelog/beta7/account-panel-local.png',
    accountCloud: '/assets/changelog/beta7/account-panel-cloud.png',
    signInChooser: '/assets/changelog/beta7/signin-chooser.png',
    sink: '/assets/changelog/beta7/sink-depot.png',
    depot: '/assets/changelog/beta7/depot-section.png',
    search: '/assets/changelog/beta7/search.png',
    customBuildings: '/assets/changelog/beta7/custom-buildings.png',
    materialCosts: '/assets/changelog/beta7/material-costs.png',
    checklist: '/assets/changelog/beta7/checklist.png',
    generatorFuel: '/assets/changelog/beta7/generator-fuel.png',
  }

  // A v-img pointed at a file that isn't there renders as a broken image, so each capture sits
  // behind its own flag and a slide whose picture has not been taken yet ships as text. Flip one
  // on as its file lands in web/public/assets/changelog/beta7/.
  const hasDemoClip = false
  const hasTabShots = false
  const hasTabSettingsShot = false
  const hasRoomShot = false
  const hasOfflineSwitchShot = false
  const hasOfflineConflictShot = false
  const hasAccountPanelShots = false
  const hasSignInChooserShot = false
  const hasSinkShot = false
  const hasDepotShot = false
  const hasSearchShot = false
  const hasCustomBuildingsShot = true
  const hasMaterialCostsShot = false
  const hasChecklistShot = false
  const hasGeneratorFuelShot = false

  const key = 'seenV7Splash'

  const showSplash = ref<boolean>(false)
  const currentSlide = ref(0)

  // Every slide shares one scroll container, so without this a slide read to the bottom leaves
  // the next one opening half way down.
  const slideBody = ref<{ $el: HTMLElement } | null>(null)
  watch(currentSlide, async () => {
    await nextTick()
    // scrollTop rather than scrollTo: jsdom implements the property but not the method.
    const body = slideBody.value?.$el
    if (body) body.scrollTop = 0
  })

  // Whether the introduction was already out of the way when this page loaded, read once rather
  // than per call. A brand new visitor dismisses the intro seconds before their first plan
  // finishes loading, and reacting to that would land this deck on top of their first ever look
  // at the planner. They get it on their next visit instead, and nothing is marked seen meanwhile.
  const introWasDismissed = localStorage.getItem('dismissed-introduction') === 'true'
  const seen = () => localStorage.getItem(key) === 'true'

  // Present the splash only once the planner has finished loading — showing it during the load
  // means the page resizing underneath can shift the dialog mid-interaction and cause misclicks.
  // Some flows (e.g. demo plan setup) load more than once back to back, so the show is debounced:
  // it fires shortly after the last loadingCompleted and is cancelled whenever a new load begins.
  let loadSettled = false
  let showTimer: ReturnType<typeof setTimeout> | undefined

  // No forced-answer gate this time. v0.6 was unskippable because raw resources broke every
  // existing plan and needed an answer; v0.7 breaks nothing the user has to act on — the old
  // cloud save is brought over on its own — so this closes from the corner throughout.
  const tryShow = () => {
    if (!loadSettled || seen()) {
      return
    }
    teardownLoadListeners()
    showSplash.value = true
  }

  const onLoadStarted = () => {
    clearTimeout(showTimer)
  }

  const onLoadingCompleted = () => {
    clearTimeout(showTimer)
    showTimer = setTimeout(() => {
      loadSettled = true
      tryShow()
    }, 750)
  }

  const teardownLoadListeners = () => {
    clearTimeout(showTimer)
    eventBus.off('loadingCompleted', onLoadingCompleted)
    eventBus.off('prepareForLoad', onLoadStarted)
    eventBus.off('loaderInit', onLoadStarted)
  }

  onMounted(() => {
    // Deliberately not listening for the introduction being dismissed: someone dismissing it
    // now is someone seeing the planner for the first time, and this deck is not their welcome.
    if (!seen() && introWasDismissed) {
      eventBus.on('loadingCompleted', onLoadingCompleted)
      eventBus.on('prepareForLoad', onLoadStarted)
      eventBus.on('loaderInit', onLoadStarted)
    }
    // Manual re-show via the header's "Show changes" button — works even after dismissal
    eventBus.on('splashShow', show)
  })

  onUnmounted(() => {
    teardownLoadListeners()
    eventBus.off('splashShow', show)
  })

  // The icon appears in the contents list on slide 1 and on the Next button.
  const slides = [
    { title: 'Realtime sync is here', nav: 'Intro', icon: 'fas fa-satellite-dish' },
    { title: 'Every tab is local, synced or shared', nav: 'Kinds of tab', icon: 'fas fa-folder-open' },
    { title: 'Editing together', nav: 'Editing together', icon: 'fas fa-users' },
    { title: 'Offline mode', nav: 'Offline mode', icon: 'fas fa-plane' },
    { title: 'Your account, your plans', nav: 'Your account', icon: 'fas fa-user' },
    { title: 'AWESOME Sinks and the Dimensional Depot', nav: 'Sinks & the Depot', icon: 'fas fa-recycle' },
    { title: 'Also new in the planner', nav: 'Also new', icon: 'fas fa-sparkles' },
    { title: 'Fixes', nav: 'Fixes', icon: 'fas fa-wrench' },
  ]

  // The glyphs are the ones the tab bar itself wears, so the heading and the tab on screen are
  // recognisably the same thing whether or not the capture beside it has been taken yet.
  const tabKinds = [
    {
      key: 'local',
      label: 'Local',
      icon: 'fas fa-desktop',
      image: shots.tabLocal,
      alt: 'A local tab in the tab bar, wearing a monitor',
      width: 180,
      blurb: 'Lives in this browser and needs no account, exactly as every tab did before. Still ' +
        'the default.',
    },
    {
      key: 'synced',
      label: 'Synced',
      icon: 'fas fa-cloud',
      image: shots.tabSynced,
      alt: 'A synced tab in the tab bar, wearing a cloud',
      width: 180,
      blurb: 'Lives on your account and can be opened on any device you sign in on. Needs an ' +
        'account, and nothing else.',
    },
    {
      key: 'shared',
      label: 'Shared',
      icon: 'fas fa-users',
      image: shots.tabShared,
      alt: 'A shared tab in the tab bar, wearing a group of people and a count of who is in it',
      width: 220,
      blurb: 'A synced tab you have invited other people into: everyone edits the same plan live. ' +
        'It also shows how many people are in it right now.',
    },
  ] as const

  // In case the user closes the dialog without clicking on the button
  watch(() => showSplash.value, value => {
    if (!value) {
      closeSplash()
    }
  })

  const closeSplash = () => {
    showSplash.value = false
    localStorage.setItem(key, 'true')
  }

  const nextSlide = () => {
    if (currentSlide.value < slides.length - 1) {
      currentSlide.value++
    } else {
      closeSplash()
    }
  }

  const prevSlide = () => {
    if (currentSlide.value > 0) {
      currentSlide.value--
    }
  }

  const goToSlide = (index: number) => {
    currentSlide.value = index
  }

  // Close first: every deck is mounted for the whole session, so emitting without this leaves
  // two dialogs stacked on top of each other.
  const showV6Splash = () => {
    closeSplash()
    eventBus.emit('splashShowV6')
  }

  // Opened by hand from the header, long after the news landed.
  const show = () => {
    currentSlide.value = 0
    showSplash.value = true
  }
  defineExpose({ show })
</script>

<style lang="scss" scoped>
// The call to action under the headline: the sentence that says what to do about it.
.hero-lead {
  font-size: 1.05rem;
}

// Section headings on the later slides, which carry several unrelated changes each. text-h6 was
// not pulling far enough clear of the body text for them to read as divisions.
.section-heading {
  font-size: 1.35rem;
  font-weight: 700;
  line-height: 1.3;
}

.header-accent {
  font-size: 0.9rem;
  font-weight: 700;
  letter-spacing: 0.2em;
  opacity: 0.7;
  text-transform: uppercase;
}

.hero-blurb {
  font-size: 1.35rem;
  line-height: 1.5;
}

.contents-list li {
  margin-bottom: 0.25rem;

  a {
    color: rgb(var(--v-theme-primary));
  }
}

// The picture of the tab sits inside the heading, so it must not stretch to the row's width the
// way a block v-img would, and it must not push the heading's line height around.
.tab-shot {
  flex: 0 0 auto;
}

// The fallback for a tab capture that has not been taken yet: the tab bar's own glyph, sized to
// sit level with the heading beside it rather than as body text next to a heading.
.tab-glyph {
  color: rgb(var(--v-theme-primary));
  font-size: 1.2rem;
  width: 1.6rem;
}

.slide-counter {
  white-space: nowrap;
}

// Centred on the dialog, not on the space the close button leaves behind: the button comes out of
// the flow so the header lines up with the slide under it.
.deck-title {
  position: relative;
}

.deck-close {
  position: absolute;
  right: 1rem;
  top: 50%;
  transform: translateY(-50%);
}

// Vuetify's default card text (0.875rem) reads small in a dialog this size
.v-card-text {
  font-size: 1rem;
}

ul li {
  margin-bottom: 0.5rem;
}
</style>
