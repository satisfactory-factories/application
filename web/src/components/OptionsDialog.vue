<template>
  <!-- Default size, not `small`: it shares a bar with the sidebar toggle and the share
       button, and at small it rendered 28px tall against their 36 and 40. -->
  <v-btn
    id="options-button"
    color="grey-darken-1 rounded"
    prepend-icon="fas fa-wrench"
    variant="flat"
    @click="showOptions = true"
  >
    Options
  </v-btn>
  <v-dialog v-model="showOptions" max-width="820">
    <v-card>
      <v-card-title class="d-flex align-center py-4">
        <i class="fas fa-wrench" /><span class="ml-3">Options</span>
        <v-spacer />
        <!-- The way out is the corner of the dialog, where a dialog's way out is. It used to be a
             Close button at the bottom right, under the settings and out of the eyeline. -->
        <v-btn
          id="options-close"
          density="comfortable"
          icon="fas fa-times"
          title="Close options"
          variant="text"
          @click="showOptions = false"
        />
      </v-card-title>
      <v-card-text class="text-body-2">
        <h3 class="text-subtitle-1 font-weight-bold mb-1">Raw resources</h3>
        <p class="mb-3 text-medium-emphasis">
          Every raw resource has to be mined or imported. The wizard lists each factory that is
          short of one and offers to build the mines, add the extractors, or wire the imports for
          you.
        </p>
        <v-btn
          id="run-raw-wizard"
          color="primary"
          prepend-icon="fas fa-shovel"
          variant="flat"
          @click="openWizard"
        >
          Run Raw Resources Wizard
        </v-btn>

        <v-divider class="my-4" />

        <h3 class="text-subtitle-1 font-weight-bold mb-1">Sidebar</h3>
        <h4 class="text-body-2 font-weight-bold text-medium-emphasis mb-3">Factory groups</h4>

        <v-row no-gutters>
          <!-- What the settings do, rather than a paragraph saying it. Not the real component: it
               would need a plan, and this has to show a group that has every row turned on. -->
          <v-col class="pr-md-6 mb-4 mb-md-0" cols="12" md="5">
            <div class="group-preview" :style="PREVIEW_COLOR_VARS">
              <div class="preview-header">
                <div class="d-flex align-center ga-2 px-2 py-2">
                  <i class="fas fa-grip-lines text-grey-darken-1" />
                  <span class="preview-chevron"><i class="fas fa-chevron-down" /></span>
                  <span class="preview-swatch" />
                  <span class="preview-name">Copper</span>
                  <v-spacer />
                  <v-chip class="sf-chip small no-margin factory factory-count" variant="tonal">
                    <i class="fas fa-industry" /><span class="ml-2">3</span>
                  </v-chip>
                </div>
                <div v-if="options.showGroupPower" class="d-flex align-center ga-1 px-2 pb-1">
                  <v-chip class="sf-chip x-small no-margin generation" variant="tonal">
                    <i class="fas fa-bolt mr-1" /><i class="fas fa-plus" /><span class="ml-1">0 GW</span>
                  </v-chip>
                  <v-chip class="sf-chip x-small no-margin consumption" variant="tonal">
                    <i class="fas fa-bolt mr-1" /><i class="fas fa-minus" /><span class="ml-1">0.25 GW</span>
                  </v-chip>
                  <v-chip class="sf-chip x-small no-margin error" variant="tonal">
                    <i class="fas fa-balance-scale" /><span class="ml-1">-0.25 GW</span>
                  </v-chip>
                </div>
                <div v-if="options.showGroupProducts" class="d-flex align-start ga-1 px-2 pb-1">
                  <span
                    v-for="product in previewProducts"
                    :key="product.id"
                    class="preview-tile"
                  >
                    <group-product-icon
                      :kind="options.showGroupProductKinds ? product.kind : undefined"
                      :part-id="product.id"
                      :tooltip="getPartDisplayName(product.id)"
                    />
                    <!-- Exactly balanced is grey in the real row, being neither good nor bad. -->
                    <span class="preview-net" :class="previewNetClass(product.net)">
                      {{ product.net }}
                    </span>
                  </span>
                </div>
              </div>
              <div class="preview-body">
                <div v-for="name in PREVIEW_FACTORIES" :key="name" class="preview-row">
                  <i class="fas fa-grip-lines text-grey-darken-1 mr-2" />
                  <span>{{ name }}</span>
                </div>
              </div>
            </div>
          </v-col>

          <v-col cols="12" md="7">
            <!-- The explanations are tooltips rather than paragraphs: three settings each carrying a
                 three-line blurb read as an essay with checkboxes in it, and the list of what you can
                 turn on was the part that got lost. Box and tick drawn in CSS, as in the multi-group
                 editor: Vuetify's FA aliases use `far fa-square` for the unchecked state and this app
                 ships no Font Awesome regular family, so a v-checkbox has nothing to draw until it is
                 ticked and reads as a stray filled square. -->
            <div
              :aria-checked="options.showGroupProducts"
              class="option-toggle d-flex align-center ga-3"
              role="checkbox"
              tabindex="0"
              @click="options.showGroupProducts = !options.showGroupProducts"
              @keydown.enter.prevent="options.showGroupProducts = !options.showGroupProducts"
              @keydown.space.prevent="options.showGroupProducts = !options.showGroupProducts"
            >
              <span class="tick" :class="{ on: options.showGroupProducts }" />
              <span>Show group products</span>
              <tooltip-info
                :is-caption="false"
                text="A group's product row lists what the group delivers to other factories, with its surplus or shortfall."
                @click.stop
              />
            </div>

            <!-- Indented because it only qualifies the row above, and disabled with it: internal
                 products of a row that isn't drawn is not a state worth being able to set. -->
            <div
              :aria-checked="options.showInternalGroupProducts"
              :aria-disabled="!options.showGroupProducts"
              class="option-toggle option-child d-flex align-center ga-3"
              :class="{ disabled: !options.showGroupProducts }"
              role="checkbox"
              :tabindex="options.showGroupProducts ? 0 : -1"
              @click="toggleInternalProducts"
              @keydown.enter.prevent="toggleInternalProducts"
              @keydown.space.prevent="toggleInternalProducts"
            >
              <span class="tick" :class="{ on: options.showInternalGroupProducts && options.showGroupProducts }" />
              <span>Show group internal products</span>
              <tooltip-info
                :is-caption="false"
                text="Parts a group makes and uses up entirely within itself. Off by default: the row is meant to say what the group delivers, and an intermediate that never leaves it crowds that out."
                @click.stop
              />
            </div>

            <!-- Also a child of the product row, and disabled with it for the same reason. -->
            <div
              :aria-checked="options.showGroupProductKinds"
              :aria-disabled="!options.showGroupProducts"
              class="option-toggle option-child d-flex align-center ga-3"
              :class="{ disabled: !options.showGroupProducts }"
              role="checkbox"
              :tabindex="options.showGroupProducts ? 0 : -1"
              @click="toggleProductKinds"
              @keydown.enter.prevent="toggleProductKinds"
              @keydown.space.prevent="toggleProductKinds"
            >
              <span class="tick" :class="{ on: options.showGroupProductKinds && options.showGroupProducts }" />
              <span>Badge products with their role</span>
              <tooltip-info
                :is-caption="false"
                text="A mark in the corner of each tile saying what the group does with the part: ships it to a factory outside the group, uses it up inside, or just makes it."
                @click.stop
              />
            </div>

            <div
              :aria-checked="options.showGroupPower"
              class="option-toggle d-flex align-center ga-3"
              role="checkbox"
              tabindex="0"
              @click="options.showGroupPower = !options.showGroupPower"
              @keydown.enter.prevent="options.showGroupPower = !options.showGroupPower"
              @keydown.space.prevent="options.showGroupPower = !options.showGroupPower"
            >
              <span class="tick" :class="{ on: options.showGroupPower }" />
              <span>Show group power</span>
              <tooltip-info
                :is-caption="false"
                text="What each group generates, what it consumes and whether it pays for itself. The same figures the Statistics link above them wears."
                @click.stop
              />
            </div>
          </v-col>
        </v-row>

        <v-divider class="my-4" />

        <h3 class="text-subtitle-1 font-weight-bold mb-1">Building groups</h3>
        <h4 class="text-body-2 font-weight-bold text-medium-emphasis mb-3">Effective output tolerance</h4>
        <p class="mb-3 text-medium-emphasis">
          How far an item's building groups may sit from what it asks for before the planner calls
          them imbalanced. Some recipes cannot be balanced exactly, so zero is not offered.
        </p>

        <div class="d-flex align-center flex-wrap ga-3 mb-4">
          <!-- Deliberately not `mandatory`: a custom value belongs to neither preset, and
               mandatory would drag the selection onto one. Deselecting emits undefined, which
               applyTolerance rejects. -->
          <v-btn-toggle
            id="balance-tolerance"
            color="primary"
            density="comfortable"
            :model-value="options.balanceTolerancePercent"
            variant="outlined"
            @update:model-value="applyTolerance"
          >
            <v-btn
              v-for="percent in TOLERANCE_CHOICES"
              :id="`balance-tolerance-${percent}`"
              :key="percent"
              :value="percent"
            >
              {{ percent }}%
            </v-btn>
          </v-btn-toggle>
          <!-- Vuetify inputs are flex: 1 1 auto, so `width` alone loses to the row it sits in and
               the field eats every pixel the preset buttons leave. -->
          <v-number-input
            id="balance-tolerance-custom"
            class="flex-grow-0 flex-shrink-0"
            control-variant="stacked"
            density="compact"
            hide-details
            label="Custom"
            :max="TOLERANCE_RANGE.max"
            :min="TOLERANCE_RANGE.min"
            :model-value="options.balanceTolerancePercent"
            :step="0.1"
            suffix="%"
            variant="outlined"
            width="130px"
            @update:model-value="applyTolerance"
          />
        </div>

        <!-- Same idea as the group preview above: show what the setting does rather than describe
             it. This one is a real Factory underneath and every figure goes through the engine, so
             a Mk.1 mine can be dialled in here and the verdict is the one the planner would give. -->
        <div v-if="previewProduct" class="tolerance-preview pa-3">
          <div class="d-flex align-center flex-wrap ga-2 mb-2">
            <game-asset height="24" subject="Stone" type="item" width="24" />
            <span class="font-weight-medium">Limestone</span>
            <!-- Vuetify inputs are flex: 1 1 auto, so once the sentence beside it wraps to a
                 second line this one grows into the space left on the first. -->
            <v-number-input
              id="balance-preview-amount"
              v-model="previewAmount"
              class="flex-grow-0 flex-shrink-0"
              control-variant="stacked"
              density="compact"
              hide-details
              hide-spin-buttons
              :min="1"
              suffix="/min"
              variant="outlined"
              width="130px"
              @update:model-value="rebuildPreview"
            />
          </div>
          <!-- Its own line: beside the input it wrapped at most amounts anyway. -->
          <div class="text-medium-emphasis">
            Requires <b>{{ formatNumber(previewRequiredBuildings) }}</b> Miner Mk.1s at 100%.
          </div>

          <!-- Above the inputs, as in the planner: the verdict is the thing being demonstrated. -->
          <div class="d-flex align-center flex-wrap ga-2 mb-2">
            <span :class="previewBalanced ? 'text-green' : 'text-red'">
              <i class="fas fa-cog" />
              Effective Output: <b>{{ formatNumber(previewOutput) }}/min</b> |
              {{ formatNumber(Math.abs(previewRemainingRate)) }}/min
              {{ previewRemainingRate >= 0 ? 'short' : 'over' }}
            </span>
            <v-chip
              id="balance-tolerance-preview-status"
              class="sf-chip x-small no-margin"
              :class="previewBalanced ? 'green' : 'red'"
            >
              <!-- Wrapped rather than :class-flipped: FontAwesome replaces the <i> with an <svg>
                   and detaches it, so a flip never reaches the DOM and the tick sticks. -->
              <span v-if="previewBalanced"><i class="fas fa-check" /></span>
              <span v-else><i class="fas fa-exclamation-triangle" /></span>
              <span class="ml-2">{{ previewStatus }}</span>
            </v-chip>
          </div>

          <div class="d-flex align-center flex-wrap ga-1">
            <v-chip class="sf-chip building input no-margin" variant="tonal">
              <game-asset subject="minermk1" type="building" />
              <v-number-input
                id="balance-preview-buildings"
                v-model="previewGroup.buildingCount"
                class="inline-inputs ml-0"
                control-variant="stacked"
                density="compact"
                hide-details
                hide-spin-buttons
                :min="0"
                width="80px"
                @update:model-value="refreshPreview"
              />
            </v-chip>
            <span class="text-medium-emphasis mx-1">@</span>
            <v-chip class="sf-chip yellow input unit no-margin" variant="tonal">
              <game-asset subject="overclock-production" type="item_id" />
              <v-number-input
                id="balance-preview-clock"
                v-model="previewGroup.overclockPercent"
                class="inline-inputs ml-0"
                control-variant="stacked"
                density="compact"
                hide-details
                hide-spin-buttons
                :max="250"
                :min="0"
                width="110px"
                @update:model-value="refreshPreview"
              />
              <span class="clock-unit mx-2">%</span>
            </v-chip>
            <span class="text-medium-emphasis mx-1">=</span>
            <v-chip class="sf-chip raw-resource input no-margin" variant="tonal">
              <game-asset subject="Stone" type="item" />
              <v-number-input
                id="balance-preview-output"
                v-model="previewOutputField"
                class="inline-inputs ml-0"
                control-variant="stacked"
                density="compact"
                hide-details
                hide-spin-buttons
                :min="0"
                width="110px"
                @update:model-value="solvePreviewFromOutput"
              />
              <span class="ml-1">/min</span>
            </v-chip>
          </div>

          <div class="text-medium-emphasis mt-2">
            At {{ options.balanceTolerancePercent }}%, anything outside that
            <b>{{ formatNumber(previewToleranceRate) }}/min</b> either way goes red.
          </div>
          <!-- The tolerance as the two numbers it comes to, rather than a percentage the reader
               has to apply themselves. -->
          <div class="text-medium-emphasis">
            Min: <b>{{ formatNumber(previewMinRate) }}/min</b>
            <span class="mx-2">|</span>
            Max: <b>{{ formatNumber(previewMaxRate) }}/min</b>
          </div>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>

  <raw-resources-wizard v-model="showWizard" />
