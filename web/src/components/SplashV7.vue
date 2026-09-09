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
        <!-- Slide 1: The headline. Four features carry this release, and the name is a pun on
             the two of them that sound alike — you sync a plan and you sink a surplus. -->
        <div v-if="currentSlide === 0">
          <h2 class="text-h4 text-center mb-2">
            The <span class="pun">SINK</span>ronisation Update
          </h2>
          <p class="text-center text-medium-emphasis mb-4">
            Sync your plans. Sink your surplus.
          </p>
          <youtube-embed
            v-if="launchVideoId"
            class="mb-4"
            :video-id="launchVideoId"
          />
          <v-img
            v-else
            alt="The launch video lands here"
            class="mb-4 mx-auto rounded"
            max-width="1200"
            :src="shots.videoPlaceholder"
          />

          <!-- The four, up front and equally weighted. Everything else in the deck hangs off
               one of them. -->
          <v-row class="mb-2" no-gutters>
            <v-col
              v-for="feature in headlines"
              :key="feature.title"
              class="pa-2"
              cols="12"
              sm="6"
            >
              <div class="headline-card h-100 pa-4 rounded">
                <h3 class="headline-title d-flex align-center ga-3 mb-2" :class="feature.tone">
                  <!-- The game's own art where the feature is a building, so the card and the
                       control it names are recognisably the same thing. -->
                  <game-asset
                    v-if="feature.asset"
                    height="28"
                    :subject="feature.asset"
                    type="item_id"
                    width="28"
                  />
                  <i v-else :class="feature.icon" />
                  <span>{{ feature.title }}</span>
                </h3>
                <p class="mb-0">{{ feature.blurb }}</p>
              </div>
            </v-col>
          </v-row>

          <p class="mb-2">Jump to what interests you, or take the full tour!</p>
          <ul class="contents-list ml-6">
            <li v-for="(slide, index) in slides.slice(1)" :key="slide.nav">
              <a class="d-inline-flex align-center ga-2" href="#" @click.prevent="goToSlide(index + 1)">
                <i :class="slide.icon" />
                <span>{{ slide.title }}</span>
              </a>
            </li>
          </ul>
        </div>

        <!-- Slide 2: The three kinds of tab. Critical knowledge before anything else about sync
             makes sense, so it comes first and stays plain. -->
        <div v-if="currentSlide === 1">
          <h2 class="text-h5 text-center mb-2">
            <i class="fas fa-folder-open" /><span class="ml-2">Every tab is local, synced or shared</span>
          </h2>
          <!-- Said before anything else on the slide, and said plainly: everything below this
               describes accounts, and the first thing anyone should know is that they are
               optional. -->
          <v-alert
            class="mb-4"
            density="comfortable"
            prominent
            type="success"
            variant="tonal"
          >
            <h3 class="text-h6 mb-1 font-weight-bold">At no point is a cloud account mandatory</h3>
            <p class="mb-0">
              The planner works <b>100% without an account</b>, just as it always has done.
            </p>
          </v-alert>
          <p class="mb-4">There are three kinds of tab, and you pick which you want.</p>

          <div v-for="kind in tabKinds" :key="kind.key" class="mb-4">
            <h3 class="section-heading d-flex align-center ga-3 mb-2">
              <!-- The glyph the tab bar itself wears, so the heading and the tab on screen are
                   recognisably the same thing. -->
              <i class="tab-glyph" :class="kind.icon" />
              <span>{{ kind.label }}</span>
            </h3>
            <p class="mb-0">{{ kind.blurb }}</p>
          </div>

          <v-divider class="my-4" />

          <h3 class="section-heading mb-2">Adding a tab</h3>
          <p class="mb-3">
            Press the <b>+</b> button at the end of the tab bar and pick which kind you want.
          </p>
          <v-img
            v-if="hasPlusButtonShot"
            alt="The + button at the end of the tab bar, highlighted"
            class="mb-3 mx-auto rounded"
            max-width="640"
            :src="shots.plusButton"
          />
          <p class="mb-0">
            The pencil on a tab opens <b>tab settings</b>, where you rename it, send it to the
            cloud, download it back to local, remove it from the cloud, hide it, share it and
            delete it. Tabs drag into whatever order you like, and your synced ones keep that
            order on your account.
          </p>
        </div>

        <!-- Slide 3: Collaboration. One picture of the dialog everything is reached from, then
             the two kinds of link side by side, because they are what people confuse. -->
        <div v-if="currentSlide === 2">
          <h2 class="text-h5 text-center mb-2">
            <i class="fas fa-share-alt" /><span class="ml-2">Tab sharing</span>
          </h2>
          <v-img
            v-if="hasShareTrayShot"
            alt="The tab sharing tray, offering a snapshot link and an invite link"
            class="mb-4 mx-auto rounded"
            max-width="820"
            :src="shots.shareTray"
          />

          <!-- The counterpart to slide 2's promise that an account is optional. It is, right up
               until this one feature, and being straight about that is the point. -->
          <v-alert
            class="mb-4"
            density="comfortable"
            type="info"
            variant="tonal"
          >
            <b>Unlike local tabs, real-time collaboration does need a cloud account.</b> It is what
            lets the planner tell who may edit a plan and keep everyone's copy of it in step.
            Snapshot links need no account at all.
          </v-alert>

          <!-- Left to right in the order the tray itself puts them. -->
          <v-row no-gutters>
            <v-col class="pr-md-4" cols="12" md="6">
              <h3 class="section-heading mb-2">
                <i class="fas fa-camera" /><span class="ml-2">Snapshot link</span>
              </h3>
              <v-img
                v-if="hasSnapshotShot"
                alt="The snapshot link half of the sharing tray"
                class="mb-3 rounded"
                :src="shots.snapshot"
              />
              <ul class="ml-6 mb-0">
                <li>This is the <b>old share link system</b>, and it is still here.</li>
                <li>You make a one-time link, and it loads into someone's browser as their own local copy.</li>
                <li>That's it — no account needed, on either end.</li>
              </ul>
            </v-col>
            <v-col class="pl-md-4" cols="12" md="6">
              <h3 class="section-heading mb-2">
                <i class="fas fa-user-plus" /><span class="ml-2">Invite a pioneer</span>
              </h3>
              <v-img
                v-if="hasShareShot"
                alt="The invite link half of the sharing tray"
                class="mb-3 rounded"
                :src="shots.share"
              />
              <ul class="ml-6 mb-0">
                <li>Invite a pioneer into your plan with a link, and you both edit it live.</li>
                <li>The link can be <b>password protected</b>.</li>
                <li>You stay in control: <b>unshare at any time</b>, and everyone keeps their own copy of the plan. Nobody loses data.</li>
              </ul>
            </v-col>
          </v-row>
        </div>

        <!-- Slide 4: The account panel, and offline mode, which lives on it. -->
        <div v-if="currentSlide === 3">
          <h2 class="text-h5 text-center mb-2">
            <i class="fas fa-user" /><span class="ml-2">Manage your plans in the new account panel</span>
          </h2>
          <v-img
            v-if="hasAccountPanelShot"
            alt="The account panel, listing local and cloud plans"
            class="mb-4 mx-auto rounded"
            max-width="900"
            :src="shots.accountPanel"
          />
          <ul class="ml-6 mb-4">
            <li><b>Local</b> lists the plans held in this browser, each with a button to send it to your account.</li>
            <li><b>Cloud</b> splits into <b>My Plans</b>, the ones you own, and <b>Joined Plans</b>, the ones shared with you.</li>
            <li>Every plan has a <b>Show</b> or <b>Hide</b> button: show opens it as a tab here, hide closes that tab and nothing more.</li>
            <li>Change your password from here too — which signs out every device, including this one.</li>
          </ul>

          <v-divider class="my-4" />

          <h3 class="section-heading mb-2">
            <i class="fas fa-sliders-h" /><span class="ml-2">Your settings follow your account</span>
          </h3>
          <p class="mb-4">
            Your personal settings, as defined in <b>Options</b>, now carry across — sign in on any
            machine and they are applied for you.
          </p>

          <v-divider class="my-4" />

          <h3 class="section-heading mb-2">
            <i class="fas fa-plane" /><span class="ml-2">Offline mode</span>
          </h3>
          <v-img
            v-if="hasOfflineShot"
            alt="The offline mode switch on the account panel"
            class="mb-3 mx-auto rounded"
            max-width="620"
            :src="shots.offline"
          />
          <ul class="ml-6 mb-0">
            <li><b>Switch it on</b> to keep your tabs deliberately unsynced — on a flight, or anywhere you would rather the planner left the network alone.</li>
            <li><b>It kicks in by itself</b> if the connection drops, so a dead network is not a broken planner.</li>
            <li><b>Everything re-syncs when you come back.</b> Keep planning offline; it all goes up when you switch it off.</li>
          </ul>
        </div>

        <!-- Slide 5: The other half of the pun. -->
        <div v-if="currentSlide === 4">
          <h2 class="text-h5 text-center d-flex align-center justify-center ga-3 mb-2 tone-sink">
            <game-asset height="32" subject="awesome-sink" type="item_id" width="32" />
            <span>AWESOME Sink support</span>
          </h2>
          <p class="mb-4">
            <b>You can now dispose of any surplus</b>, so that it doesn't generate a backlog
            (which is a bad thing). Surplus that isn't shipped to another factory can be sunk —
            and should be sunk.
          </p>
          <v-img
            v-if="hasSinkShot"
            alt="The Storage column, setting AWESOME Sinks against an item's surplus"
            class="mb-4 mx-auto rounded"
            max-width="1000"
            :src="shots.sink"
          />
          <p class="mb-3">
            Anything left over that nothing consumes, nothing exports and no sink takes will fill
            the belt and stall the buildings making it. The planner now says so, in the sidebar and
            on the item itself:
          </p>
          <v-img
            v-if="hasBacklogSatisfactionShot"
            alt="The Will cause backlog warning on an item's satisfaction row"
            class="mb-3 mx-auto rounded"
            max-width="1000"
            :src="shots.backlogSatisfaction"
          />

          <v-divider class="my-4" />

          <h2 class="text-h5 text-center d-flex align-center justify-center ga-3 mb-3 tone-depot">
            <game-asset height="32" subject="dimensional-depot" type="item_id" width="32" />
            <span>Dimensional Depot support</span>
          </h2>
          <v-img
            v-if="hasDepotShot"
            alt="The Dimensional Depot summary table"
            class="mb-4 mx-auto rounded"
            max-width="1000"
            :src="shots.depot"
          />
          <p class="mb-3">
            A summary of everything your plan uploads: what it has spare, how many Uploaders are on
            it, and which factories they stand in. Mercer Spheres and the MAM research are counted
            with it, and both the upload and expansion tiers are saved on the plan.
          </p>
          <v-img
            v-if="hasDepotAssignShot"
            alt="Assigning Dimensional Depot Uploaders in the Storage column"
            class="mb-3 mx-auto rounded"
            max-width="1000"
            :src="shots.depotAssign"
          />
          <p class="mb-3">
            <b>An Uploader deliberately changes no number.</b> The Depot is finite storage — it
            fills, then backs up like any other container. Marking an item for it records what you
            are building and what it costs, and leaves the surplus exactly as it is.
          </p>
          <v-alert density="comfortable" type="info" variant="tonal">
            <b>Where to set both:</b> under <b>Satisfaction</b> on any factory, in the new
            <b>Storage</b> column — sinks on the left, Depot Uploaders on the right.
          </v-alert>
        </div>

        <!-- Slide 6: Search, on its own, because it is one of the four. -->
        <div v-if="currentSlide === 5">
          <h2 class="text-h5 text-center mb-2">
            <i class="fas fa-search" /><span class="ml-2">Search the plan</span>
          </h2>
          <p class="mb-4">
            A search box sits next to Options in the tab bar, and <b>Ctrl/Cmd&nbsp;+&nbsp;K</b>
            opens it from anywhere. Type a factory name to jump straight to it, or a part to see
            every factory that touches it.
          </p>
          <v-img
            v-if="hasSearchShot"
            alt="The search box, with results grouped by what each factory does with the part"
            class="mb-4 mx-auto rounded"
            max-width="1000"
            :src="shots.search"
          />
          <ul class="ml-6 mb-0">
            <li><b>Part results are grouped by what the factory does with it</b>: production first, then byproducts, then imports, exports and plain ingredient demand — each row saying which it is, and how much per minute.</li>
            <li><b>Clicking a result lands on the row it names</b>, not just the top of the factory card.</li>
            <li>The arrow keys walk the results and Enter opens one.</li>
            <li>Every result wears the factory chip used everywhere else, carrying its group's colour.</li>
            <li>On a narrow screen it is a search button that opens the same panel.</li>
          </ul>
        </div>

        <!-- Slide 7: The rest of the planner work. -->
        <div v-if="currentSlide === 6">
          <h2 class="text-h5 text-center mb-2">
            <i class="fas fa-sparkles" /><span class="ml-2">Also new in the planner</span>
          </h2>

          <h3 class="section-heading mb-2">Custom buildings</h3>
          <v-img
            v-if="hasCustomBuildingsShot"
            alt="Custom buildings added to a factory, counting towards its power draw"
            class="mb-3 mx-auto rounded"
            max-width="1000"
            :src="shots.customBuildings"
          />
          <p class="mb-4">
            <b>Twenty buildings that make nothing</b> can now be added to a factory: portals, train
            stations, freight platforms, truck stations, drone ports, radar towers, the AWESOME
            Sink, hypertube entrances, jump pads, pipeline pumps and lights. They count towards the
            factory's power draw and its building list — and the Main Portal's
            <b>Singularity Cells are a real demand</b>, two a minute each.
          </p>

          <v-divider class="my-4" />

          <h3 class="section-heading mb-2">Material costs</h3>
          <v-img
            v-if="hasMaterialCostsShot"
            alt="The Material Costs panel open under Power & Buildings"
            class="mb-3 mx-auto rounded"
            max-width="1000"
            :src="shots.materialCosts"
          />
          <p class="mb-4">
            Power &amp; Buildings has a <b>Material Costs</b> panel: what it would cost, in parts, to
            build everything the factory needs. <b>A guide only</b> — nothing is assumed about belts,
            foundations or anything structural.
          </p>

          <v-divider class="my-4" />

          <h3 class="section-heading mb-2">Checklist rework</h3>
          <v-img
            v-if="hasChecklistShot"
            alt="The Checklist panel as three tables, a desynced row carrying both numbers"
            class="mb-3 mx-auto rounded"
            max-width="1000"
            :src="shots.checklist"
          />
          <ul class="ml-6 mb-4">
            <li><b>Three tables side by side</b> — Products (with Power beneath), Imports and Exports — instead of one list stacked four groups deep.</li>
            <li><b>A desynced row now says what changed</b>: an amber chip reading <code>560/min → 720/min</code>. Click it to confirm the new number.</li>
            <li><b>Reconfirm all</b>, for when you have already built the lot.</li>
          </ul>

          <v-divider class="my-4" />

          <h3 class="section-heading mb-2">Power generators: match the fuel to the supply</h3>
          <v-img
            v-if="hasGeneratorFuelShot"
            alt="A fuel generator offering Trim to supply against what its factory can spare"
            class="mb-3 mx-auto rounded"
            max-width="1000"
            :src="shots.generatorFuel"
          />
          <p class="mb-4">
            A generator burning fuel its own factory makes now offers <b>Expand to supply</b> and
            <b>Trim to supply</b>, with the figure named on the button. It accounts for everything
            else that wants the fuel — other recipes, other generators, exports — which is exactly
            the sum this saves you doing by hand.
          </p>

          <v-divider class="my-4" />

          <h3 class="section-heading mb-2">Plans can be exported and imported as files or the clipboard</h3>
          <v-img
            v-if="hasExportShot"
            alt="The Export plan dialog, offering a file or the clipboard"
            class="mb-3 mx-auto rounded"
            max-width="760"
            :src="shots.exportPlan"
          />
          <p class="mb-4">
            <b>Copy plan is now Export plan</b>, and asks where the plan should go: save it as a
            JSON file, or copy it to the clipboard. <b>Paste plan is now Import plan</b>, and asks
            where it is coming from. Either way it is the whole plan.
          </p>

          <v-divider class="my-4" />

          <h3 class="section-heading mb-2">Around the edges</h3>
          <ul class="ml-6 mb-0">
            <li><b>The sidebar has an Arrange dialog</b>: reorder groups and factories with buttons, because on a phone dragging a row was the same gesture as scrolling it.</li>
            <li><b>The sidebar follows the scroll-spy indicator</b>, keeping the highlighted factory in view.</li>
            <li><b>Every dialog now shares one header</b>, with the close button in the top-right corner where it belongs.</li>
            <li><b>Statistics and the Global Factories Summary start collapsed</b>, rather than a page-length wall of stats above your factories.</li>
            <li><b>"Last updated" sits beside the search box</b>, saying when this plan last changed — your edits and a collaborator's alike.</li>
            <li><b>The "Show Info" toggle is gone</b>, along with the paragraphs it hid. The ⓘ tooltips stay.</li>
          </ul>
        </div>

        <!-- Slide 8: Fixes, and the way back to the previous deck. -->
        <div v-if="currentSlide === 7">
          <h2 class="text-h5 text-center mb-2">
            <i class="fas fa-wrench" /><span class="ml-2">Fixes</span>
          </h2>
          <ul class="ml-6 mb-4">
            <li><b>Enter accepts a task you are editing</b> instead of dropping a newline into it. Shift+enter still types a second line.</li>
            <li><b>Fix Product no longer ignores what the factory imports</b> (#595). Local production only has to cover what the imports don't, so a factory needing 5,232/min with 2,100/min arriving now offers to make 3,132 — not the whole figure.</li>
            <li><b>A factory that consumes its own output no longer reports a phantom surplus</b> (#540). A mine extracting 480 ore a minute and smelting every bit of it still offered 240 of it to somebody else.</li>
            <li><b>A mine that exports more than it digs up can now import the difference</b> (#541). Mines had their Add Import button switched off, because extraction needs no ingredients — so the planner assumed a mine could never need anything. Promise more ore than you produce and you can now buy the shortfall from another mine.</li>
          </ul>

          <p class="text-center text-medium-emphasis">
            Missed the one before?
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

  // Set this to the v0.7 launch video id and the slot appears on slide 1; empty, the placeholder
  // card stands in its place. Deliberately not seeded with the previous release's id: that ships
  // last release's video as this one's, which is worse than no video at all.
  const launchVideoId = ''

  // Bound rather than literal paths: these live in public/, and a static src makes vite try to
  // resolve them at transform time — which fails the whole module while a capture is missing.
  const shots = {
    videoPlaceholder: '/assets/changelog/beta7/video-placeholder.png',
    tabLocal: '/assets/changelog/beta7/tab-local.png',
    tabSynced: '/assets/changelog/beta7/tab-synced.png',
    tabShared: '/assets/changelog/beta7/tab-shared.png',
    plusButton: '/assets/changelog/beta7/plus-button.png',
    shareTray: '/assets/changelog/beta7/share-tray.png',
    share: '/assets/changelog/beta7/share-invite.png',
    snapshot: '/assets/changelog/beta7/share-snapshot.png',
    accountPanel: '/assets/changelog/beta7/account-panel.png',
    offline: '/assets/changelog/beta7/offline-switch.png',
    sink: '/assets/changelog/beta7/sink-storage.png',
    backlogSatisfaction: '/assets/changelog/beta7/backlog-satisfaction.png',
    depot: '/assets/changelog/beta7/depot-summary.png',
    depotAssign: '/assets/changelog/beta7/depot-assign.png',
    search: '/assets/changelog/beta7/search.png',
    exportPlan: '/assets/changelog/beta7/export-plan.png',
    customBuildings: '/assets/changelog/beta7/custom-buildings.png',
    materialCosts: '/assets/changelog/beta7/material-costs.png',
    checklist: '/assets/changelog/beta7/checklist.png',
    generatorFuel: '/assets/changelog/beta7/generator-fuel.png',
  }

  // A v-img pointed at a file that isn't there renders as a broken image, so each capture sits
  // behind its own flag and a slide whose picture has not been taken yet ships as text. Flip one
  // on as its file lands in web/public/assets/changelog/beta7/.
  const hasPlusButtonShot = true
  const hasShareTrayShot = true
  const hasShareShot = false
  const hasSnapshotShot = false
  const hasAccountPanelShot = true
  const hasOfflineShot = false
  const hasSinkShot = true
  const hasBacklogSatisfactionShot = true
  const hasDepotShot = true
  const hasDepotAssignShot = false
  const hasSearchShot = true
  const hasExportShot = true
  const hasCustomBuildingsShot = true
  const hasMaterialCostsShot = true
  const hasChecklistShot = true
  const hasGeneratorFuelShot = true

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
    { title: 'The SINKronisation Update', nav: 'Intro', icon: 'fas fa-flag' },
    { title: 'Every tab is local, synced or shared', nav: 'Kinds of tab', icon: 'fas fa-folder-open' },
    { title: 'Tab sharing', nav: 'Tab sharing', icon: 'fas fa-share-alt' },
    { title: 'Manage your plans in the new account panel', nav: 'Your account', icon: 'fas fa-user' },
    { title: 'AWESOME Sinks and the Dimensional Depot', nav: 'Sinks & the Depot', icon: 'fas fa-recycle' },
    { title: 'Search the plan', nav: 'Search', icon: 'fas fa-search' },
    { title: 'Also new in the planner', nav: 'Also new', icon: 'fas fa-sparkles' },
    { title: 'Fixes', nav: 'Fixes', icon: 'fas fa-wrench' },
  ]

  // The four this release is actually about. Slide 1 leads on them; every later slide is one of
  // them in detail.
  // Order matters: the two sync features on the top row, the two storage ones underneath, so the
  // pair each half of the release name refers to reads together.
  const headlines = [
    {
      title: 'Realtime sync',
      icon: 'fas fa-sync',
      asset: '',
      tone: '',
      blurb: 'Every tab is a plan on your account, on every device you sign in on — and one you ' +
        'can hand to a friend and build together, live.',
    },
    {
      title: 'Search',
      icon: 'fas fa-search',
      asset: '',
      tone: '',
      blurb: 'Ctrl/Cmd + K, then a factory or a part — and land on the exact row that names it, ' +
        'anywhere in the plan.',
    },
    {
      title: 'AWESOME Sinks',
      icon: '',
      asset: 'awesome-sink',
      tone: 'tone-sink',
      blurb: 'Dispose of a surplus so it never backs the belt up, and see at a glance which of ' +
        'your factories are about to clog.',
    },
    {
      title: 'Dimensional Depot',
      icon: '',
      asset: 'dimensional-depot',
      tone: 'tone-depot',
      blurb: 'Plan what you upload, what it costs in Mercer Spheres, and whether your Uploaders ' +
        'can keep up with what you make.',
    },
  ] as const

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
// The deliberate misspelling in the release name. Coloured so it reads as the joke it is rather
// than as a typo nobody caught.
.pun {
  color: rgb(var(--v-theme-primary));
  font-weight: 700;
}

// The two storage features wear the colours the satisfaction table already gives them, so a
// heading here and the control it names are the same colour on screen.
.tone-sink {
  color: var(--sf-awesome-sink);
}

.tone-depot {
  color: var(--sf-dimensional-depot);
}

// Section headings on the later slides, which carry several unrelated changes each. text-h6 was
// not pulling far enough clear of the body text for them to read as divisions.
.section-heading {
  font-size: 1.35rem;
  font-weight: 700;
  line-height: 1.3;
}

// The four features on slide 1. A tray each, so they read as four things of equal weight rather
// than as a bullet list with the last one looking like an afterthought.
.headline-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.headline-title {
  font-size: 1.2rem;
  font-weight: 700;
  line-height: 1.3;

  i {
    color: rgb(var(--v-theme-primary));
  }

  &.tone-sink,
  &.tone-depot {
    i {
      color: inherit;
    }
  }
}

.header-accent {
  font-size: 0.9rem;
  font-weight: 700;
  letter-spacing: 0.2em;
  opacity: 0.7;
  text-transform: uppercase;
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
