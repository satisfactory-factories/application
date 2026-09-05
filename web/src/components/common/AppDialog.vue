<!-- The one dialog shell. Every dialog in the app is a `v-dialog` wrapping a `v-card`, and left to
     Vuetify's defaults each one drifted: titles tucked into the top-left corner with no vertical
     padding, close buttons buried at the bottom of the actions row (or missing), body text at
     whatever size the author happened to pick.

     `OptionsDialog.vue` is the layout we settled on, and this is that layout made reusable: a
     padded, vertically centred title row at `text-h4` with the icon and label together, the way
     out in the top-right corner where a dialog's way out is, a `text-body-2` body, and an actions
     row that puts its buttons on the right without being asked. Adding a dialog means reaching for
     this rather than re-deriving the spacing. -->
<template>
  <v-dialog
    v-model="isOpen"
    :max-width="maxWidth"
    :persistent="persistent"
    :scrollable="scrollable"
  >
    <v-card :class="cardClass">
      <v-card-title
        class="app-dialog-title text-h4 d-flex align-center py-4"
        :class="{ 'title-centred': centreTitle }"
      >
        <slot name="title">
          <!-- Keyed wrapper: FA swaps the <i> for an <svg> and detaches it, so a dialog whose
               icon changes has to replace the element rather than flip its classes. -->
          <span v-if="icon" :key="icon">
            <i :class="icon" />
          </span>
          <span :class="icon ? 'ml-3' : ''">{{ title }}</span>
        </slot>
        <!-- Absent when the title is centred: a spacer and a centred title both want the free
             space, and splitting it between them lands the title a quarter of the way across
             instead of in the middle. Centring takes the close button out of the flow instead. -->
        <v-spacer v-if="!centreTitle" />
        <!-- The way out is the corner of the dialog. Withheld when the dialog is deliberately
             blocking (`persistent` with nothing to dismiss to), because an out that does nothing
             is worse than none. -->
        <v-btn
          v-if="closable"
          :id="closeId"
          class="app-dialog-close"
          density="comfortable"
          icon="fas fa-times"
          :title="closeLabel"
          variant="text"
          @click="isOpen = false"
        />
      </v-card-title>
      <v-divider v-if="divider" />

      <!-- For the controls some dialogs need between the title and the scrolling body: a search
           field, a filter row. Rendered raw so it can own its own padding. -->
      <slot name="header" />

      <v-card-text class="text-body-2" :class="bodyClass" :style="bodyStyle">
        <slot />
      </v-card-text>

      <template v-if="$slots.actions">
        <v-divider />
        <!-- Right by default, which is where a dialog's buttons go. A leading <v-spacer /> is
             no longer needed for that; one is still how a caller pushes something to the left. -->
        <v-card-actions class="px-4 py-3 justify-end">
          <slot name="actions" />
        </v-card-actions>
      </template>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
  import { computed } from 'vue'

  const props = withDefaults(defineProps<{
    // Plain text title. Use the `title` slot instead when the heading needs markup (a game asset,
    // an interpolated factory name alongside an icon component).
    title?: string
    // FontAwesome classes, e.g. `fas fa-wrench`.
    icon?: string
    maxWidth?: string | number
    persistent?: boolean
    scrollable?: boolean
    // Off for the dialogs that demand an answer before they will go away.
    closable?: boolean
    // Only worth setting where a test or a script needs to reach the close button by id.
    closeId?: string
    closeTitle?: string
    // Centres the title across the whole row rather than starting it at the left. For the
    // dialogs whose heading is the announcement itself, not a label on a form.
    centreTitle?: boolean
    // A rule under the title. Wanted when the body is a flush list (`pa-0`), which would
    // otherwise run straight into the heading; unwanted when the body has its own padding.
    divider?: boolean
    // A ceiling on the scrolling body, e.g. `60vh`. Vuetify caps the dialog as a whole; this is
    // for the dialogs that want their list to stop short of that so the actions row stays put.
    bodyMaxHeight?: string
    // Extra classes for the body, on top of the standard `text-body-2` (e.g. `pa-0` for a body
    // that is a flush list).
    bodyClass?: string
    cardClass?: string
  }>(), {
    title: '',
    icon: undefined,
    maxWidth: 600,
    persistent: false,
    scrollable: false,
    closable: true,
    closeId: undefined,
    closeTitle: undefined,
    centreTitle: false,
    divider: false,
    bodyClass: undefined,
    bodyMaxHeight: undefined,
    cardClass: undefined,
  })

  const isOpen = defineModel<boolean>({ required: true })

  const closeLabel = computed(() => props.closeTitle ?? (props.title ? `Close ${props.title}` : 'Close'))

  const bodyStyle = computed(() => (props.bodyMaxHeight ? { maxHeight: props.bodyMaxHeight } : undefined))
</script>

<style lang="scss" scoped>
// `v-card-title` clips with an ellipsis by default, which eats titles that carry a factory or part
// name on a narrow window. Dialog titles are allowed to wrap instead — and at `text-h4` they are
// long enough to need to, so the line height comes down from the display-heading default.
.app-dialog-title {
  white-space: normal;
  line-height: 1.2 !important;
}

// Centred on the dialog, not on the space the close button leaves behind — so the heading lines
// up with the body under it however wide the button is.
.title-centred {
  justify-content: center;
  position: relative;
  text-align: center;

  .app-dialog-close {
    position: absolute;
    right: 1rem;
    top: 50%;
    transform: translateY(-50%);
  }
}
</style>
