<template>
  <v-card class="factory-card sub-card">
    <v-card-title>Todos</v-card-title>
    <v-card-text>
      <v-text-field
        v-model="newTask"
        dense
        hide-details
        label="New Task"
        outlined
        placeholder="Add a task..."
        @keyup.enter="addTask"
      />
      <v-table v-if="factory.tasks.length > 0" class="sub-card" :class="{ 'mt-2': factory.tasks.length > 0 }" density="compact">
        <tbody>
          <tr v-for="(task, index) in factory.tasks" :key="index">
            <td>
              <v-textarea
                v-if="!task.completed"
                v-model="task.title"
                auto-grow
                density="compact"
                hide-details
                rows="1"
                variant="plain"
              />
              <span v-if="task.completed" class="text-done">{{ task.title }}</span>
            </td>
            <td class="actions">
              <v-btn
                v-if="!task.completed"
                color="blue rounded"
                density="comfortable"
                icon="fas fa-check-square"
                size="small"
                @click="toggleTask(index)"
              />
              <v-btn
                v-if="task.completed"
                color="grey rounded"
                density="comfortable"
                icon="fas fa-times"
                size="small"
                @click="toggleTask(index)"
              />
              <v-btn
                class="ml-1"
                color="error rounded"
                density="comfortable"
                icon="fas fa-trash"
                size="small"
                @click="removeTask(index)"
              />
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { Factory } from '@/interfaces/planner/FactoryInterface'

  const props = defineProps <{
    factory: Factory;
    helpText: boolean;
  }>()

  const newTask = ref('')

  const addTask = () => {
    // Only add a new task if there isn't already an empty one
    props.factory.tasks.push({ title: newTask.value, completed: false })

    newTask.value = ''
  }

  const toggleTask = (index: number) => {
    props.factory.tasks[index].completed = !props.factory.tasks[index].completed
  }

  const removeTask = (index: number) => {
    props.factory.tasks.splice(index, 1)
  }
</script>

<style lang="scss" scoped>
.v-table .v-table__wrapper > table {
  tbody {
    tr {
      &:last-of-type {
        td {
          border-bottom: 0;
        }
      }

      td {
        padding-bottom: 4px;
        &.actions {
          text-align: right;
          width: 60px !important;
          padding: 0 0 0 0; // hack to get around textarea having invisible space at the top
        }
      }
    }
  }
}
.text-done {
  text-decoration: line-through;
  color: green
}
</style>
