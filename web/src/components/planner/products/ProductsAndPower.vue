<template>
  <div>
    <div class="d-flex align-center flex-wrap mb-4 ga-2">
      <h1 class="text-h5" :class="heading.class">
        <i :class="heading.icon" />
        <span class="ml-3">Products, Power &amp; Buildings</span>
      </h1>
    </div>
    <product :factory="factory" />
    <v-btn
      color="primary mr-2 mt-n1"
      prepend-icon="fas fa-cube"
      ripple
      variant="flat"
      @click="addEmptyProduct(factory)"
    >
      Add Product
    </v-btn>
    <power-producer :factory="factory" />
    <v-btn
      class="mr-2 mt-n1"
      :color="sfColors.powerGeneration.color"
      prepend-icon="fas fa-bolt"
      ripple
      variant="flat"
      @click="addEmptyPowerProducer(factory)"
    >
      Add Power Generator
    </v-btn>
    <custom-building :factory="factory" />
    <v-btn
      class="mr-2 mt-n1"
      :color="sfColors.building.color"
      prepend-icon="fas fa-building"
      ripple
      variant="flat"
      @click="addEmptyCustomBuilding(factory)"
    >
      Add Custom Building
    </v-btn>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { Factory, FactoryPowerChangeType } from '@/interfaces/planner/FactoryInterface'
  import { addProductToFactory } from '@/utils/factory-management/products'
  import { sfColors } from '@/utils/colors'
  import { addPowerProducerToFactory } from '@/utils/factory-management/power'
  import { addCustomBuildingToFactory } from '@/utils/factory-management/custom-buildings'
  import { FactoryStatus, getSectionStatuses, highestSeverity } from '@/utils/factory-management/status'
  import { markFactoryEdited } from '@/utils/sync-intent'

  const props = defineProps<{
    factory: Factory;
    statuses?: FactoryStatus[];
  }>()

  const sectionStatuses = computed(() => getSectionStatuses(props.statuses ?? [], 'products'))

  // Note-tier statuses (noDemand) deliberately fall through to the plain heading: the chip beside
  // it says what is worth saying, and reddening the section would undo the point of the tier.
  const heading = computed(() => {
    switch (highestSeverity(sectionStatuses.value)) {
      case 'problem': return { icon: 'fas fa-times', class: 'text-red' }
      case 'warning': return { icon: 'fas fa-exclamation-triangle', class: 'text-status-warning' }
      default: return { icon: 'fas fa-conveyor-belt-alt', class: '' }
    }
  })

  // A blank row is already part of the stored record, and no calculation runs to announce it,
  // so a rebase would take the server's list back and drop the row the user just asked for.
  const addEmptyProduct = (factory: Factory) => {
    addProductToFactory(factory, {
      id: '',
      amount: 1,
    })
    markFactoryEdited(factory)
  }

  const addEmptyPowerProducer = (factory: Factory) => {
    addPowerProducerToFactory(factory, {
      recipe: '',
      updated: FactoryPowerChangeType.Power,
    })
    markFactoryEdited(factory)
  }

  const addEmptyCustomBuilding = (factory: Factory) => {
    addCustomBuildingToFactory(factory)
    markFactoryEdited(factory)
  }

  const updateOrder = (list: any[], direction: 'up' | 'down', item: any) => {
    const index = list.findIndex(p => p.displayOrder === item.displayOrder)
    const newIndex = direction === 'up' ? index - 1 : index + 1

    if (newIndex < 0 || newIndex >= list.length) {
      return
    }

    const otherItem = list.find(p => p.displayOrder === newIndex)
    if (!otherItem) {
      return
    }

    const tempOrder = item.displayOrder
    item.displayOrder = otherItem.displayOrder
    otherItem.displayOrder = tempOrder

    list.sort((a, b) => a.displayOrder - b.displayOrder)
    markFactoryEdited(props.factory)
  }

  provide('updateOrder', updateOrder)
</script>

<style lang="scss" scoped>
  .input-row {
    max-width: 100%;
  }

</style>
