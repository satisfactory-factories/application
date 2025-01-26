<template>
  <v-overlay
    class="d-flex justify-center align-center"
    data-testid="loading-overlay"
    :model-value="true"
    opacity="1"
    persistent
  >
    <v-card class="pa-4 px-16" width="80vw" height="80vh">
      <div class="text-center overflow-auto w-100 h-100">
        <p v-if="!buildings.length" style="position: absolute;top: 50%;left: 50%;transform: translate(-50%, -50%);">No buildings found!</p>
        
        <div v-if="buildings.length" v-for="building in buildings" class="machine sub-card border">
          <div style="display: flex;gap: 50px;" class="flex-row align-center">
            <div>
              <game-asset :subject="building.name" type="building" height="120" width="120" />
              <!-- <p>{{ building.name }}</p> -->
            </div>
            <v-icon icon="fas fa-arrow-right" />
            <div style="display: flex;flex-direction: column;gap: 8px;">
              <div v-for="product in building.products">
                <game-asset :subject="product" type="item" height="50" width="50" />
                <!-- <p>{{ product }}</p> -->
              </div>
            </div>
          </div>
          
          <div style="display: flex;gap: 50px;" class="flex-row align-center">
            <div class="column">
              <game-asset subject="somersloop-trinket" type="item_id" height="50" width="50" />
              <p style="opacity: 0.8;font-weight: bold;">{{ building.slots.somersloops }}</p>
            </div>
            <div class="column">
              <game-asset subject="power-shard" type="item_id" height="50" width="50" />
              <p style="opacity: 0.8;font-weight: bold;">{{ building.slots.powershards }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- the icon does not seem to load properly -->
      <v-btn title="Close" icon="fas fa-xmark" size="small" class="close" @click="close" />
    </v-card>
  </v-overlay>
</template>

<script setup lang="ts">
  import eventBus from '@/utils/eventBus'
  import { ref } from 'vue'

  const buildings = ref<any[]>([])
  
  eventBus.on('worldData', (data: { buildings: any[] }) => {
    buildings.value = data.buildings.map(getRecipeAssets)
  })

  function getRecipeAssets(building: any) {
    const gameData: any = JSON.parse(localStorage.getItem('gameData') || "{}")
    if (!gameData) return building

    const recipeId: string = building.product
    const products = gameData.recipes.find((a: any) => a.id === recipeId)?.products || []

    building.products = products.map(({ part }: any) => part)
    return building
  }

  function close() {
    eventBus.emit("worldDataShow", false)
  }
</script>

<style>
  .close {
    position: absolute;
    top: 10px;
    right: 10px;

    border-radius: 5px;
  }

  .machine {
    padding: 8px;

    display: flex;
    align-items: center;
    justify-content: space-around;
  }

  .column {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
</style>