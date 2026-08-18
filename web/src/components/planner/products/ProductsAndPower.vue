<template>
  <div>
    <div class="d-flex align-center flex-wrap mb-4 ga-2">
      <h1 class="text-h5" :class="heading.class">
        <i :class="heading.icon" />
        <span class="ml-3">Products &amp; Power Generators</span>
      </h1>
    </div>
    <p v-show="helpText" class="text-body-2 mb-4">
      <i class="fas fa-info-circle" /> Products that are created within the factory. Products are first
      used to fulfil recipes internally, and any surplus is then available for Export.<br>
      e.g. if you add 200 Iron Rods and also 100 Screws, you'd have 100 surplus Rods remaining used as an
      Export (and the Screws as a end product).<br>
      An <v-chip color="green">Internal</v-chip> product is one that is used to produce other products. The surplus of which can also be used as an export.<br>
      A <v-chip class="sf-chip status-note"><i class="fas fa-question-circle mr-1" />No demand</v-chip> product is one nothing asks for: not used internally, not exported. A future update will add support for sinking, so if you are sinking it, ignore this for now.<br>
      A <v-chip class="sf-chip status-warning"><i class="fas fa-exclamation-triangle mr-1" />Potential blockage</v-chip> byproduct has nowhere to go, so it fills the machine's output and stalls the buildings making it. Blend it into a recipe that consumes it, export it, or sink it.
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
  import { FactoryStatus, getSectionStatuses, highestSeverity } from '@/utils/factory-management/status'

  const props = defineProps<{
    factory: Factory;
    helpText: boolean;
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

  const addEmptyProduct = (factory: Factory) => {
    addProductToFactory(factory, {
      id: '',
      amount: 1,
    })
  }

  const addEmptyPowerProducer = (factory: Factory) => {
    addPowerProducerToFactory(factory, {
      recipe: '',
      updated: FactoryPowerChangeType.Power,
    })
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
  }

  provide('updateOrder', updateOrder)
</script>

<style lang="scss" scoped>
  .input-row {
    max-width: 100%;
  }

</style>
