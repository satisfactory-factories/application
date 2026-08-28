<template>
  <div>
    <div class="d-flex align-center flex-wrap mb-4 ga-2">
      <h1 class="text-h5" :class="{ 'text-red': sectionStatuses.length > 0 }">
        <i :class="sectionStatuses.length ? 'fas fa-times' : 'fas fa-conveyor-belt-alt'" />
        <span class="ml-3">Products &amp; Power Generators</span>
      </h1>
      <factory-status-chips detailed size="small" :statuses="sectionStatuses" />
    </div>
    <p v-show="helpText" class="text-body-2 mb-4">
      <i class="fas fa-info-circle" /> Products that are created within the factory. Products are first
      used to fulfil recipes internally, and any surplus is then available for Export.<br>
      e.g. if you add 200 Iron Rods and also 100 Screws, you'd have 100 surplus Rods remaining used as an
      Export (and the Screws as a end product).<br>
      An <v-chip color="green">Internal</v-chip> product is one that is used to produce other products. The surplus of which can also be used as an export.<br>
      An <v-chip color="red">No demand</v-chip> product means the product is not used internally nor exported. It is suggested you delete this.
    </p>
    <product :factory="factory" :help-text="helpText" />
    <v-btn
      color="primary mr-2 mt-n1"
      prepend-icon="fas fa-cube"
      ripple
      variant="flat"
      @click="addEmptyProduct(factory)"
    >
      Add Product
    </v-btn>
    <power-producer :factory="factory" :help-text="helpText" />
    <v-btn
      color="yellow-darken-3 mr-2 mt-n1"
      prepend-icon="fas fa-bolt"
      ripple
      variant="flat"
      @click="addEmptyPowerProducer(factory)"
    >
      Add Power Generator
    </v-btn>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { Factory, FactoryPowerChangeType } from '@/interfaces/planner/FactoryInterface'
  import { addProductToFactory } from '@/utils/factory-management/products'
  import { addPowerProducerToFactory } from '@/utils/factory-management/power'
  import FactoryStatusChips from '@/components/planner/FactoryStatusChips.vue'
  import { FactoryStatus, getSectionStatuses } from '@/utils/factory-management/status'
  import { markFactoryEdited } from '@/utils/sync-intent'

  const props = defineProps<{
    factory: Factory;
    helpText: boolean;
    statuses?: FactoryStatus[];
  }>()

  // Only buildingGroupMismatch anchors here, and it is always a problem — hence no severity switch.
  const sectionStatuses = computed(() => getSectionStatuses(props.statuses ?? [], 'products'))

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