</template>

<script setup lang="ts">
  import RawResourcesWizard from '@/components/planner/RawResourcesWizard.vue'
  import GroupProductIcon from '@/components/planner/groups/GroupProductIcon.vue'
  import { GroupProductKind } from '@/utils/factory-management/group-products'
  import { getPartDisplayName } from '@/utils/helpers'
  import { groupColorVars, palette } from '@/utils/colors'
  import eventBus from '@/utils/eventBus'
  import { setBalanceTolerance, TOLERANCE_RANGE, usePlannerOptions } from '@/composables/usePlannerOptions'
  import { useAppStore } from '@/stores/app-store'
  import { useGameDataStore } from '@/stores/game-data-store'
  import { balanceTolerance } from '@/utils/factory-management/building-groups/tolerance'
  import { formatNumber } from '@/utils/numberFormatter'
  import { BuildingGroup, Factory, ItemType } from '@/interfaces/planner/FactoryInterface'
  import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
  import { addProductToFactory } from '@/utils/factory-management/products'
  import {
    calculateEffectiveBuildingCount,
    recalculateGroupMetrics,
    updateBuildingGroupViaPart,
  } from '@/utils/factory-management/building-groups/common'

  const showOptions = ref(false)
  const showWizard = ref(false)
  const options = usePlannerOptions()
  const appStore = useAppStore()
  const gameDataStore = useGameDataStore()

  // Coarse on purpose: this is a judgement about how fussy the planner should be, not a figure
  // anyone needs four decimals of. The custom field is there for anyone who disagrees.
  const TOLERANCE_CHOICES = [0.1, 0.5, 1, 2, 5]

  // Both controls emit an empty value of their own accord — the toggle when its selection is
  // clicked again, the field while it is being cleared — so neither writes to the setting
  // directly. A rejected value leaves the setting and the plan exactly as they were.
  const applyTolerance = (percent: unknown) => {
    if (setBalanceTolerance(percent)) {
      appStore.forceCalculation()
    }
  }

  // ==== Tolerance preview
  // A real Factory rather than a mock-up, driven by the same engine functions the planner's own
  // building group row calls. It cannot then demonstrate behaviour the planner does not have.
  // Deliberately starts a little short — 300/min is exactly 5 Mk.1s, and 99.2% leaves it 2.4/min
  // down, inside the default 1% (3/min) and outside 0.5% — so the verdict changes as the setting
  // moves without anyone having to type anything.
  const PREVIEW_RATE = 60 // A Miner Mk.1 on a normal node
  const PREVIEW_START = { amount: 300, buildings: 5, clock: 99.2 }

  const previewFactory = ref<Factory | null>(null)
  const previewAmount = ref(PREVIEW_START.amount)
  const previewProduct = computed(() => previewFactory.value?.products[0])
  const previewGroup = computed(() => previewProduct.value?.buildingGroups[0] as BuildingGroup)

  // Bumped after every edit: the group is a plain object inside a ref, so the figures read off it
  // need something to depend on.
  const previewVersion = ref(0)

  const buildPreview = () => {
    const gameData = gameDataStore.getGameData()
    if (!gameData) return

    const factory = newFactory('Tolerance preview')
    addProductToFactory(factory, { id: 'Stone', amount: previewAmount.value, recipe: 'Extract_Stone' })
    const product = factory.products[0]
    // Sync would drag the item back onto the groups, and being able to sit short is the point.
    product.buildingGroupItemSync = false
    calculateFactories([factory], gameData, { origin: 'recalculate' })

    const group = product.buildingGroups[0]
    group.buildingCount = PREVIEW_START.buildings
    group.overclockPercent = PREVIEW_START.clock
    previewFactory.value = factory
    refreshPreview()
  }

  const refreshPreview = () => {
    if (!previewFactory.value || !previewProduct.value) return
    recalculateGroupMetrics(previewProduct.value, ItemType.Product, previewFactory.value)
    previewVersion.value++
  }

  // Editing the amount changes what the item asks for, which only a recalculation works out.
  const rebuildPreview = () => {
    const gameData = gameDataStore.getGameData()
    if (!previewFactory.value || !previewProduct.value || !gameData) return
    previewProduct.value.amount = previewAmount.value
    calculateFactories([previewFactory.value], gameData, { origin: 'recalculate' })
    refreshPreview()
  }

  // The same call the planner makes when a group's output is typed into, so the clock it solves
  // here is the clock it would solve there.
  const solvePreviewFromOutput = (value: number) => {
    if (!previewFactory.value || !previewProduct.value || !value) return
    updateBuildingGroupViaPart(
      previewGroup.value, previewProduct.value, ItemType.Product, previewFactory.value, 'Stone', value
    )
    previewVersion.value++
  }

  const previewRequiredBuildings = computed(() => previewAmount.value / PREVIEW_RATE)

  const previewOutput = computed(() => {
    void previewVersion.value // The group is a plain object, so the edits need declaring
    if (!previewProduct.value) return 0
    return calculateEffectiveBuildingCount(
      previewProduct.value.buildingGroups, 'minermk1', 'Extract_Stone'
    ) * PREVIEW_RATE
  })

  // Two-way: reads the group's output, writes it back through the solver.
  const previewOutputField = computed({
    get: () => Number(formatNumber(previewOutput.value)),
    set: solvePreviewFromOutput,
  })

  const previewRemainingRate = computed(() => previewAmount.value - previewOutput.value)

  const previewMaxRate = computed(() => previewAmount.value + previewToleranceRate.value)
  const previewMinRate = computed(() => previewAmount.value - previewToleranceRate.value)

  // Through the real helper, so the example can never promise something the planner then judges
  // differently.
  const previewToleranceRate = computed(() =>
    balanceTolerance(previewRequiredBuildings.value) * PREVIEW_RATE)

  const previewBalanced = computed(() =>
    Math.abs(previewRemainingRate.value) <= previewToleranceRate.value)

  const previewStatus = computed(() => {
    if (previewBalanced.value) return 'Balanced'
    return previewRemainingRate.value > 0 ? 'Under producing!' : 'Over producing!'
  })

  // Built when the dialog first opens rather than on mount: it needs game data, and this component
  // is alive from the moment the app is.
  watch(showOptions, open => {
    if (open && !previewFactory.value) buildPreview()
  })

  // Three factories, matching the count on the header chip: the mine feeds the smelter, which feeds
  // the products factory. Naming the third is what makes the internal parts below make sense.
  const PREVIEW_FACTORIES = ['Copper Mine', 'Copper Ingots', 'Copper Products']

  // The same tokens a real group publishes, so the preview's header tint and tree lines are the
  // ones the sidebar would give this colour rather than a hex picked to look close.
  const PREVIEW_COLOR_VARS = groupColorVars(palette.beige)

  /**
   * The preview's product row.
   *
   * Copper Ore and Copper Ingot are the internal ones, each made by one factory in the group and
   * used up by the next, so ticking "internal products" makes tiles appear rather than only
   * changing a number. The kinds are set out by hand rather than derived: this is not a real plan,
   * and the point is that one tile of each kind is on screen while the badges are on.
   */
  const previewProducts = computed<{ id: string, net: number, kind: GroupProductKind }[]>(() => {
    const delivered: { id: string, net: number, kind: GroupProductKind }[] = [
      { id: 'CopperSheet', net: 40, kind: 'export' },
      { id: 'Wire', net: -20, kind: 'product' },
    ]
    return options.value.showInternalGroupProducts
      ? [
        { id: 'OreCopper', net: 0, kind: 'internal' },
        { id: 'CopperIngot', net: 0, kind: 'internal' },
        ...delivered,
      ]
      : delivered
  })

  const previewNetClass = (net: number) => {
    if (net > 0) return 'text-success'
    return net < 0 ? 'text-error' : 'text-medium-emphasis'
  }

  const toggleProductKinds = () => {
    if (!options.value.showGroupProducts) return
    options.value.showGroupProductKinds = !options.value.showGroupProductKinds
  }

  // A child toggle of an off parent is not a state worth being able to set.
  const toggleInternalProducts = () => {
    if (!options.value.showGroupProducts) return
    options.value.showInternalGroupProducts = !options.value.showInternalGroupProducts
  }

  const openWizard = () => {
    showOptions.value = false
    showWizard.value = true
  }

  // Announced on the way out, applied or cancelled alike: whatever sent the user here may have
  // closed itself to get out of the way and needs to know when it can come back.
  watch(showWizard, (open, wasOpen) => {
    if (wasOpen && !open) eventBus.emit('rawWizardClosed')
  })

  // The wizard is mounted here and nowhere else, so anything that wants to offer it — the v0.6
  // splash and the migration prompt, for two — asks through the bus rather than mounting a
  // second copy.
  onMounted(() => eventBus.on('openRawWizard', openWizard))
  onUnmounted(() => eventBus.off('openRawWizard', openWizard))
