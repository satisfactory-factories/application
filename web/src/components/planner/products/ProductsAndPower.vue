<template>
  <div>
    <h1 class="text-h6 text-md-h5 mb-4">
      <i class="fas fa-conveyor-belt-alt" />
      <span class="ml-3">Products &amp; Power Generators</span>
    </h1>
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
  import { Factory } from '@/interfaces/planner/FactoryInterface'
  import { addProductToFactory } from '@/utils/factory-management/products'

  defineProps<{
    factory: Factory;
    helpText: boolean;
  }>()

  const addEmptyProduct = (factory: Factory) => {
    addProductToFactory(factory, {
      id: '',
      amount: 1,
    })
  }

  const addEmptyPowerProducer = (factory: Factory) => {
    factory.powerProducers.push({
      building: '',
      buildingAmount: 0,
      buildingCount: 0,
      ingredientAmount: 0,
      ingredients: [],
      powerAmount: 0,
      powerProduced: 0,
      recipe: '',
      byproduct: null,
      displayOrder: factory.powerProducers.length,
      updated: 'power',
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
