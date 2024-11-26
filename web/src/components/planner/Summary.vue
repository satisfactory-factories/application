<template>
    <v-row>
      <v-col>
        <v-card class="factory-card">
          <v-row class="header">
            <v-col class="text-h4 flex-grow-1" cols="8">
              <i class="fas fa-list" /><span class="ml-3">Factories Summary</span>
            </v-col>
            <v-col class="text-right" cols="4">
              <v-btn
                v-show="!hidden"
                color="primary"
                prepend-icon="fas fa-eye-slash"
                variant="outlined"
                @click="toggleVisibility"
                >Hide
              </v-btn>
              <v-btn
                v-show="hidden"
                color="primary"
                prepend-icon="fas fa-eye"
                variant="outlined"
                @click="toggleVisibility"
                >Show
              </v-btn>
            </v-col>
          </v-row>
          <v-card-text v-show="!hidden" class="text-body-1">
            <p v-show="helpText" class="mb-4">
              <i class="fas fa-info-circle" /> Showing an overview of each factory
              with the name, machines and their production.
            </p>
  
            <v-table>
              <thead>
                <tr>
                  <th class="text-left">Factory Name</th>
                  <th class="text-left">Machines</th>
                  <th class="text-left">Producing</th>
                  <th class="text-left">Importing</th>
                  <th class="text-left">Exporting</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="factory in factories"
                  :class="factoryClass(factory)"
                  class="header"
                >
                  <td class="header">{{ factory.name }}</td>
                  <td class="header">
                    <span
                      v-for="([_, buildingData], buildingIndex) in Object.entries(
                        factory.buildingRequirements
                      )"
                      :key="buildingIndex"
                      style="display: inline"
                    >
                      <v-chip class="sf-chip orange" variant="tonal">
                        <game-asset
                          :subject="buildingData.name"
                          type="building"
                        />
                        <span class="ml-1">
                          <b>{{
                            getBuildingDisplayName(buildingData.name) ?? "UNKNOWN"
                          }}</b
                          >: {{ formatNumber(buildingData.amount) ?? 0 }}x
                        </span>
                      </v-chip>
                    </span>
                  </td>
                  <td class="header">
                    <v-chip
                      v-for="part in factory.products"
                      :key="`${factory.id}-${part.id}`"
                      class="sf-chip"
                    >
                      <span class="mr-2">
                        <game-asset
                          v-if="part.id"
                          :subject="part.id"
                          type="item"
                        />
                      </span>
                      <span>
                        <b>{{ getPartDisplayName(part.id) }}</b
                        >: {{ formatNumber(part.amount) }}/min
                      </span>
                      <span
                        v-if="
                          hasMetricsForPart(factory, part.id) &&
                          factory.dependencies.metrics[part.id].difference !== 0
                        "
                        class="ml-2"
                        :class="
                          differenceClass(
                            factory.dependencies.metrics[part.id].difference
                          )
                        "
                        >({{
                          formatNumber(
                            factory.dependencies.metrics[part.id].difference
                          )
                        }}/min)</span
                      >
                    </v-chip>
                  </td>
                  <td class="header">
                    <v-chip
                      v-for="(
                        totalAmount, outputPart
                      ) in calculateTotalDependencies(factory.inputs)"
                      :key="`${factory.id}-${outputPart}`"
                      class="sf-chip ml-2"
                    >
                      <game-asset
                        v-if="outputPart"
                        height="32"
                        :subject="outputPart"
                        type="item"
                        width="32"
                      />
                      <span class="ml-2">
                        <b>{{ getPartDisplayName(outputPart) }}:</b>
                        {{ formatNumber(totalAmount) }}/min
                      </span>
                    </v-chip>
                  </td>
                  <td class="header">
                    <v-chip
                      v-for="(
                        totalAmount, part
                      ) in calculateTotalDependencyRequests(
                        factory.dependencies.requests
                      )"
                      :key="part"
                      class="sf-chip ml-2"
                    >
                      <game-asset
                        v-if="part"
                        height="32"
                        :subject="part"
                        type="item"
                        width="32"
                      />
                      <span class="ml-2">
                        <b>{{ getPartDisplayName(part) }}:</b>
                        {{ formatNumber(totalAmount) }}/min
                      </span>
                    </v-chip>
                  </td>
                </tr>
              </tbody>
            </v-table>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </template>
  
  <script setup lang="ts">
  import { ref, watch } from "vue";
  import {
    Factory,
    FactoryInput,
    FactoryDependencyRequest,
  } from "@/interfaces/planner/FactoryInterface";
  import {
    getPartDisplayName,
    hasMetricsForPart,
    differenceClass,
  } from "@/utils/helpers";
  import { formatNumber } from "@/utils/numberFormatter";
  defineProps<{
    factories: Factory[];
    helpText: boolean;
  }>();
  
  // Initialize the 'hidden' ref based on the value in localStorage
  const hidden = ref<boolean>(localStorage.getItem("summaryHidden") === "true");
  
  watch(hidden, (newValue) => {
    localStorage.setItem("summaryHidden", newValue.toString());
  });
  
  const toggleVisibility = () => {
    hidden.value = !hidden.value;
  };
  
  const getBuildingDisplayName = inject("getBuildingDisplayName") as (
    part: string
  ) => string;
  
  const factoryClass = (factory: Factory) => {
    return {
      "factory-card": true,
      problem: factory.hasProblem,
    };
  };
  
  // This function finds out which items are being imported into the factory and their quantity
  const calculateTotalDependencies = (inputs: FactoryInput[]) => {
    const totals: Record<string, number> = {};
  
    inputs.forEach((input) => {
      const { outputPart, amount } = input;
      if (outputPart) {
        if (!totals[outputPart]) {
          totals[outputPart] = 0;
        }
        totals[outputPart] += amount;
      }
    });
  
    return totals;
  };
  
  // This function finds out which items are being exported from the factory and their quantity
  const calculateTotalDependencyRequests = (
    requests: Record<string, FactoryDependencyRequest[]>
  ) => {
    const totals: Record<string, number> = {};
  
    Object.values(requests).forEach((dependencyRequests) => {
      dependencyRequests.forEach((request) => {
        const { part, amount } = request;
  
        if (part) {
          if (!totals[part]) {
            totals[part] = 0;
          }
          totals[part] += amount;
        }
      });
    });
  
    return totals;
  };
  </script>
  