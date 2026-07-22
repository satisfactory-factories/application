<!-- Small attribution block shown below the sidebar's global actions.
     Mirrors the wording in AppFooter.vue — keep the two in sync. -->
<template>
  <div class="copyright text-caption text-medium-emphasis text-center px-2 py-2">
    Copyright &copy; 2023 - {{ new Date().getFullYear() }} <a class="text-orange-darken-2" href="https://mattcavanagh.me" target="_blank">Matt Cavanagh</a> aka Maelstrome<br>
    All assets (images, recipe data etc) are the sole property of Coffee Stain
    Studios, who are the owners of the Satisfactory&trade; video game.<br>
    This project is not affiliated with Coffee Stain Studios in any way.
  </div>
</template>

<style lang="scss" scoped>
.copyright {
  line-height: 1.4;
}
</style>
