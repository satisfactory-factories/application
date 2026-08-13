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
            <div class="group-preview">
              <div class="preview-header">
                <div class="d-flex align-center ga-2 px-2 py-1">
                  <i class="fas fa-chevron-down text-medium-emphasis" />
                  <span class="preview-swatch" />
                  <span class="font-weight-medium">Copper</span>
                  <v-spacer />
                  <v-chip class="sf-chip x-small no-margin factory" variant="tonal">
                    <i class="fas fa-industry" /><span class="ml-1">3</span>
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
                    <game-asset height="30" :subject="product.id" type="item" width="30" />
                    <!-- Exactly balanced is grey in the real row, being neither good nor bad. -->
                    <span class="preview-net" :class="previewNetClass(product.net)">
                      {{ product.net }}
                    </span>
                  </span>
                </div>
              </div>
              <div class="preview-body">
                <div v-for="name in ['Copper Mine', 'Copper Ingots']" :key="name" class="preview-row">
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
                text="What each group generates, what it consumes and whether it pays for itself — the same figures the Statistics link above them wears."
                @click.stop
              />
            </div>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>
  </v-dialog>

  <raw-resources-wizard v-model="showWizard" />
</template>

<script setup lang="ts">
  import RawResourcesWizard from '@/components/planner/RawResourcesWizard.vue'
  import eventBus from '@/utils/eventBus'
  import { usePlannerOptions } from '@/composables/usePlannerOptions'

  const showOptions = ref(false)
  const showWizard = ref(false)
  const options = usePlannerOptions()

  // The preview's product row. Copper Ingot is the internal one — made and consumed inside the
  // group — so ticking "internal products" makes a tile appear rather than only changing a number.
  const previewProducts = computed(() => {
    const delivered = [
      { id: 'CopperSheet', net: 40 },
      { id: 'Wire', net: -20 },
    ]
    return options.value.showInternalGroupProducts
      ? [{ id: 'CopperIngot', net: 0 }, ...delivered]
      : delivered
  })

  const previewNetClass = (net: number) => {
    if (net > 0) return 'text-success'
    return net < 0 ? 'text-error' : 'text-medium-emphasis'
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
// A stand-in for a sidebar group, at the sidebar's own scale, so each setting can be seen rather
// than described. Colours come from the group tokens the real thing uses.
.group-preview {
  border-radius: 4px;
  overflow: hidden;
  font-size: 0.9rem;
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.preview-header {
  background-color: rgba(184, 115, 51, 0.18);
  border-left: 3px solid #b87333;
}

.preview-swatch {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background-color: #b87333;
  flex: 0 0 auto;
}

.preview-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.preview-net {
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1;
}

.preview-body {
  padding: 4px 0 4px 16px;
}

.preview-row {
  display: flex;
  align-items: center;
  background-color: rgba(255, 255, 255, 0.04);
  border-radius: 4px;
  margin: 0 4px 4px 0;
  padding: 6px 8px;
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
