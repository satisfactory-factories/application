<template>
  <div class="d-flex justify-center">
    <v-card class="rounded-md ma-12" max-width="800" width="100%">
      <v-card-title class="text-h5">Page not found</v-card-title>
      <v-card-text>
        <p class="mb-4">
          There's nothing at <span class="text-orange font-weight-bold">{{ requestedPath }}</span>.
          The link may be out of date, or there could be a typo in the address.
        </p>
        <div class="d-flex flex-wrap ga-2">
          <v-btn color="primary" to="/">
            <i class="fas fa-industry mr-2" />Go to the planner
          </v-btn>
          <v-btn class="border" to="/parts">
            <i class="fas fa-cubes mr-2" />Browse parts
          </v-btn>
        </div>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup lang="ts">
  import { useRoute } from 'vue-router'

  // Catch-all route. Vercel rewrites every unmatched request to the SPA
  // entrypoint (see web/vercel.json), so a bad URL lands here rather than
  // rendering an empty <router-view />.
  const route = useRoute()
  const requestedPath = computed(() => route.path)
</script>
