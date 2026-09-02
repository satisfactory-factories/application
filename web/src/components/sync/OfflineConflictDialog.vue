<template>
  <app-dialog
    v-model="open"
    card-class="border-md"
    :closable="false"
    data-testid="offline-conflict-dialog"
    icon="fas fa-exclamation-triangle"
    max-width="820"
    persistent
    scrollable
    title="Your offline changes clash with newer ones"
  >
    <p class="mb-4 text-body-1" data-testid="conflict-blurb">{{ blurb }}</p>

    <div class="d-flex align-center ga-2 mb-3">
      <v-btn data-testid="all-mine" size="small" variant="text" @click="setAll('mine')">
        Use mine for all
      </v-btn>
      <v-btn data-testid="all-live" size="small" variant="text" @click="setAll('live')">
        Keep live for all
      </v-btn>
    </div>

    <div
      v-for="row in factories"
      :key="row.factoryId"
      class="conflict-section border-md rounded pa-3 mb-3"
      :data-factory-id="row.factoryId"
      data-testid="conflict-factory"
    >
      <div class="d-flex align-center flex-wrap ga-3 mb-2">
        <span class="text-subtitle-1 font-weight-bold" data-testid="conflict-name">{{ row.name }}</span>
        <v-spacer />
        <v-btn-toggle
          color="primary"
          density="compact"
          mandatory
          :model-value="winnerOf(row.factoryId)"
          variant="outlined"
          @update:model-value="value => setWinner(row.factoryId, value)"
        >
          <v-btn :data-factory-id="row.factoryId" data-testid="winner-live" size="small" value="live">
            Live plan
          </v-btn>
          <v-btn :data-factory-id="row.factoryId" data-testid="winner-mine" size="small" value="mine">
            My version
          </v-btn>
        </v-btn-toggle>
      </div>

      <p v-if="row.liveDeleted" class="mb-2 text-warning" data-testid="conflict-live-deleted">
        live: deleted in the live plan
      </p>
      <p v-if="row.mineDeleted" class="mb-2 text-warning" data-testid="conflict-mine-deleted">
        mine: removed on this device
      </p>

      <div
        v-for="product in row.products"
        :key="product.itemId"
        class="evidence-row d-flex flex-wrap align-center ga-2"
        data-testid="conflict-product"
      >
        <span class="evidence-item">{{ itemName(product.itemId) }}</span>
        <span v-if="!row.liveDeleted" data-testid="evidence-live">live: {{ liveText(product) }}</span>
        <span v-if="!row.mineDeleted" data-testid="evidence-mine">mine: {{ mineText(product) }}</span>
        <span v-if="product.recipeChanged" class="text-warning" data-testid="evidence-recipe">
          recipe changed
        </span>
      </div>

      <p v-if="row.otherChanges" class="mb-0 mt-2 text-grey" data-testid="conflict-other">
        other changes in this factory as well
      </p>
    </div>

    <v-checkbox
      class="sf-checkbox-tick"
      color="primary"
      data-testid="kept-copy"
      density="compact"
      hide-details
      label="Keep this device's version as a local tab, whatever I pick"
      :model-value="keepCopy"
      @update:model-value="setKeepCopy"
    />

    <template #actions>
      <v-btn color="primary" data-testid="apply-choices" variant="flat" @click="apply">
        Apply choices
      </v-btn>
    </template>
  </app-dialog>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { storeToRefs } from 'pinia'
  import type { ConflictProductRow } from '@/sync/offline-conflict'
  import type { ConflictWinner } from '@/stores/room-sync-store'
  import { useRoomSyncStore } from '@/stores/room-sync-store'
  import { getPartDisplayName } from '@/utils/helpers'
  import { formatNumber } from '@/utils/numberFormatter'

  const roomSync = useRoomSyncStore()
  const { conflicts } = storeToRefs(roomSync)

  // One room at a time. A second room's clash waits its turn rather than stacking a
  // second dialog on this one.
  const active = computed(() => Object.values(conflicts.value)[0] ?? null)
  const factories = computed(() => active.value?.factories ?? [])

  const winners = ref<Record<number, ConflictWinner>>({})
  const keepCopy = ref(true)
  let winnersRoom: string | null = null

  // Mine by default: it is what the planner has always done with an offline edit, and it
  // is the choice that loses nothing until the user says otherwise. A row that survives a
  // newer snapshot keeps whatever was picked for it; a fresh question starts over, box
  // included, since keeping a copy is the answer that can destroy nothing.
  watch([active, factories], () => {
    if (active.value?.roomId !== winnersRoom) {
      winnersRoom = active.value?.roomId ?? null
      winners.value = {}
      keepCopy.value = true
    }
    const next: Record<number, ConflictWinner> = {}
    for (const row of factories.value) next[row.factoryId] = winners.value[row.factoryId] ?? 'mine'
    winners.value = next
  }, { immediate: true })

  const open = computed({
    get: () => factories.value.length > 0,
    // Answer-only: nothing dismisses this dialog but the button.
    set: () => {},
  })

  const blurb = computed(() => {
    const count = factories.value.length
    const opening = count === 1
      ? '1 factory you edited here was also changed by others'
      : `${count} factories you edited here were also changed by others`
    const pick = count === 1 ? 'Pick which version wins.' : 'Pick which version wins for each.'
    return `While this device was offline, ${opening}. ${pick} Everything else syncs safely either way.`
  })

  const itemName = (itemId: string) => getPartDisplayName(itemId)

  const rate = (amount: number) => `${formatNumber(amount)}/min`

  const liveText = (product: ConflictProductRow) =>
    product.live === null ? 'none' : rate(product.live)

  const mineText = (product: ConflictProductRow) =>
    product.mine === null ? 'removed' : rate(product.mine)

  const setKeepCopy = (value: unknown) => {
    keepCopy.value = value === true
  }

  const winnerOf = (factoryId: number) => winners.value[factoryId] ?? 'mine'

  const setWinner = (factoryId: number, winner: unknown) => {
    if (winner !== 'mine' && winner !== 'live') return
    winners.value = { ...winners.value, [factoryId]: winner }
  }

  const setAll = (winner: ConflictWinner) => {
    winners.value = Object.fromEntries(factories.value.map(row => [row.factoryId, winner]))
  }

  const apply = () => {
    const room = active.value
    if (!room) return

    roomSync.resolveConflict(room.roomId, {
      liveWinners: factories.value
        .filter(row => winnerOf(row.factoryId) === 'live')
        .map(row => row.factoryId),
      keepCopy: keepCopy.value,
    })
  }
</script>

<style lang="scss" scoped>
// The two versions read as columns rather than a sentence, so a row can be scanned.
.evidence-row {
  padding: 2px 0;

  span {
    min-width: 140px;
  }
}

.evidence-item {
  font-weight: 600;
}
</style>
