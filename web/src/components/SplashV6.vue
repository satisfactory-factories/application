<template>
  <v-dialog
    v-model="showSplash"
    :max-width="currentSlide === 0 ? 1400 : 1000"
    :persistent="locked"
    scrollable
  >
    <v-card>
      <v-card-title class="d-flex align-center pb-0">
        <span class="header-accent flex-grow-1 text-center">What's new in Beta v0.6</span>
        <!-- No way out of the automatic showing: slide 1 has to be answered, and the way out
             after that is the end of the tour. Reopening it by hand later has no such lock. -->
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
          <h2 class="text-h4 text-center mb-2">The "Groundwork" Update is here!</h2>
          <p class="text-center text-medium-emphasis mb-4">Everything your plan needs now comes from somewhere.</p>
          <!-- Shown to everyone, not only to someone with a plan open right now: a plan arrives
               by share link and paste as often as it does from local storage, and the one thing
               nobody must miss is that the old ones now read differently. -->
          <v-alert
            class="mb-4 action-banner"
            density="comfortable"
            prominent
            type="error"
            variant="tonal"
          >
            <h3 class="text-h5 mb-1">Action needed — this one breaks existing plans</h3>
            <p class="mb-2">
              Raw resources are no longer assumed. <b>Any plan built before this release will show
                factories in red</b> until what they need is mined or imported — yours, or one
              shared with you. Nothing has been lost, and the <b>Raw Resources Wizard</b> fixes a
              plan in one pass.
            </p>
            <p v-if="awaitingAnswer" class="mb-0">
              Answer this slide before going on. This window doesn't close until you have been
              through what changed.
            </p>
          </v-alert>
          <youtube-embed
            v-if="launchVideoId"
            class="mb-4"
            :video-id="launchVideoId"
          />
          <v-img
            :alt="activeExample.alt"
            class="mb-2 rounded"
            max-width="1200"
            :src="activeExample.image"
          />
          <div class="d-flex justify-center flex-wrap ga-2 mb-4">
            <v-btn
              v-for="example in examples"
              :key="example.key"
              :color="example.key === activeExampleKey ? 'primary' : undefined"
              size="small"
              :variant="example.key === activeExampleKey ? 'flat' : 'outlined'"
              @click="activeExampleKey = example.key"
            >
              {{ example.label }}
            </v-btn>
          </div>
          <p class="hero-blurb mb-4">
            <b>Raw resources are no longer assumed.</b> Mine them with real miners on real nodes,
            pump them out of a resource well, or import them from a factory that does — but
            something in your plan has to produce them.
          </p>
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
          <v-img
            alt="A mine mixing Miner Mk.3s on pure nodes with a Mk.2 on a normal one"
            class="mb-4 rounded"
            max-width="1200"
            :src="shots.miners"
          />
          <p class="mb-4">
            Pick <b>Iron Ore, Raw Quartz, Water, Crude Oil</b> or any other node resource as a
            product and the planner offers its extractor as the recipe. Build a dedicated mine
            factory and export the ore across your plan, or mine on site and smelt it in the same
            factory — both work.
          </p>
          <h3 class="text-h6 mb-2">Miner mark and node purity, per building group</h3>
          <p class="mb-4">
            One ore line routinely mixes a Mk.3 on a pure node with a Mk.2 on a normal one, so
            each building group picks its own extractor and purity — and the two multiply with the
            group's clock exactly as the game does. Purity changes the yield, never the power.
            When a mine falls short it tells you how many of each mark, at each purity, would
            close the gap.
          </p>
          <h3 class="text-h6 mb-2 d-flex align-center">
            <game-asset height="24px" subject="resource-well-extractor" type="item_id" width="24px" /><span class="ml-2">Resource wells</span>
          </h3>
          <v-img
            alt="A resource well pressurizer with its satellite nodes by purity"
            class="mb-2 rounded"
            max-width="1200"
            :src="shots.well"
          />
          <p class="mb-4">
            A well is one building group: the pressurizer, and how many satellite extractors stand
            on impure, normal and pure micro-nodes. The pressurizer's clock scales every satellite
            at once, and the satellites are buildings to place but draw no power — the pressurizer
            pays for all of them. <b>Nitrogen Gas becomes plannable for the first time</b>, wells
            being its only source.
          </p>
          <h3 class="text-h6 mb-2">Water &amp; oil</h3>
          <p class="mb-2">
            Water sources have no purity, so the Water Extractor is simply a building producing a
            raw resource at a flat 120 m³/min — and it overclocks like everything else. Oil
            Extractors work off node purity in the usual way.
          </p>
        </div>

        <!-- Slide 3: The wizard -->
        <div v-if="currentSlide === 2">
          <h2 class="text-h5 text-center mb-2">
            <i class="fas fa-shovel" /><span class="ml-2">The Raw Resources Wizard</span>
          </h2>
          <v-img
            v-if="hasWizardShot"
            alt="The Raw Resources Wizard listing factories short of a raw resource"
            class="mb-4 rounded"
            max-width="1200"
            :src="shots.wizard"
          />
          <p class="mb-4">
            It lists <b>every factory short of a raw resource</b> and offers, per row: create a
            shared mine factory, mine it right there, import it from a factory that already mines
            it, or leave it alone.
          </p>
          <ul class="ml-6 mb-4">
            <li><b>One mine per resource for the whole plan</b> where you ask it to build one — a plan short of iron in eight places gets one Iron Ore Mine, not eight, sized to everything that asked for it.</li>
            <li>New mines are built on <b>Miner Mk.2s at normal purity</b>. Only the building count and the power depend on that guess, never the amount of ore, so adjust each group to the nodes you actually have.</li>
            <li><b>Water defaults to being extracted on site</b>, and a resource already mined somewhere in your plan defaults to importing from there rather than building a second mine beside the first.</li>
            <li>You choose whether new mines land at the <b>top or the bottom</b> of the plan, and you can rename any of them before they're built.</li>
            <li><b>Resource wells are the one thing it won't build</b> — a well's rate comes from its satellite nodes, so sizing one automatically would land an order of magnitude out while looking solved. Nitrogen rows offer an import or nothing, and say why.</li>
          </ul>
          <p class="mb-4">
            It shows you exactly what it's about to do — every factory it touches, everything they
            will produce, every export with its destination and rate — and <b>writes nothing until
              you confirm</b>. There's no undo in the planner, so the whole change is built and
            checked to one side first: if any part of it can't be applied, nothing is written at
            all. <b>Download a backup</b> from the confirmation screen and there's a way back from
            a run you didn't want.
          </p>
          <p class="mb-2">
            It isn't only for migrating — it lives in <b>Options</b>, the wrench beside the share
            button, for any time a new factory comes up short.
          </p>
          <p class="text-center">
            <v-btn color="green" prepend-icon="fas fa-shovel" variant="flat" @click="runWizard">
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
            class="mb-4 rounded"
            max-width="1200"
            :src="shots.groups"
          />
          <p class="mb-4">
            A plan of thirty factories was a flat list, and the only ways to organise it were the
            name and the drag order. Factories now belong to a <b>group</b>: a named, coloured
            folder that collapses like a toggle, reorders, and can be dragged in and out of.
            Anything in no group falls into <b>Ungrouped</b>, pinned to the top.
          </p>
          <ul class="ml-6 mb-4">
            <li><b>In the sidebar</b>, a group is a header with its colour, an editable name, a factory count, and a line showing what the group makes — as many item icons as the sidebar is wide enough for, then a <b>+N</b> tile listing the rest. Drag factories between groups, reorder them inside one, or drag the groups themselves.</li>
            <li><b>In the planner</b>, cards sit under a collapsible band per group. Bands only appear once there's more than one section, so a plan that has never used groups looks exactly as it did.</li>
            <li><b>Colour</b> is a palette or anything you like through the picker — red and amber excepted, since a group wearing the problem colour would read as a broken factory. A group gives its cards a muted header and a bright left spine, and <b>a status still wins the border</b>, so a factory short of copper stays red while its spine says where it lives.</li>
            <li><b>Multi-group edit</b> organises a whole plan in one visit instead of one card at a time, with <i>Select these</i> for the case it's nearly always going to be.</li>
            <li><b>Deleting a group never deletes a factory</b> — one still holding factories asks where they should go first.</li>
            <li>Groups travel with the plan through save, share links, templates and cloud sync. Plans made before this load untouched, entirely ungrouped.</li>
          </ul>
        </div>

        <!-- Slide 5: Factory icons -->
        <div v-if="currentSlide === 4">
          <h2 class="text-h5 text-center mb-2">
            <i class="fas fa-icons" /><span class="ml-2">Factory Icons</span>
          </h2>
          <v-img
            v-if="hasIconsShot"
            alt="The factory icon picker"
            class="mb-4 rounded"
            max-width="1200"
            :src="shots.icons"
          />
          <p class="mb-4">
            Every factory drew the same generic glyph, so a plan of twenty showed twenty identical
            icons and the only thing telling a sidebar row apart was a truncated name. Factories
            now carry <b>an icon you choose</b>, and it follows them everywhere: the card header,
            the sidebar, the Factories Summary, the graph, the import rows and the import/export
            chips.
          </p>
          <ul class="ml-6 mb-4">
            <li><b>352 icons.</b> Real game art for every machine, extractor and generator, every belt, lift, splitter, pipe and pump, the power infrastructure, stations, storage, vehicles, equipment, and every raw resource, fluid and component the planner knows — plus emoji: coloured squares, circles, diamonds and triangles, digits and symbols.</li>
            <li><b>The picker opens on everything</b>, laid out under category headings so you can scroll it like a sheet. The category buttons stay on screen, so they double as a map of what's in there.</li>
            <li><b>Search covers the whole set</b> regardless of the category you're in, and matches names with the punctuation stripped — the game writes "Mk.5" and nobody types the dot, so "mk5" finds it too.</li>
            <li>Click the icon in the card header or the sidebar to pick; "Use default" puts the generic glyph back.</li>
          </ul>
          <p class="mb-2">
            <b>The Demo plan wears them</b>, with its copper chain folded into a copper-coloured
            group — load it from Templates to see both features in one plan.
          </p>
        </div>

        <!-- Slide 6: The rest of the planner work -->
        <div v-if="currentSlide === 5">
          <h2 class="text-h5 text-center mb-2">
            <i class="fas fa-sparkles" /><span class="ml-2">More in the Planner</span>
          </h2>
          <h3 class="text-h6 mb-2">Factory status indicators</h3>
          <v-img
            v-if="hasStatusShot"
            alt="A factory carrying status chips under its name"
            class="mb-2 rounded"
            max-width="1200"
            :src="shots.status"
          />
          <p class="mb-2">
            A factory used to tell you exactly one thing: it was red, or it wasn't. Three unrelated
            failures collapsed into one red blob, and anything short of outright broken had nowhere
            to appear. Factories now carry <b>named status chips</b> in two tiers — red for a
            problem, amber for "this is coherent, but probably not what you meant".
          </p>
          <ul class="ml-6 mb-4">
            <li>Six statuses to start with: part shortage, unmet export request and building groups that don't add up in red; out of sync with the game, redundant import and duplicate import in amber.</li>
            <li><b>The chips say which items</b> — three shortages are three item icons and "3 shortages", not a generic warning glyph — and clicking one scrolls to the section it points at.</li>
            <li>A power-only factory whose generator groups didn't add up never turned red. It does now.</li>
          </ul>
          <h3 class="text-h6 mb-2">Tasks</h3>
          <v-img
            v-if="hasTasksShot"
            alt="The factory tasks card with drag handles and checkboxes"
            class="mb-2 rounded"
            max-width="1200"
            :src="shots.tasks"
          />
          <p class="mb-4">
            <b>Tasks drag into any order</b> by the grip handle, completed ones included — a task's
            position used to be fixed the moment you added it, so reprioritising meant deleting and
            retyping. Done is now a <b>checkbox</b> on the left rather than a pair of buttons.
          </p>
          <h3 class="text-h6 mb-2">Export Calculator — belts and pipes</h3>
          <p class="mb-4">
            Belts are back, per destination: how many conveyors of a chosen mark it takes to carry
            an export, across all six marks, with the smallest single belt that can do it picked
            for you. Split an export across <b>belt groups</b>, each with its own mark, entering
            either an items/min amount or a whole number of belts — and it'll tell you when a group
            is redundant. Fluid exports get the same in <b>pipes</b>, and <b>Fluid Trucks</b>
            (3,200 m³) are now supported rather than being told to package the fluid.
          </p>
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
        <template v-if="awaitingAnswer && actionRequired">
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
        <!-- Nothing of theirs is broken yet, so there is no job to accept — only the warning to
             take in, which is the one thing this whole lock exists to make them do. -->
        <v-btn
          v-else-if="awaitingAnswer"
          class="ml-2"
          color="primary"
          variant="outlined"
          @click="acknowledge"
        >
          I understand
        </v-btn>
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
  }

  // A v-img pointed at a file that isn't there renders as a broken image, so each capture that
  // may not have landed yet sits behind its own flag. Flip one off and its slide reads as text.
  const hasWizardShot = true
  const hasGroupsShot = true
  const hasIconsShot = true
  const hasStatusShot = true
  const hasTasksShot = true

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

  // The lock belongs to the automatic showing, not to the plan. This deck is the only warning
  // most people will get, and a dialog that can be waved away in the corner of the eye is not a
  // warning — so on first sight there is no X, no click-outside and no escape: answer slide 1,
  // then leave by the far end of the tour. Reopening it later from "Show changes" is unlocked,
  // because by then it is reference material rather than news.
  const autoShown = ref(false)
  const locked = computed(() => autoShown.value && showSplash.value)

  // Slide 1 cannot be skipped past until it is answered.
  const awaitingAnswer = computed(() => locked.value && !acknowledged.value)

  const introDismissed = () => localStorage.getItem('dismissed-introduction') === 'true'
  const seen = () => localStorage.getItem(key) === 'true'

  // Present the splash only once the planner has finished loading — showing it during the load
  // means the page resizing underneath can shift the dialog mid-interaction and cause misclicks.
  // Some flows (e.g. demo plan setup) load more than once back to back, so the show is debounced:
  // it fires shortly after the last loadingCompleted and is cancelled whenever a new load begins.
  let loadSettled = false
  let showTimer: ReturnType<typeof setTimeout> | undefined

  // Two things must be true before this deck opens, and either can become true last: the load has
  // settled, and the introduction is out of the way.
  //
  // The raw-resources breaking notice is the third party here, and this deck takes it over rather
  // than queuing behind it. Both ship in the same release, so otherwise every returning user is
  // handed two dialogs saying the same thing — and slide 1 says it better, with the tour attached.
  // Taking it over is what makes the lock honest: the notice demanded a decision, so this must too.
  const tryShow = () => {
    if (!loadSettled || seen() || !introDismissed()) {
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
    eventBus.off('introDismissed', tryShow)
  }

  onMounted(() => {
    if (!seen()) {
      eventBus.on('loadingCompleted', onLoadingCompleted)
      eventBus.on('prepareForLoad', onLoadStarted)
      eventBus.on('loaderInit', onLoadStarted)
      eventBus.on('introDismissed', tryShow)
    }
    // Manual re-show via the header's "Show changes" button — works even after dismissal
    eventBus.on('splashShow', show)
  })

  onUnmounted(() => {
    teardownLoadListeners()
    eventBus.off('splashShow', show)
  })

  const router = useRouter()

  const slides = [
    { title: 'The "Groundwork" Update is here!', nav: 'Intro' },
    { title: 'Mining', nav: 'Mining' },
    { title: 'The Raw Resources Wizard', nav: 'The Wizard' },
    { title: 'Factory Groups', nav: 'Factory Groups' },
    { title: 'Factory Icons', nav: 'Factory Icons' },
    { title: 'More in the Planner', nav: 'More in the Planner' },
    { title: 'Fixes', nav: 'Fixes' },
  ]

  // The three shapes extraction takes, shown on the first slide the same way the breaking-change
  // notice shows them.
  const examples = [
    {
      key: 'miners',
      label: 'Miners',
      image: '/assets/changelog/beta6/miners.png',
      alt: 'A mine mixing Miner Mk.3s on pure nodes with a Mk.2 on a normal one',
    },
    {
      key: 'well',
      label: 'Resource wells',
      image: '/assets/changelog/beta6/resource-well.png',
      alt: 'A resource well pressurizer with its satellite nodes by purity',
    },
    {
      key: 'water',
      label: 'Water',
      image: '/assets/changelog/beta6/water-extractor.png',
      alt: 'Water Extractors, which have no node purity',
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

  // The wizard is mounted by the planner's options dialog, which does not exist on the other
  // pages — so get back to the planner first and give it a moment to listen.
  const runWizard = async () => {
    acknowledge()
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
