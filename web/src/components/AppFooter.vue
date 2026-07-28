<template>
  <v-footer dark>
    <v-row class="justify-center" no-gutters>
      <v-btn
        v-for="link in links"
        :key="link"
        class="mx-2"
        color="white"
        rounded="xl"
        variant="text"
      >
        {{ link }}
      </v-btn>
      <v-col class="text-center mt-4" cols="12">
        &copy;{{ new Date().getFullYear() }} Matt Cavanagh<br>
        All assets (images, recipe data etc) are the sole property of Coffee Stain Studios, who are the owners of the Satisfactory&trade; video game.<br>
        This project is not affiliated with Coffee Stain Studios in any way.
      </v-col>
    </v-row>
  </v-footer>
</template>

<script lang="ts">
  export default {
    data: () => ({
      links: [
        'GitHub',
      ],
    }),
  }
</script>
