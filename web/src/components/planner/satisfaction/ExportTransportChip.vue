<!-- How an export travels, as a chip inside its factory chip. Green while its method keeps up, red
     when its trains fall short, amber when nobody has said (a question mark) or the planner is
     only guessing from an old calculator time. -->
<template>
  <span class="transport-divider" />
  <span
    class="transport-chip"
    :class="`transport-${transport.state}`"
    :title="title"
  >
    <span :key="icon" class="transport-icon">
      <i :class="icon" />
    </span>
    <span class="ml-1">{{ label }}</span>
  </span>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { ExportTransportMethod, Factory } from '@/interfaces/planner/FactoryInterface'
  import { exportTransport } from '@/utils/factory-management/train-logistics'
  import { useGameDataStore } from '@/stores/game-data-store'
  import { formatNumber } from '@/utils/numberFormatter'

  const props = defineProps<{
    producer: Factory
    part: string
    consumer: Factory | undefined
  }>()

  const gameData = useGameDataStore().getGameData()

  const METHOD_ICONS: Record<ExportTransportMethod, string> = {
    belt: 'fas fa-grip-lines',
    train: 'fas fa-train',
    drone: 'fas fa-helicopter',
    truck: 'fas fa-truck',
    tractor: 'fas fa-tractor',
  }

  const transport = computed(() => exportTransport(props.producer, props.part, props.consumer, gameData))

  const isFluid = computed(() => gameData.items.parts[props.part]?.isFluid ?? false)

  const methodName = (method: ExportTransportMethod) => {
    if (method === 'belt') return isFluid.value ? 'Pipe' : 'Belt'
    return method.charAt(0).toUpperCase() + method.slice(1)
  }

  const icon = computed(() => transport.value.method ? METHOD_ICONS[transport.value.method] : 'fas fa-question')

  const label = computed(() => {
    const { method, state, shortBy } = transport.value
    if (!method) return 'Transport not set'
    if (state === 'guessed') return `${methodName(method)}?`
    if (state === 'pending') return `${methodName(method)}, no trains yet`
    if (state === 'short' && shortBy > 0.5) return `${methodName(method)}, short ${formatNumber(shortBy, 0)}/min`
    if (state === 'short') return `${methodName(method)}, platform overloaded`
    return methodName(method)
  })

  const title = computed(() => {
    switch (transport.value.state) {
      case 'unset': return 'Choose how this export travels in the export manager'
      case 'guessed': return 'Guessed from a time entered in the old calculator. Choose a method to confirm it.'
      case 'pending': return 'Add a station and a train for this export in the export manager'
      case 'short': return 'Its trains cannot deliver the full amount. Open the export manager to see where.'
      default: return 'How this export travels'
    }
  })
</script>

<style lang="scss" scoped>
.transport-divider {
  align-self: stretch;
  border-left: 1px solid rgba(255, 255, 255, 0.3);
  margin: 2px 8px;
}

.transport-chip {
  align-items: center;
  border: 1px solid transparent;
  border-radius: 9999px;
  display: inline-flex;
  flex-shrink: 0;
  font-size: 12px;
  line-height: 18px;
  padding: 0 8px;
  white-space: nowrap;
}

.transport-icon {
  display: inline-flex;
  font-size: 11px;
}

.transport-ok {
  border-color: var(--sf-success-border);
  background-color: color-mix(in srgb, var(--sf-success-border) 25%, transparent);
}

.transport-short {
  border-color: var(--sf-error-border);
  background-color: color-mix(in srgb, var(--sf-error-border) 25%, transparent);
}

.transport-unset,
.transport-pending,
.transport-guessed {
  border-color: var(--sf-status-warning-border);
  background-color: color-mix(in srgb, var(--sf-status-warning-border) 25%, transparent);
}

.transport-guessed {
  border-style: dashed;
}
</style>
