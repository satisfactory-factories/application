<template>
  <v-dialog
    v-model="showSplash"
    :max-width="currentSlide === 0 ? 1200 : 1000"
    :persistent="locked"
    scrollable
  >
    <v-card>
      <v-card-title class="d-flex align-center pb-0">
        <span class="header-accent flex-grow-1 text-center">What's new in Beta v0.6</span>
        <!-- Off for the whole of an automatic showing that carries the warning: it is not
             something to flick away from the corner of the eye. -->
        <v-btn
          v-if="!locked"
          density="comfortable"
          icon="fas fa-times"
          size="small"
          variant="text"
          @click="closeSplash"
        />
      </v-card-title>
      <v-card-text>
        <!-- Slide 1: The breaking change. It leads because it changes what every existing plan
             reports, and the wizard below is the way out of it. -->
        <div v-if="currentSlide === 0">
          <h2 class="text-h4 text-center mb-2">The "Groundwork" Update</h2>
          <p class="text-center text-medium-emphasis mb-4">Everything your plan needs now comes from the ground somewhere.</p>
          <!-- Only when this plan is one the change has actually broken. Holding a new user on a
               red banner about plans they have never made teaches them the warning is noise, and
               a tab created from nothing is stamped as answered the moment it exists. -->
          <v-alert
            v-if="actionRequired"
            class="mb-4 action-banner"
            density="comfortable"
            prominent
            type="error"
            variant="tonal"
          >
            <h3 class="text-h4 mb-1 font-weight-bold">Action needed: Raw Resources are no longer assumed!</h3>
            <p class="mb-2">
              <b>Any plan built before this release will show
                factories in red</b> until what they need is mined or imported. Nothing has been
              lost, and the <b>Raw Resources Wizard</b> will help you get started, removing a lot of the annoyance of creating
              a bunch of new factories.
            </p>
            <p v-if="awaitingAnswer" class="mb-0">
              Choose one of the two below to carry on.
            </p>
          </v-alert>
          <!-- Directly under the banner, because this is the one decision the deck will not open
               without and nobody reads a footer. The same pair sits in the card actions as well,
               for anyone who has scrolled this far down slide 1 and lost sight of these. -->
          <div v-if="awaitingAnswer" class="action-choice d-flex justify-center flex-wrap ga-3 mb-4">
            <v-btn
              color="green"
              prepend-icon="fas fa-shovel"
              size="large"
              variant="flat"
              @click="runWizard"
            >
              Fix my plans with the Raw Resources Wizard
            </v-btn>
            <v-btn
              prepend-icon="fas fa-check"
              size="large"
              variant="outlined"
              @click="acknowledge"
            >
              I understand — I'll fix my plans myself
            </v-btn>
          </div>
          <youtube-embed
            v-if="launchVideoId"
            class="mb-4"
            :video-id="launchVideoId"
          />
          <p class="hero-blurb mb-4">
            <b>Raw resources are now first class citizens in the planner.</b> If nothing in your plan digs up the ore,
            you're short of it, the same as you would be with any other part. Create mining factories and export the resources to dependants,
            or produce the raw resource locally (e.g. water), the choice is now yours, with full logistics demand tracking baked in.
          </p>
          <p class="text-body-medium mb-4">Miners, Resource Wells and Water Extractors are now full class citizens in the planner. Per each one, there are different mechanics which is handled in the building groups, where you have multiple types of the same building (e.g. multiple raw extractors) on the map and manage them in one place. This also has a side benefit of the power statistics being more accurate as there's more buildings accounted for.</p>
          <v-alert
            class="mb-4"
            density="comfortable"
            type="warning"
            variant="tonal"
          >
            <h3 class="text-h6 mb-2">What this means for your existing plans</h3>
            <p class="mb-2">
              The planner used to quietly assume you were supplying raw resources yourself. It
              doesn't any more — anything a factory doesn't mine or import is now a real shortage,
              so <b>plans built before this will show factories in red.</b> Nothing in your plan
              has been changed or lost; it is only being honest about what was already missing.
            </p>
            <p class="mb-0">
              The <b>Raw Resources Wizard</b> can fix a plan in one pass — see it two slides on,
              or run it now.
            </p>
          </v-alert>
          <!-- While slide 1 is unanswered the buttons live in the footer instead, where they
               cannot scroll out of reach — a window that will not close needs them on screen. -->
          <p v-if="!awaitingAnswer" class="text-center mb-4">
            <v-btn color="green" prepend-icon="fas fa-shovel" variant="flat" @click="runWizard">
              Run the Raw Resources Wizard
            </v-btn>
          </p>
          <p v-if="acknowledged" class="text-center text-success mb-4">
            <i class="fas fa-check" /><span class="ml-2">Noted — the wizard is in <b>Options</b> whenever you want it.</span>
          </p>
          <p class="mb-2">There's a lot in this one — jump to what interests you, or take the full tour!</p>
          <ul class="contents-list ml-6">
            <li v-for="(slide, index) in slides.slice(1)" :key="slide.nav">
              <a href="#" @click.prevent="goToSlide(index + 1)">{{ slide.title }}</a>
            </li>
          </ul>
        </div>

        <!-- Slide 2: Mining -->
        <div v-if="currentSlide === 1">
          <h2 class="text-h5 text-center mb-2">
            <i class="fas fa-hard-hat" /><span class="ml-2">Mining</span>
          </h2>
          <p class="mb-4">
            Raw resources are extracted like anything else is produced. Build a dedicated mine and
            export the ore, or mine on site in the factory that needs it.
          </p>
          <!-- One at a time. All three stacked was more text than a slide gets read for. -->
          <div class="d-flex justify-center flex-wrap ga-2 mb-4">
            <v-btn
              v-for="example in examples"
              :key="example.key"
              :color="example.key === activeExampleKey ? 'primary' : undefined"
              :variant="example.key === activeExampleKey ? 'flat' : 'outlined'"
              @click="activeExampleKey = example.key"
            >
              {{ example.label }}
            </v-btn>
          </div>
          <v-img
            :alt="activeExample.alt"
            class="mb-3 mx-auto rounded"
            max-width="1200"
            :src="activeExample.image"
          />
          <ul class="ml-6 mb-2">
            <li v-for="point in activeExample.points" :key="point">{{ point }}</li>
          </ul>
        </div>

        <!-- Slide 3: The wizard -->
        <div v-if="currentSlide === 2">
          <h2 class="text-h5 text-center mb-2">
            <i class="fas fa-shovel" /><span class="ml-2">The Raw Resources Wizard</span>
          </h2>
          <v-img
            v-if="hasWizardShot"
            alt="The Raw Resources Wizard listing factories short of a raw resource"
            class="mb-4 mx-auto rounded"
            max-width="1200"
            :src="shots.wizard"
          />
          <p class="mb-4">
            It lists every factory short of a raw resource. Per row: build a shared mine, mine it
            on site, import it from a factory that already mines it, or leave it.
          </p>
          <ul class="ml-6 mb-4">
            <li><b>One mine per resource</b>, sized to everything that asked for it — a plan short of iron in eight places gets one Iron Ore Mine, not eight.</li>
            <li><b>Water defaults to on-site extraction.</b> A resource already mined somewhere defaults to importing from there.</li>
            <li>New mines land at the <b>top or bottom</b> of the plan, your choice, and can be renamed before they are built.</li>
            <li><b>Resource wells are the one thing it won't build.</b> Satellite nodes have their own purities, and the game now varies those settings too, so what you are trying to build is your call. Nitrogen rows offer an import or nothing.</li>
          </ul>

          <v-divider class="my-4" />

          <h3 class="text-h6 mb-2">Applying</h3>
          <p class="mb-4">
            Once you have made your choices it shows you a summary. You can download a backup from
            there, then apply.
          </p>

          <v-divider class="my-4" />

          <h3 class="text-h6 mb-2">Where to find it</h3>
          <v-img
            v-if="hasOptionsShot"
            alt="The Options button, at the top right of the planner"
            class="mb-3 mx-auto rounded"
            max-width="620"
            :src="shots.options"
          />
          <p class="mb-4">
            It isn't only for migrating. It lives in <b>Options</b>, for any time a new factory
            comes up short.
          </p>
          <p class="text-center">
            <v-btn
              color="green"
              prepend-icon="fas fa-shovel"
              size="x-large"
              variant="flat"
              @click="runWizard"
            >
              Run the Raw Resources Wizard
            </v-btn>
          </p>
        </div>

        <!-- Slide 4: Factory groups -->
        <div v-if="currentSlide === 3">
          <h2 class="text-h5 text-center mb-2">
            <i class="fas fa-folder-tree" /><span class="ml-2">Factory Groups</span>
          </h2>
          <v-img
            v-if="hasGroupsShot"
            alt="Factories organised into coloured groups in the sidebar"
            class="mb-4 mx-auto rounded"
            max-width="1200"
            :src="shots.groups"
          />
          <p class="mb-4">
            Factories can belong to a <b>group</b>: a named, coloured folder that collapses,
            reorders, and can be dragged in and out of. Anything in no group falls into
            <b>Ungrouped</b>, pinned to the top.
          </p>
          <ul class="ml-6 mb-4">
            <li>
              <b>In the sidebar</b>, a group is a header with its colour, an editable name, a
              factory count and a line showing what it produces.
              <ul class="ml-4 mt-1">
                <li>It shows as many products as the sidebar's width allows, then folds the rest into a <b>+N</b>.</li>
                <li>Each carries the group's surplus or shortfall of it — green over, red short.</li>
              </ul>
            </li>
            <li>Drag factories between groups, reorder them inside one, or drag the groups themselves.</li>
            <li><b>In the planner</b>, a group's factories sit under a collapsible band, with a line down the left linking them to it.</li>
            <li><b>Colour</b> is whatever you wish through the picker. We recommend avoiding red and amber — a status still wins the border, and a group wearing those reads as a broken factory.</li>
            <li><b>Deleting a group never deletes a factory</b> — one still holding factories asks where they should go first.</li>
          </ul>

          <v-divider class="my-4" />

          <h3 class="text-h6 mb-2">Organising a plan in one go</h3>
          <v-img
            v-if="hasGroupButtonsShot"
            alt="The Group and Multi-group edit buttons at the foot of the sidebar"
            class="mb-3 mx-auto rounded"
            max-width="420"
            :src="shots.groupButtons"
          />
          <p class="mb-2">
            <b>Multi-group edit</b> assigns a whole selection at once, with <i>Select these</i> for
            the case it is nearly always going to be. Both buttons are at the bottom of the sidebar.
          </p>
        </div>

        <!-- Slide 5: Factory icons -->
        <div v-if="currentSlide === 4">
          <h2 class="text-h5 text-center mb-2">
            <i class="fas fa-icons" /><span class="ml-2">Factory Icons</span>
          </h2>
          <p class="mb-3">
            Factories can now have icons. Search the picker for the one you want.
          </p>
          <v-img
            v-if="hasIconsShot"
            alt="The factory icon picker"
            class="mb-4 mx-auto rounded"
            max-width="1200"
            :src="shots.icons"
          />
          <ul class="ml-6 mb-4">
            <li>They show on the factory itself, in the sidebar, and in the import and export sections.</li>
            <li><b>352 to pick from</b>: game art for every machine, belt, pipe, generator, vehicle, resource and component the planner knows, plus emoji shapes, digits and symbols.</li>
            <li><b>Search covers the whole set</b> whichever category you are in, and ignores punctuation — the game writes "Mk.5", so "mk5" finds it.</li>
            <li>Click the icon in the card header or the sidebar to pick one. <i>Use default</i> puts the generic glyph back.</li>
            <li>If we don't have the icon you want, emoji in the factory's <b>name</b> still work — they just won't appear as the icon elsewhere in the plan.</li>
          </ul>
        </div>

        <!-- Slide 6: The rest of the planner work -->
        <div v-if="currentSlide === 5">
          <h2 class="text-h5 text-center mb-2">
            <i class="fas fa-sparkles" /><span class="ml-2">More quality of life features</span>
          </h2>
          <h3 class="text-h6 mb-2">Factory status indicators</h3>
          <v-img
            v-if="hasStatusShot"
            alt="A factory carrying status chips under its name"
            class="mb-2 mx-auto rounded"
            max-width="1200"
            :src="shots.status"
          />
          <p class="mb-2">
            A factory now says what is wrong with it via a chip, shown on the factory and in the
            sidebar. Red for a problem, amber for "probably not what you meant".
          </p>
          <ul class="ml-6 mb-4">
            <li>Six to start with: part shortage, unmet export request and building groups that don't add up in red; out of sync with the game, redundant import and duplicate import in amber.</li>
            <li>Clicking one scrolls to the section it points at.</li>
            <li><b>Bug fix:</b> a power-only factory never showed red when it had problems. It does now.</li>
          </ul>
          <v-divider class="my-4" />

          <h3 class="text-h6 mb-2">Statistics say where a number came from</h3>
          <v-img
            v-if="hasStatsShots"
            alt="The Raw Resources table, listing each resource against the factories extracting it"
            class="mb-2 mx-auto rounded"
            max-width="1200"
            :src="shots.statsRaw"
          />
          <p class="mb-2">
            <b>Raw Resources</b> counts what your plan digs up, per resource and per factory.
          </p>
          <v-img
            v-if="hasStatsShots"
            alt="The Product Surplus and Deficit table, with each product broken down by factory"
            class="mb-2 mx-auto rounded"
            max-width="1200"
            :src="shots.statsSurplus"
          />
          <p class="mb-4">
            <b>Product Surplus &amp; Deficit</b> is a table now too, and both break the figure down
            by factory. Click a chip to jump there.
          </p>
          <v-img
            v-if="hasStatsShots"
            alt="The By factory power table, each factory's generation, consumption and balance"
            class="mb-2 mx-auto rounded"
            max-width="1200"
            :src="shots.statsPower"
          />
          <p class="mb-4">
            <b>Power Consumption and Generation</b> gains a <b>By factory</b> breakdown, heaviest
            net drain first. Collapsed by default.
          </p>

          <v-divider class="my-4" />

          <h3 class="text-h6 mb-2">Tasks</h3>
          <v-img
            v-if="hasTasksShot"
            alt="The factory tasks card with drag handles and checkboxes"
            class="mb-2 mx-auto rounded"
            max-width="1200"
            :src="shots.tasks"
          />
          <p class="mb-4">
            <b>Tasks drag into any order</b> by the grip handle, completed ones included. Done is
            now a checkbox rather than a pair of buttons.
          </p>

          <v-divider class="my-4" />

          <h3 class="text-h6 mb-2">Export Calculator — belts and pipes</h3>
          <p class="mb-4">
            Belts are back, per destination: how many conveyors of a chosen mark it takes to carry
            an export, across all six marks, with the smallest single belt that can do it picked
            for you. Split an export across <b>belt groups</b>, each with its own mark, entering
            either an items/min amount or a whole number of belts — and it'll tell you when a group
            is redundant. Fluid exports get the same in <b>pipes</b>, and <b>Fluid Trucks</b>
            (3,200 m³) are now supported rather than being told to package the fluid.
          </p>
          <v-divider class="my-4" />

          <h3 class="text-h6 mb-2">Finding your way around</h3>
          <ul class="ml-6 mb-2">
            <li><b>The sidebar shows which factory you're looking at</b>, following you as you scroll — no more losing your place in a 30-factory plan.</li>
            <li><b>Jump to a requesting factory</b> from any export chip in the satisfaction table, and an <b>Exported</b> chip now sits beside Product and Imported on anything another factory has asked for.</li>
            <li><b>Every game image has a tooltip.</b> Hovering an icon that wasn't a wiki link used to tell you nothing, so a row of eight icons was eight guesses.</li>
          </ul>
        </div>

        <!-- Slide 7: Fixes and where to read more -->
        <div v-if="currentSlide === 6">
          <h2 class="text-h5 text-center mb-2">
            <i class="fas fa-wrench" /><span class="ml-2">Fixes</span>
          </h2>
          <h3 class="text-h6 mb-2">Ghost exports are gone</h3>
          <p class="mb-4">
            A factory could sit there claiming to export a part to a factory with no matching
            import — or quietly export the wrong amount. There wasn't one cause, there were five,
            and each is fixed. The worst: <b>two factories could end up sharing an ID</b>. IDs were
            drawn at random from 0–9,999 with nothing checking, so a 60-factory plan had roughly a
            one-in-six chance of a collision — which merged two factories into one as far as the
            dependency system was concerned. IDs are now issued against the plan, and a plan loaded
            with a collision in it has the clash broken and its exports rebuilt.
          </p>
          <h3 class="text-h6 mb-2">Plans repair themselves on load</h3>
          <p class="mb-4">
            A plan whose figures look current is deliberately not recalculated when it loads —
            that's what makes switching tabs fast — but it meant anything already wrong stayed
            wrong through every reload. Loading now checks the whole import/export chain, fixes
            what it finds, and <b>tells you exactly what it changed</b>, grouped by factory, in one
            dialog. The browser alert that used to fire for this is gone.
          </p>
          <h3 class="text-h6 mb-2">Numbers that were a hair off</h3>
          <p class="mb-4">
            Fuel Generators burning Rocket Fuel asked for 2400.002/min instead of 2400, forcing you
            to hand-override the producing factory. The game data was at fault — a rate rounded
            before it was divided — and it's fixed at the parser, along with Compacted Coal,
            Super-State Computers and both Uranium Fuel Rod recipes. <b>Plans already carrying
              those numbers repair themselves on load</b>, and tell you what changed. Somersloop
            entries are also clamped to the building's slots as you type, so the field can't show a
            number the plan isn't built from.
          </p>
          <p class="mb-4">
            Refreshing or sharing a link to the Parts browser no longer 404s, and an unknown URL
            now lands on a proper "page not found" rather than the bare CDN error.
          </p>
          <p class="text-center mb-2">
            Full details on the
            <v-btn class="mx-1" color="primary" href="/changelog">Change Log</v-btn>
          </p>
          <p class="text-center text-medium-emphasis">
            Missed the last one?
            <v-btn class="mx-1" variant="tonal" @click="showV5Splash">
              <i class="fas fa-backward" /><span class="ml-2">What's new in Beta v0.5</span>
            </v-btn>
          </p>
        </div>
      </v-card-text>
      <v-card-actions class="px-4 pb-4">
        <!-- The answer to slide 1 lives here rather than in the slide, so it cannot scroll out of
             reach in a window that will not close. -->
        <v-btn v-if="currentSlide > 0" variant="tonal" @click="prevSlide">
          <i class="fas fa-arrow-left" /><span class="ml-2">{{ slides[currentSlide - 1].nav }}</span>
        </v-btn>
        <!-- The same choice as under the banner. Kept here as well because slide 1 is long: once
             it has been scrolled past, this is the only copy still on screen, and the deck does
             not close until one of them is pressed. -->
        <template v-if="awaitingAnswer">
          <v-btn
            class="ml-2"
            color="green"
            prepend-icon="fas fa-shovel"
            variant="flat"
            @click="runWizard"
          >
            Run the wizard
          </v-btn>
          <v-btn class="ml-2" variant="outlined" @click="acknowledge">
            I'll sort it myself
          </v-btn>
        </template>
        <v-spacer />
        <span class="text-medium-emphasis slide-counter">{{ currentSlide + 1 }} / {{ slides.length }}</span>
        <v-spacer />
        <v-btn
          color="primary"
          :disabled="awaitingAnswer"
          variant="elevated"
          @click="nextSlide"
        >
          <template v-if="currentSlide === slides.length - 1">
            <i class="fas fa-check" /><span class="ml-2">Got it!</span>
          </template>
          <template v-else>
            <span class="mr-2">{{ slides[currentSlide + 1].nav }}</span><i class="fas fa-arrow-right" />
          </template>
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
  import { storeToRefs } from 'pinia'
  import eventBus from '@/utils/eventBus'
  import { useAppStore } from '@/stores/app-store'

  // Launch video. Deliberately empty until the video is published — the embed renders only when
  // this is set, so an unfinished release never shows a broken player.
  const launchVideoId = ''

  // Bound rather than literal paths: these live in public/, and a static src makes vite try to
  // resolve them at transform time — which fails the whole module while a capture is missing.
  const shots = {
    miners: '/assets/changelog/beta6/miners.png',
    well: '/assets/changelog/beta6/resource-well.png',
    wizard: '/assets/changelog/beta6/wizard.png',
    groups: '/assets/changelog/beta6/factory-groups.png',
    icons: '/assets/changelog/beta6/factory-icons.png',
    status: '/assets/changelog/beta6/status-chips.png',
    tasks: '/assets/changelog/beta6/tasks.png',
    statsRaw: '/assets/changelog/beta6/statistics-raw-resources.png',
    statsSurplus: '/assets/changelog/beta6/statistics-surplus.png',
    statsPower: '/assets/changelog/beta6/statistics-power-by-factory.png',
    options: '/assets/changelog/beta6/options-button.png',
    groupButtons: '/assets/changelog/beta6/group-buttons.png',
  }

  // A v-img pointed at a file that isn't there renders as a broken image, so each capture that
  // may not have landed yet sits behind its own flag. Flip one off and its slide reads as text.
  const hasWizardShot = true
  const hasGroupsShot = true
  const hasIconsShot = true
  const hasStatusShot = true
  const hasTasksShot = true
  const hasStatsShots = true
  const hasOptionsShot = true
  const hasGroupButtonsShot = true

  const key = 'seenV6Splash'

  const appStore = useAppStore()
  const { showRawBreakingNotice } = storeToRefs(appStore)

  const showSplash = ref<boolean>(false)
  const currentSlide = ref(0)

  // Whether this user has a plan the breaking change can have broken. Decided once, from the
  // notice the store raised on load — it only asks when a plan actually has factories in it. It
  // changes what slide 1 offers (the wizard, or just an acknowledgement), never whether the
  // warning is shown: a plan arrives by share link and paste as often as from local storage.
  const actionRequired = ref(false)
  const acknowledged = ref(false)

  // The lock belongs to the automatic showing of a warning that applies. A dialog that can be
  // waved away in the corner of the eye is not a warning, so someone whose plan the change has
  // broken gets no X, no click-outside and no escape: answer slide 1, then leave by the far end
  // of the tour. Everyone else gets an ordinary deck they can close — holding someone on a red
  // banner about plans they do not have teaches them the warning is noise. Reopening later from
  // "Show changes" is unlocked too, since by then it is reference material rather than news.
  const autoShown = ref(false)
  const locked = computed(() => autoShown.value && showSplash.value && actionRequired.value)

  // Slide 1 cannot be skipped past until it is answered.
  const awaitingAnswer = computed(() => locked.value && !acknowledged.value)

  // Whether the introduction was already out of the way when this page loaded, read once rather
  // than per call. A brand new visitor dismisses the intro seconds before their first plan
  // finishes loading, and reacting to that would land this deck on top of their first ever look
  // at the planner. v0.5 gated it the same way and for the same reason; they get it on their
  // next visit instead, and nothing is marked seen in the meantime.
  const introWasDismissed = localStorage.getItem('dismissed-introduction') === 'true'
  const seen = () => localStorage.getItem(key) === 'true'

  // Present the splash only once the planner has finished loading — showing it during the load
  // means the page resizing underneath can shift the dialog mid-interaction and cause misclicks.
  // Some flows (e.g. demo plan setup) load more than once back to back, so the show is debounced:
  // it fires shortly after the last loadingCompleted and is cancelled whenever a new load begins.
  let loadSettled = false
  let showTimer: ReturnType<typeof setTimeout> | undefined

  // The raw-resources breaking notice is the third party here, and this deck takes it over rather
  // than queuing behind it. Both ship in the same release, so otherwise every returning user is
  // handed two dialogs saying the same thing — and slide 1 says it better, with the tour attached.
  // Taking it over is what makes the lock honest: the notice demanded a decision, so this must too.
  const tryShow = () => {
    if (!loadSettled || seen()) {
      return
    }
    actionRequired.value = showRawBreakingNotice.value
    if (actionRequired.value) {
      appStore.deferRawBreakingNotice()
    }
    teardownLoadListeners()
    autoShown.value = true
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
    eventBus.off('rawWizardClosed', resumeAfterWizard)
  })

  const router = useRouter()

  const slides = [
    { title: 'The "Groundwork" Update is here!', nav: 'Intro' },
    { title: 'Mining', nav: 'Mining' },
    { title: 'The Raw Resources Wizard', nav: 'Raw Resources Wizard' },
    { title: 'Factory Groups', nav: 'Factory Groups' },
    { title: 'Factory Icons', nav: 'Factory Icons' },
    { title: 'More quality of life features', nav: 'Quality of Life' },
    { title: 'Fixes', nav: 'Fixes' },
  ]

  // The three shapes extraction takes, shown on the first slide the same way the breaking-change
  // notice shows them.
  // Each carries its own copy: the slide shows one at a time rather than all three stacked,
  // which was more text than anyone reads on a slide.
  const examples = [
    {
      key: 'miners',
      label: 'Miners',
      image: '/assets/changelog/beta6/miners.png',
      alt: 'A mine mixing Miner Mk.3s on pure nodes with a Mk.2 on a normal one',
      points: [
        'Pick any node resource as a product and the planner offers its extractor as the recipe.',
        'Each building group sets its own miner mark and node purity, and both multiply with the group\'s clock exactly as in game.',
        'Purity changes the yield, never the power.',
        'A mine that falls short says how many of each mark, at each purity, would close the gap.',
      ],
    },
    {
      key: 'well',
      label: 'Resource wells',
      image: '/assets/changelog/beta6/resource-well.png',
      alt: 'A resource well pressurizer with its satellite nodes by purity',
      points: [
        'A well is one building group: the pressurizer, plus its satellites on impure, normal and pure micro-nodes.',
        'The pressurizer\'s clock scales every satellite at once. Satellites draw no power — the pressurizer pays for all of them.',
        'Nitrogen Gas is plannable for the first time. Wells are its only source.',
      ],
    },
    {
      key: 'water',
      label: 'Water & oil',
      image: '/assets/changelog/beta6/water-extractor.png',
      alt: 'Water Extractors, which have no node purity',
      points: [
        'Water sources have no purity, so the Water Extractor is a plain building at 120 m³/min. It overclocks like any other.',
        'Oil Extractors use node purity as normal.',
      ],
    },
  ] as const

  const activeExampleKey = ref<typeof examples[number]['key']>('miners')
  const activeExample = computed(() =>
    examples.find(example => example.key === activeExampleKey.value) ?? examples[0])

  // In case the user closes the dialog without clicking on the button
  watch(() => showSplash.value, value => {
    if (!value) {
      closeSplash()
    }
  })

  const closeSplash = () => {
    // Nothing closes this deck while slide 1 is unanswered. Answering it does not open the exit
    // either — the X and the escape stay off for the whole automatic showing, so the way out is
    // the "Got it!" at the end of the tour.
    if (awaitingAnswer.value) {
      showSplash.value = true
      currentSlide.value = 0
      return
    }
    showSplash.value = false
    autoShown.value = false
    localStorage.setItem(key, 'true')
  }

  // The decision the lock is waiting for. Marks the breaking notice seen, since this deck spoke
  // for it — without this it would be raised again on the next load.
  const acknowledge = () => {
    acknowledged.value = true
    if (actionRequired.value) {
      appStore.dismissRawBreakingNotice()
    }
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

  // Where to come back to. Running the wizard from slide 1 is an exit part way through the tour,
  // and the rest of the release is what the deck is for — so stepping aside for the wizard is a
  // pause, not a close.
  let resumeSlide: number | null = null

  const resumeAfterWizard = () => {
    eventBus.off('rawWizardClosed', resumeAfterWizard)
    if (resumeSlide === null) {
      return
    }
    currentSlide.value = resumeSlide
    resumeSlide = null
    // Unlocked on the way back: they answered slide 1 by running the wizard, so from here it is
    // an ordinary deck they can close whenever they like.
    showSplash.value = true
  }

  // The wizard is mounted by the planner's options dialog, which does not exist on the other
  // pages — so get back to the planner first and give it a moment to listen.
  const runWizard = async () => {
    acknowledge()
    resumeSlide = currentSlide.value
    eventBus.on('rawWizardClosed', resumeAfterWizard)
    closeSplash()
    if (router.currentRoute.value.path !== '/') {
      await router.push('/')
      await new Promise(resolve => setTimeout(resolve, 300))
    }
    eventBus.emit('openRawWizard')
  }

  // Close first: both decks are mounted for the whole session, so emitting without this leaves
  // two dialogs stacked on top of each other.
  const showV5Splash = () => {
    closeSplash()
    eventBus.emit('splashShowV5')
  }

  // Opened by hand from the header, long after the news landed. Nothing is locked: they came
  // looking for it, and the warning has already been answered once.
  const show = () => {
    currentSlide.value = 0
    autoShown.value = false
    showSplash.value = true
  }
  defineExpose({ show })
</script>

<style lang="scss" scoped>
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

.slide-counter {
  white-space: nowrap;
}

// Vuetify's default card text (0.875rem) reads small in a dialog this size
.v-card-text {
  font-size: 1rem;
}

ul li {
  margin-bottom: 0.5rem;
}
</style>
