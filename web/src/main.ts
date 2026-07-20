/**
 * main.ts
 *
 * Bootstraps Vuetify and other plugins then mounts the App`
 */

// Plugins
import { registerPlugins } from '@/plugins'

// Components
import App from './App.vue'

// Composables
import { createApp } from 'vue'
import '@/assets/styles/global.scss'
import { applySfColorVars } from '@/utils/colors'
import { inject } from '@vercel/analytics'
import { injectSpeedInsights } from '@vercel/speed-insights'

// Publish the semantic colour tokens as --sf-* CSS variables before mount so the
// first paint already resolves them (global.scss references var(--sf-*)).
applySfColorVars()

inject()
injectSpeedInsights()

const app = createApp(App)

registerPlugins(app)

app.mount('#app')
