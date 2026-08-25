<template>
  <v-card class="factory-card sub-card">
    <v-card-title>
      <i class="fas fa-tasks" />
      <span class="ml-3 text-h5">Tasks</span>
    </v-card-title>
    <v-card-text>
      <v-text-field
        v-model="newTask"
        counter="200"
        dense
        label="New Task"
        outlined
        placeholder="Add a task..."
        :rules="[newTaskRules.length]"
        @blur="addTask"
        @keyup.enter="addTask"
      />
      <p v-if="factory.tasks.length >= 40" class="text-red">You are only allowed up to 50 tasks.</p>
      <v-table v-if="factory.tasks.length > 0" class="sub-card" :class="{ 'mt-2': factory.tasks.length > 0 }" density="compact">
        <draggable
          handle=".task-drag-handle"
          :item-key="taskKey"
          :model-value="factory.tasks"
          tag="tbody"
          @change="onTaskOrderChange"
        >
          <template #item="{ element: task, index }">
            <tr>
              <td class="handle">
                <i
                  class="fas fa-grip-lines task-drag-handle text-grey-darken-1"
                  title="Drag to reorder task"
                />
              </td>
              <td class="toggle">
                <!-- .sf-tick draws the box and the tick; see global.scss for why it is not a
                     Vuetify selection control. `task-tick` is kept as the test's handle. -->
                <input
                  :checked="task.completed"
                  class="task-tick sf-tick"
                  :title="task.completed ? 'Mark as not done' : 'Mark as done'"
                  type="checkbox"
                  @change="toggleTask(index)"
                >
              </td>
              <td class="title">
                <v-textarea
                  v-if="!task.completed"
                  v-model="task.title"
                  auto-grow
                  density="compact"
                  hide-details
                  rows="1"
                  variant="plain"
                  @change="validateTaskLength(task)"
                />
                <p v-if="task.completed" class="text-done">{{ task.title }}</p>
              </td>
              <td class="actions">
                <v-btn
                  color="red rounded"
                  density="comfortable"
                  icon="fas fa-trash"
                  size="small"
                  title="Delete task"
                  variant="outlined"
                  @click="removeTask(index)"
                />
              </td>
            </tr>
          </template>
        </draggable>
      </v-table>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import draggable from 'vuedraggable'
  import { Factory, FactoryTask } from '@/interfaces/planner/FactoryInterface'

  const props = defineProps <{
    factory: Factory;
  }>()

  const newTask = ref('')

  // Tasks are persisted as bare {title, completed} and carry no id, so key the rows by object
  // identity — an index key reuses the wrong row after a drop, and titles can be duplicated.
  const taskKeys = new WeakMap<FactoryTask, number>()
  let nextTaskKey = 0
  const taskKey = (task: FactoryTask) => {
    let key = taskKeys.get(task)
    if (key === undefined) {
      key = nextTaskKey++
      taskKeys.set(task, key)
    }
    return key
  }

  const onTaskOrderChange = (event: { moved?: { newIndex: number, oldIndex: number } }) => {
    if (!event.moved) return
    const [task] = props.factory.tasks.splice(event.moved.oldIndex, 1)
    props.factory.tasks.splice(event.moved.newIndex, 0, task)
  }

  const newTaskRules = {
    length: () => {
      if (newTask.value.length >= 200) {
        newTask.value = newTask.value.slice(0, 200)
        return 'Max character limit (200) reached. Condense your thoughts pioneer!'
      }
      return true
    },
  }

  // Called on enter and on blur, so typing something and clicking away adds the task rather
  // than silently throwing it away. Both paths land here with the field already cleared by a
  // previous add, hence the empty check comes before anything that can nag the user.
  const addTask = () => {
    const title = newTask.value.trim()
    if (title.length === 0) {
      newTask.value = ''
      return
    }
    if (props.factory.tasks.length >= 50) {
      alert('You have reached the maximum number of tasks allowed (50).')
      return
    }

    // Prevent people from adding a stupidly long task
    if (title.length > 200) {
      alert('Task is too long. Please keep it under 200 characters.')
      return
    }

    props.factory.tasks.push({ title, completed: false })
    newTask.value = ''
  }

  const toggleTask = (index: number) => {
    props.factory.tasks[index].completed = !props.factory.tasks[index].completed
  }

  const removeTask = (index: number) => {
    props.factory.tasks.splice(index, 1)
  }

  const validateTaskLength = (task: { title: string }) => {
    if (task.title.length > 200) {
      alert('Max character limit (200) reached. Condense your thoughts pioneer!')
      task.title = task.title.slice(0, 200)
    }
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
        &.handle {
          width: 24px !important;
          padding: 0 4px 0 0;
          text-align: center;
        }
        // Sized to the checkbox itself; the padding is the whole gap to the title.
        &.toggle {
          width: 24px !important;
          padding: 0 6px 0 0;
        }
        &.title {
          padding-left: 0;

          // Underlined on hover and while editing, matching the factory name: a plain-variant
          // textarea reads as text until something says it can be typed in, and marking the
          // words themselves says it without highlighting the whole row.
          .v-textarea :deep(textarea) {
            &:hover, &:focus {
              text-decoration: underline;
            }
          }
        }
      }
    }
  }
}
.task-drag-handle {
  cursor: grab;
}
.text-done {
  text-decoration: line-through;
  color: green;
  font-size: 16px;
  margin-top: 8px;
}
</style>
