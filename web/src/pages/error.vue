<template>
  <div class="d-flex justify-center">
    <v-card class="rounded-md ma-12" style="width: 800px; border: 2px solid red">
      <v-card-title class="text-h5">Error Initializing Planner!</v-card-title>
      <v-card-text>
        <p class="mb-4">
          Unfortunately it appears that your data is somehow corrupted.
        </p>
        <p class="mb-4">
          The error is: <span class="text-red">{{ error }}</span>.
        </p>
        <p class="mb-4">
          Please press: <v-btn
            v-if="!copied"
            class="border"
            color="primary"
            density="compact"
            @click="copyData"
          >
            <i class="fas fa-files-medical" />
            <span class="ml-2">Copy Data</span>
          </v-btn>
          <v-btn
            v-if="copied"
            class="border"
            color="primary"
            density="compact"
            disabled
          >
            <i class="fas fa-files-medical" />
            <span class="ml-2">Copied!</span>
          </v-btn> which then you can paste into a message to us on <v-btn class="bg-indigo-darken-2 border" density="compact" href="https://discord.gg/zge68PrGJ7" target="_blank">
            <i class="fab fa-discord" />
            <span class="ml-2">Discord</span>
          </v-btn>.
        </p>
        <p class="mb-4">The chances of us being able to fix this for you are unfortunately slim. The project is still in an <b>ALPHA</b> state, unfortunately these things will happen.</p>
        <div class="text-center">
          <v-btn class="mr-2" color="red" @click="wipeAndReload"><i class="fas fa-trash mr-2" />Reset factory data</v-btn>
        </div>
      </v-card-text>
    </v-card>
  </div>

</template>
<script setup lang="ts">
  const copied = ref(false)

  const error = localStorage.getItem('error') ?? ''

  const copyData = () => {
    console.log('Copying data to clipboard')
    // We can't use appStore.getFactories here as that's likely where it's erroring. We need to pull the data out directly from localStorage.
    const data = localStorage.getItem('factoryTabs') ?? localStorage.getItem('factories')
    if (!data) {
      alert('No data to copy!!')
      return
    }

    const discordMessage = `Hello, I have encountered an error: \`${error}\`. Here is the data:\n\`\`\`json\n${data}\n\`\`\``

    navigator.clipboard.writeText(discordMessage)
    copied.value = true
  }

  const wipeAndReload = () => {
    localStorage.removeItem('factoryTabs')

    // Wipe the data so we don't keep showing this error
    localStorage.removeItem('error')

    // Send back to homepage
    window.location.href = '/'
  }
</script>
