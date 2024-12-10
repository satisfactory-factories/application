<template>
  <div class="node">
    <v-card>
      <v-card-title class="border-b-md">
        <h1 class="text-h5">
          <i class="fas fa-industry" /><span class="ml-2">{{ data.factory.name }}</span>
        </h1>
      </v-card-title>
      <v-card-text class="py-0">
        <v-row v-if="Object.keys(data.factory.inputs).length > 0" class="my-0 border-b-md">
          <v-col>
            <p class="text-body-1">
              Importing:
            </p>
            <div
              v-for="input in data.factory.inputs"
              :key="`${input.factoryId}-${input.outputPart}`"
              class="position-relative"
            >
              <Handle
                :id="`${data.factory.id}-${input.outputPart}`"
                class="handle handle-target"
                :position="props.targetPosition"
                type="target"
              />
              <v-chip class="sf-chip">
                <game-asset :subject="input.outputPart ?? 'unknown'" type="item" />
                <span class="ml-2">{{ getPartDisplayName(input.outputPart) }}: {{ formatNumber(input.amount) }}/min</span>
              </v-chip>
            </div>
          </v-col>
        </v-row>
        <v-row v-if="Object.keys(data.factory.products).length > 0" class="my-0 border-b-md">
          <v-col>
            <p class="text-body-1">
              Producing:
            </p>
            <div
              v-for="product in data.factory.products"
              :key="`${data.factory.id}-${product.id}`"
              class="position-relative"
            >
              <v-chip class="sf-chip">
                <game-asset :subject="product.id" type="item" />
                <span class="ml-2">{{ getPartDisplayName(product.id) }}: {{ formatNumber(product.amount) }}/min</span>
              </v-chip>
            </div>
          </v-col>
        </v-row>
        <v-row v-if="Object.keys(data.factory.products).length > 0" class="my-0">
          <v-col>
            <p class="text-body-1">
              Exporting:
            </p>
            <!-- Requires reconstruction, out of scope of PR -->
            <!--            <div-->
            <!--              v-for="(product, part) in data.factory.exports"-->
            <!--              :key="`${data.factory.id}-${part}`"-->
            <!--              class="position-relative"-->
            <!--            >-->
            <!--              <v-chip class="sf-chip">-->
            <!--                <game-asset :subject="part.toString() ?? 'unknown'" type="item" />-->
            <!--                <span class="ml-2">{{ getPartDisplayName(part) }}: {{ formatNumber(product.surplus) }}/min</span>-->
            <!--              </v-chip>-->
            <!--              <Handle-->
            <!--                :id="`${data.factory.id}-${part}`"-->
            <!--                class="handle handle-source"-->
            <!--                :position="props.sourcePosition"-->
            <!--                type="source"-->
            <!--              />-->
            <!--            </div>-->
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup lang="ts">
  import type { NodeProps } from '@vue-flow/core'
  import { Handle } from '@vue-flow/core'
  import { CustomData } from '@/utils/graphUtils'
  import { getPartDisplayName } from '@/utils/helpers'
  import { formatNumber } from '@/utils/numberFormatter'

  // props were passed from the slot using `v-bind="customNodeProps"`
  const props = defineProps<NodeProps<CustomData>>()

  const emit = defineEmits(['nodeRendered'])

  onMounted(() => {
    emit('nodeRendered')
  })

</script>
<style lang="scss" scoped>
.node {
  position: relative;
  max-width: 300px;
  min-width: 300px;
  background: dimgray;
  color: white;
  border: 1px solid #ccc;
  border-radius: 4px;
  box-shadow: 0 0 0 1px dimgray;
}

.handle {
  width: 6px;
  height: 18px;
  border-radius: 2px;
}

.handle-source {
  background-color: green;
  right: -15px;
}

.handle-target {
  background-color: red;
  left: -15px;
}

</style>