</script>

<style lang="scss" scoped>
// Tree geometry lifted from PlannerSidebarGroup verbatim, so the preview's trunk and elbows land
// on the same pixels the real group's do. The two are read side by side; any drift shows.
$tree-indent: 18px;
$tree-line: 3px;
$tree-gutter: 4px;

// A stand-in for a sidebar group, at the sidebar's own scale, so each setting can be seen rather
// than described. Colours come from the group tokens the real thing uses.
.group-preview {
  border-radius: 4px;
  overflow: hidden;
  font-size: 0.9rem;
}

// The tolerance demo is a panel in the dialog's own flow rather than a copy of something on
// screen elsewhere, so it keeps the outline the group preview dropped.
.tolerance-preview {
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.preview-header {
  position: relative;
  background-color: var(--sf-group-muted);
  // The trunk, drawn as the real header draws it. A `border-left` instead pushed the whole header
  // 3px right of the rows below and left the elbows pointing at nothing.
  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: -$tree-gutter;
    width: $tree-line;
    background-color: var(--sf-group);
  }
}

// The real chevron is a compact icon button; here it only has to occupy the same space.
.preview-chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  font-size: 1.1rem;
  color: rgba(255, 255, 255, 0.7);
  flex: 0 0 auto;
}

.preview-swatch {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background-color: var(--sf-group);
  border: 1px solid rgba(255, 255, 255, 0.35);
  flex: 0 0 auto;
}

