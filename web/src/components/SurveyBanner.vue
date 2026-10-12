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
  import { computed, ref } from 'vue'
  import { useAuthStore } from '@/stores/auth-store'

  const SURVEY_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSf9iwJVXUp3m2ixLjnAfLwTgzEBgK14NShyko2nr6y7dDCJeQ/viewform?usp=sharing&ouid=116850695672424184269'

  /** Named for this survey, so a later one gets its own key and shows again to everyone. */
  const SURVEY_DISMISSED_KEY = 'dismissed-survey-2026-10'

  /** Stamped on the first page load, so the next one knows this browser has been here before. */
  const VISITED_KEY = 'visitedBefore'

  // Storage can throw (private windows, blocked site data). Then nothing is remembered,
  // so the banner only shows to someone signed in.
  const read = (key: string): string | null => {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  }
  const write = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value)
    } catch {
      // Remembered for this page load only.
    }
  }

  // A first visit has the introduction and an empty planner to get through; the survey can
  // wait until they come back. Anyone who closed the introduction before this banner shipped
  // has been here already, as has anyone with an account.
  const returning = read(VISITED_KEY) === 'true' || read('dismissed-introduction') === 'true'
  write(VISITED_KEY, 'true')

  const auth = useAuthStore()
  const dismissed = ref(read(SURVEY_DISMISSED_KEY) === 'true')
  const visible = computed(() => !dismissed.value && (returning || auth.isLoggedIn))

  const dismiss = () => {
    dismissed.value = true
    write(SURVEY_DISMISSED_KEY, 'true')
  }
</script>

<style lang="scss" scoped>
.survey-banner__link {
  color: inherit;
  font-weight: 700;
}
</style>
