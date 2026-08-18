<!-- A group product's icon with a badge in its corner saying what the group does with the part:
     ships it out, uses it up on site, or just makes it.

     Shared by the sidebar's product row and the Options dialog's preview of that row, so the two
     cannot disagree about what a badge means or where it sits. `kind` undefined draws the icon
     alone, which is how the option that turns the badges off is honoured. -->
<template>
  <span class="group-product-icon">
    <game-asset
      :height="size"
      :note="kind ? groupProductKinds[kind].label : undefined"
      :subject="partId"
      :tooltip="tooltip"
      type="item"
      :width="size"
    />
    <!-- The circle is the span and the glyph is the <i> inside it, which is not a style choice.
         Font Awesome replaces the <i> with an <svg> of its own and lets it overflow, so a badge
         drawn on the <i> itself had its fill and border painted behind a glyph spilling past them.

         THE KEY IS ON THE SPAN, NOT THE <i>. Font Awesome removes the <i> from the DOM, so Vue's
         vnode for it points at a detached node. Patching that node reads `el.__vnode` and throws
         `el is null`, which is what a plan load did: a tile keyed by part id gets a different part
         with a different kind, and the class patch lands on a node that is no longer there. Keying
         the span means Vue replaces the wrapper it still owns and never patches the <i> at all. -->
    <span v-if="kind" :key="kind" class="kind-badge">
      <i :class="groupProductKinds[kind].icon" />
    </span>
  </span>
</template>

<script setup lang="ts">
  import { GroupProductKind, groupProductKinds } from '@/utils/factory-management/group-products'

  withDefaults(defineProps<{
    partId: string
    tooltip: string
    kind?: GroupProductKind
    size?: number
  }>(), {
    kind: undefined,
    size: 36,
  })
</script>

<style lang="scss" scoped>
.group-product-icon {
  position: relative;
  display: inline-flex;

  // The two knobs for the badge: the circle, and the glyph inside it. Separating them is what
  // makes "bigger mark" and "more room around the mark" independent adjustments.
  --badge-size: 21px;
  --badge-glyph: 14px;
}

// Inside the icon's lower right corner rather than hanging off it. Off the corner, the badge sat
// on the net figure below the tile and on the neighbouring tile's art; the sidebar row is too
// tight to spend space on a badge that overlaps its neighbours.
.kind-badge {
  position: absolute;
  right: -2px;
  bottom: 0;
  // A fixed circle with the glyph centred in it: padding around a glyph made an oval, because the
  // three glyphs are different widths.
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--badge-size);
  height: var(--badge-size);
  line-height: 1;
  border-radius: 50%;
  color: #ffffff;
  // Opaque, not an alpha: these sit over item art of every colour, and a translucent badge took
  // its contrast from whatever pixel happened to be behind it.
  background-color: #1e1e1e;
  border: 1px solid #6c6c6c;
  pointer-events: none;

  // Font Awesome's replacement svg carries its own width in em and `overflow: visible`, so the
  // glyph has to be pinned to the circle or it spills out of it. `:deep` because that svg is
  // created at runtime, so a scoped selector cannot count on reaching it by itself.
  :deep(i),
  :deep(svg) {
    font-size: var(--badge-glyph);
    width: var(--badge-glyph) !important;
    height: var(--badge-glyph);
    overflow: hidden;
  }
}
</style>
