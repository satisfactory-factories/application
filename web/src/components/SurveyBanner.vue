<template>
  <v-alert
    v-if="visible"
    class="survey-banner"
    closable
    data-testid="survey-banner"
    density="compact"
    icon="fas fa-comment-dots"
    type="info"
    variant="flat"
    @click:close="dismiss"
  >
    Offer your feedback on Satisfactory Factories by filling in
    <a
      class="survey-banner__link"
      data-testid="survey-banner-link"
      :href="SURVEY_URL"
      rel="noopener"
      target="_blank"
    >our survey</a>.
  </v-alert>
</template>

<script setup lang="ts">
  import { ref } from 'vue'

  const SURVEY_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSf9iwJVXUp3m2ixLjnAfLwTgzEBgK14NShyko2nr6y7dDCJeQ/viewform?usp=sharing&ouid=116850695672424184269'

  /** Named for this survey, so a later one gets its own key and shows again to everyone. */
  const SURVEY_DISMISSED_KEY = 'dismissed-survey-2026-10'

  // Storage can throw (private windows, blocked site data); the banner then just shows.
  const wasDismissed = () => {
    try {
      return localStorage.getItem(SURVEY_DISMISSED_KEY) === 'true'
    } catch {
      return false
    }
  }

  const visible = ref(!wasDismissed())

  const dismiss = () => {
    visible.value = false
    try {
      localStorage.setItem(SURVEY_DISMISSED_KEY, 'true')
    } catch {
      // Hidden for this page load only.
    }
  }
</script>

<style lang="scss" scoped>
.survey-banner__link {
  color: inherit;
  font-weight: 700;
}
</style>
