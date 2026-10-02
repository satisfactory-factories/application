<!-- What the pane shows while a factory is being built behind it: the outline of a factory card in
     shimmering blocks, so the switch reads as loading rather than as a blank screen.

     The shimmer is a band sliding across each block on `transform`, which the browser animates
     off the main thread. The older placeholders animate `background-position`, which freezes for
     exactly as long as the factory behind them takes to mount — the one moment this is shown. -->
<template>
  <div class="page-skeleton" data-testid="planner-page-skeleton">
    <div class="block pager" />
    <div class="card">
      <div class="card-header">
        <div class="block icon" />
        <div class="header-text">
          <div class="block title" />
          <div class="chips">
            <div class="block chip" />
            <div class="block chip" />
            <div class="block chip" />
          </div>
        </div>
        <div class="buttons">
          <div class="block button" />
          <div class="block button square" />
          <div class="block button square" />
        </div>
      </div>
      <div class="section">
        <div class="block heading" />
        <div v-for="row in 3" :key="row" class="block product-row" />
      </div>
      <div class="section">
        <div class="block heading" />
        <div class="block product-row short" />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.page-skeleton {
  padding: 12px;
}

.block {
  position: relative;
  overflow: hidden;
  background: #3a3a3a;
  border-radius: 4px;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.08), transparent);
    transform: translateX(-100%);
    animation: skeleton-shimmer 1.4s infinite ease-in-out;
    will-change: transform;
  }
}

.pager {
  height: 72px;
  margin-bottom: 16px;
  border: 2px dashed #555;
  background: #2a2a2a;
}

.card {
  border: 2px solid #4a4a4a;
  border-radius: 4px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  border-bottom: 1px solid #4a4a4a;
}

.icon {
  width: 48px;
  height: 48px;
}

.header-text {
  flex: 1;
  min-width: 0;
}

.title {
  height: 36px;
  width: min(360px, 70%);
}

.chips {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.chip {
  height: 28px;
  width: 110px;
  border-radius: 14px;
}

.buttons {
  display: flex;
  gap: 8px;
}

.button {
  height: 36px;
  width: 120px;

  &.square {
    width: 36px;
  }
}

.section {
  padding: 16px;
  border-bottom: 1px solid #4a4a4a;

  &:last-child {
    border-bottom: none;
  }
}

.heading {
  height: 28px;
  width: 260px;
  margin-bottom: 14px;
}

.product-row {
  height: 96px;
  margin-bottom: 10px;

  &.short {
    height: 56px;
  }
}

@media (max-width: 600px) {
  .buttons {
    display: none;
  }
}

@keyframes skeleton-shimmer {
  100% {
    transform: translateX(100%);
  }
}
</style>