.preview-name {
  color: #fff;
  font-size: 1.05rem;
  font-weight: 600;
}

.factory-count {
  padding-right: 16px !important;
}

.preview-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 36px;
}

.preview-net {
  margin-top: 1px;
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1;
}

.preview-body {
  padding: $tree-gutter 0 0 $tree-indent;
}

.preview-row {
  position: relative;
  display: flex;
  align-items: center;
  background-color: rgba(255, 255, 255, 0.04);
  border-radius: 4px;
  margin-bottom: $tree-gutter;
  padding: 6px 8px;

  &::before,
  &::after {
    content: '';
    position: absolute;
    left: -$tree-indent;
    background-color: var(--sf-group);
  }

  // Trunk, one segment per row; the last row ends it at its own elbow to give the corner. The
  // real one measures a wrapper that contains the row's bottom margin, so it discounts half the
  // gutter; here the row is its own wrapper and the margin is outside the box being measured.
  &::before {
    top: -$tree-gutter;
    bottom: 0;
    width: $tree-line;
  }

  &:last-child::before {
    bottom: auto;
    height: calc(50% + #{$tree-gutter} + #{$tree-line * 0.5});
  }

  // Elbow, reaching from the trunk to the row's left edge.
  &::after {
    top: calc(50% - #{$tree-line * 0.5});
    width: $tree-indent;
    height: $tree-line;
  }
}

.option-toggle {
  cursor: pointer;
  user-select: none;
  width: fit-content;
  padding: 4px 0;
}

.option-child {
  margin-left: 30px;
}

.option-toggle.disabled {
  cursor: default;
  opacity: 0.45;
}

.tick {
  position: relative;
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.45);
  border-radius: 3px;
  display: inline-block;
  flex: 0 0 auto;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.tick.on {
  background-color: rgb(var(--v-theme-primary));
  border-color: rgb(var(--v-theme-primary));
}

// Two borders of a rotated box: the short arm and the long arm of a tick.
.tick.on::after {
  content: '';
  position: absolute;
  left: 4px;
  top: 0;
  width: 5px;
  height: 10px;
  border: solid #fff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}
</style>
