<template>
  <v-dialog v-model="showSplash" :max-width="currentSlide === 0 ? 1400 : 1000" scrollable>
    <v-card>
      <v-card-title class="d-flex align-center pb-0">
        <span class="header-accent flex-grow-1 text-center">What's new in Beta v0.5</span>
        <v-btn
          density="comfortable"
          icon="fas fa-times"
          size="small"
          variant="text"
          @click="closeSplash"
        />
      </v-card-title>
      <v-card-text>
        <!-- Slide 1: Announcement hero -->
        <div v-if="currentSlide === 0">
          <h2 class="text-h4 text-center mb-4">The "Overclocked" Update is here!</h2>
          <youtube-embed
            class="mb-4"
            params="si=aX6DUy_LF4aLPv_G"
            video-id="YsWDeOU3e8o"
          />
          <p class="hero-blurb mb-2"><b>Overclocking and Somersloops have arrived</b> — alongside a huge Power update, an all-new Parts &amp; Recipes browser, and a refresh of the planner's UI.</p>
          <p class="mb-2">There's a lot in this one — jump to what interests you, or take the full tour!</p>
          <ul class="contents-list ml-6">
            <li v-for="(slide, index) in slides.slice(1)" :key="slide.nav">
              <a href="#" @click.prevent="goToSlide(index + 1)">{{ slide.title }}</a>
            </li>
          </ul>
        </div>

        <!-- Slide 2: Building Groups -->
        <div v-if="currentSlide === 1">
          <h2 class="text-h5 text-center mb-2">
            <i class="fas fa-layer-group" /><span class="ml-2">Building Groups — Overclocking &amp; Somersloops</span>
          </h2>
          <v-img
            alt="Overclocking and Somersloops"
            class="mb-4"
            max-width="1200"
            src="/assets/changelog/alpha5/building-groups.png"
          />
          <p class="mb-4">
            The headline feature! Every product and power generator can now be split into <b>Building Groups</b> — plan how your production lines are physically laid out in your world. Each group has its own building count and clock speed, and the planner keeps them in sync with your production targets.
          </p>
          <h3 class="text-h6 mb-2 d-flex align-center">
            <game-asset height="24px" subject="power-shard" type="item_id" width="24px" /><span class="ml-2">Overclocking</span>
          </h3>
          <p class="mb-4">
            Set a clock speed per group and the planner works out the power draw, the buildings needed and the Power Shards required.
          </p>
          <h3 class="text-h6 mb-2 d-flex align-center">
            <game-asset height="24px" subject="somersloop" type="item_id" width="24px" /><span class="ml-2">Somersloops</span>
          </h3>
          <p class="mb-2">
            Slot them into your groups to amplify production, with the power cost calculated for you — and your total sloop usage tallied at a glance.
          </p>
        </div>

        <!-- Slide 3: The Power Update -->
        <div v-if="currentSlide === 2">
          <h2 class="text-h5 text-center mb-2">
            <i class="fas fa-bolt" /><span class="ml-2">The Power Update</span>
          </h2>
          <p class="mb-4">Power planning got a full overhaul:</p>
          <h3 class="text-h6 mb-2">Improved Power Planning</h3>
          <v-img
            alt="World power statistics table"
            class="mb-4"
            max-width="1200"
            src="/assets/changelog/alpha5/power-table.png"
          />
          <ul class="ml-6 mb-4">
            <li><b>A proper power table</b> — the Statistics section now breaks down exactly where your power comes from and where it's going.</li>
            <li><b>Power targets</b> — decide how much power you want to generate across your whole plan, and the planner tells you whether you'll generate enough.</li>
            <li><b>Variable-power buildings</b> — Particle Accelerators, Converters and Quantum Encoders show their true draw as an average with the min–max swing, so you can size your grid against the spikes.</li>
          </ul>
          <h3 class="text-h6 mb-2 d-flex align-center">
            <game-asset height="24px" subject="alienpoweraugmenter" type="building" width="24px" /><game-asset
              class="ml-1"
              height="24px"
              subject="geothermalgenerator"
              type="building"
              width="24px"
            /><span class="ml-2">Added Alien Power Augmenters &amp; Geothermal Generators</span>
          </h3>
          <v-img
            alt="Alien Power Augmenters and Geothermal Generators"
            class="mb-4"
            max-width="1200"
            src="/assets/changelog/alpha5/new-power-gens.png"
          />
          <ul class="ml-6 mb-4">
            <li><b>Geothermal Generators</b> — previously impossible to plan with, now fully supported: pick the geyser's purity and the planner handles its fluctuating output.</li>
            <li><b>Alien Power Augmenters</b> — add one to a factory as a generator and you'll get a custom UI for it. It boosts your <b>entire grid's</b> generation, with the option to supply Power Matrixes for an even bigger boost.</li>
          </ul>
          <p class="text-center">
            <v-btn color="primary" variant="elevated" @click="goToStatistics">
              <i class="fas fa-bolt" /><span class="ml-2">View your Power Statistics</span>
            </v-btn>
          </p>
        </div>

        <!-- Slide 4: Parts & Recipes -->
        <div v-if="currentSlide === 3">
          <h2 class="text-h5 text-center mb-2">
            <i class="fas fa-hat-chef" /><span class="ml-2">Parts &amp; Recipes</span>
          </h2>
          <v-img
            alt="Parts and Recipes browser"
            class="mb-4"
            max-width="1200"
            src="/assets/changelog/alpha5/parts-recipes.png"
          />
          <p class="mb-2">The Recipes page is now <b>Parts &amp; Recipes</b> — browse by part instead of wading through a flat recipe list:</p>
          <ul class="ml-6 mb-4">
            <li>Every recipe that <b>produces</b> a part, with rates/min, the building used and its power draw. <b>Alternate recipes</b> live in their own dropdown, and <b>"Used in"</b> shows everything the part feeds.</li>
            <li>It's <b>plan-aware</b>: parts you already make show an "In Plan" badge with clickable buttons that jump straight to the producing factory.</li>
            <li>Every recipe has an <b>Add to Planner</b> button — drop it into any factory (or a brand-new one) without leaving the page.</li>
            <li>Clicking a part's icon opens its <b>Satisfactory Wiki</b> page (this works everywhere in the planner!).</li>
            <li>Searching has been <b>massively improved</b> — far more accurate and much quicker.</li>
          </ul>
          <p class="text-center">
            <v-btn color="primary" variant="elevated" @click="goToParts">
              <i class="fas fa-search" /><span class="ml-2">Explore Parts &amp; Recipes</span>
            </v-btn>
          </p>
        </div>

        <!-- Slide 5: UI Refresh -->
        <div v-if="currentSlide === 4">
          <h2 class="text-h5 text-center mb-2">
            <i class="fas fa-paint-roller" /><span class="ml-2">UI Refresh</span>
          </h2>
          <p class="mb-4">The planner has been improved across the board, surfacing far more information at a glance:</p>
          <h3 class="text-h6 mb-2">The Sidebar</h3>
          <v-row class="mb-2">
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
              <p class="mb-2">The sidebar has been improved in various ways:</p>
              <ul class="ml-6 mb-2">
                <li>It's now <b>resizable</b>, and can be hidden entirely as a tray.</li>
                <li><b>Jump links</b> take you straight to Statistics and the Factories Summary — no more scrolling all the way up.</li>
                <li>It's <b>power-aware</b> — if your plan runs a power deficit, it warns you right in the sidebar.</li>
              </ul>
            </v-col>
          </v-row>
          <h3 class="text-h6 mb-2">Factories Summary</h3>
          <video
            autoplay
            class="summary-video mb-2"
            loop
            muted
            playsinline
          >
            <source src="/assets/changelog/alpha5/factories-summary.mp4" type="video/mp4">
            Your browser does not support the video tag.
          </video>
          <p class="mb-4">The Factories Summary is now a true <b>at-a-glance table</b> summarising each factory's production, satisfaction, exports and imports.</p>
          <h3 class="text-h6 mb-2">Statistics</h3>
          <p class="mb-2">Statistics got improvements all over the board:</p>
          <ul class="ml-6 mb-4">
            <li>New <b>Power Shards &amp; Somersloops</b> counts showing exactly which factories use them.</li>
            <li>Power generation &amp; consumption now has a <b>much more detailed table</b> describing exactly where your power comes from and where it's going, alongside the new power target.</li>
            <li>Building summaries, raw resources and product surpluses / deficits have been tidied up, and <b>every section is now hideable</b>.</li>
          </ul>
          <h3 class="text-h6 mb-2">Other improvements</h3>
          <ul class="ml-6 mb-2">
            <li><b>Hidden factories</b> now properly show their imports, exports and raw resources as clickable factory buttons, and have received a general polish.</li>
            <li><b>Colour consistency fixes</b> — colours are now far more consistent across the planner (power, problems, products, etc.).</li>
            <li><b>Tab switching has been reworked</b> — switching between plans is now dramatically faster.</li>
          </ul>
        </div>

        <!-- Slide 6: Performance Overhaul -->
        <div v-if="currentSlide === 5">
          <h2 class="text-h5 text-center mb-2">
            <i class="fas fa-rocket-launch" /><span class="ml-2">Massive Performance Overhaul</span>
          </h2>
          <p class="mb-4">
            The calculation engine has been <b>fundamentally reworked for large plans</b>. It used to rewrite your entire plan's data on every edit — even the values that hadn't changed — forcing huge amounts of unnecessary re-rendering. On big plans, adding a factory or tweaking a product could freeze the planner for seconds or even minutes.
          </p>
          <p class="mb-2">The engine now calculates off to the side and only applies what <b>actually changed</b>:</p>
          <ul class="ml-6 mb-4">
            <li>Editing a product on a 124-factory mega-plan now triggers <b>~40 reactive updates instead of ~30,000+</b> — only the affected fields on screen re-render.</li>
            <li>A recalculation that changes nothing now touches <b>zero</b> state — previously it rewrote thousands of values every time.</li>
            <li>Whole-plan operations like <b>[+ New]</b> shortage factories no longer hang large plans.</li>
          </ul>
        </div>

        <!-- Slide 7: Fixes & Other Changes -->
        <div v-if="currentSlide === 6">
          <h2 class="text-h5 mb-2">
            <i class="fas fa-wrench" /><span class="ml-2">Fixes</span>
          </h2>
          <ul class="ml-6 mb-4">
            <li>Unpackaged liquids (e.g. Crude Oil) are no longer double-counted, and byproduct liquids (e.g. Water from Aluminum Scrap) are now treated as "Recycled" properly.</li>
            <li>Items with no recipe (Leaves, Wood, alien remains…) can no longer be selected as products.</li>
            <li>Deleting a factory no longer shows false "corrupted data" errors for factories that imported from it.</li>
            <li>Item quantities are now capped to the game's 0.001 precision, fixing several rounding oddities.</li>
          </ul>
          <h2 class="text-h5 mb-2">
            <i class="fas fa-sparkles" /><span class="ml-2">Improvements</span>
          </h2>
          <ul class="ml-6 mb-4">
            <li>Shortages in Satisfaction now have <b>[+ New]</b> / <b>[+ Existing]</b> buttons that create or wire up a supplying factory and resolve the deficit automatically.</li>
          </ul>
          <v-img
            alt="Shortage to factory buttons"
            class="mb-4"
            max-width="1200"
            src="/assets/changelog/alpha5/shortages-factory.png"
          />
          <p class="text-center">Full details on the <v-btn color="primary" href="/changelog">Change Log</v-btn></p>
        </div>
      </v-card-text>
      <v-card-actions class="px-4 pb-4">
        <v-btn v-if="currentSlide > 0" variant="tonal" @click="prevSlide">
          <i class="fas fa-arrow-left" /><span class="ml-2">{{ slides[currentSlide - 1].nav }}</span>
        </v-btn>
        <v-spacer />
        <span class="text-medium-emphasis slide-counter">{{ currentSlide + 1 }} / {{ slides.length }}</span>
        <v-spacer />
        <v-btn color="primary" variant="elevated" @click="nextSlide">
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
  import eventBus from '@/utils/eventBus'

  // Bumped from seenV5Splash: v0.5 is a rolling release, and this slideshow covers much
  // more than the original splash did — so it re-shows to users who dismissed that one.
  const key = 'seenV51Splash'
  const seenSplash = localStorage.getItem(key)
  const seenIntro = localStorage.getItem('dismissed-introduction') ?? 'false'
  // If the user has not seen the intro splash, don't show them this as there would be two splashes.
  const shouldShow = seenSplash !== 'true' && seenIntro === 'true'

  const showSplash = ref<boolean>(false)
  const currentSlide = ref(0)

  // Present the splash only once the planner has finished loading — showing it during the
  // load means the page resizing underneath can shift the dialog mid-interaction and cause
  // misclicks. Some flows (e.g. demo plan setup) load more than once back to back, so the
  // show is debounced: it fires shortly after the last loadingCompleted and is cancelled
  // whenever a new load begins.
  let showTimer: ReturnType<typeof setTimeout> | undefined

  const onLoadStarted = () => {
    clearTimeout(showTimer)
  }

  const onLoadingCompleted = () => {
    clearTimeout(showTimer)
    showTimer = setTimeout(() => {
      teardownLoadListeners()
      showSplash.value = true
    }, 750)
  }

  const teardownLoadListeners = () => {
    clearTimeout(showTimer)
    eventBus.off('loadingCompleted', onLoadingCompleted)
    eventBus.off('prepareForLoad', onLoadStarted)
    eventBus.off('loaderInit', onLoadStarted)
  }

  onMounted(() => {
    if (shouldShow) {
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

  const slides = [
    { title: 'The "Overclocked" Update is here!', nav: 'Intro' },
    { title: 'Building Groups — Overclocking & Somersloops', nav: 'Building Groups' },
    { title: 'The Power Update', nav: 'The Power Update' },
    { title: 'Parts & Recipes', nav: 'Parts & Recipes' },
    { title: 'UI Refresh', nav: 'UI Refresh' },
    { title: 'Massive Performance Overhaul', nav: 'Performance' },
    { title: 'Fixes & Other Changes', nav: 'Fixes & Other Changes' },
  ]

  const router = useRouter()

  // In case the user closes the dialog without clicking on the button
  watch(() => showSplash.value, value => {
    if (!value) {
      closeSplash()
    }
  })

  const closeSplash = () => {
    showSplash.value = false
    localStorage.setItem(key, 'true')
    localStorage.setItem('seenV5Splash', 'true') // Keep the old key consistent
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

  const goToParts = () => {
    closeSplash()
    router.push('/parts')
  }

  const goToStatistics = async () => {
    closeSplash()
    // The Statistics section lives on the planner page (id set in Statistics.vue)
    if (router.currentRoute.value.path !== '/') {
      await router.push('/')
    }
    // The planner may still be loading (especially right after navigating) — poll for the section
    const tryScroll = (attempt = 0) => {
      const element = document.getElementById('statistics')
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } else if (attempt < 20) {
        setTimeout(() => tryScroll(attempt + 1), 500)
      }
    }
    setTimeout(() => tryScroll(), 300)
  }

  const show = () => {
    currentSlide.value = 0
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

// Vuetify's default card text (0.875rem) reads small in a dialog this size
.v-card-text {
  font-size: 1rem;
}

ul li {
  margin-bottom: 0.5rem;
}
</style>
