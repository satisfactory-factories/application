/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Stamped in by vite.config.mts from the repo root package.json.
  readonly VITE_APP_VERSION: string
  // Set by Vercel on the Preview environment only, pointing at the preview API.
  // Absent in production and in local dev, where config.ts falls back.
  readonly VITE_API_URL?: string
  // Compresses the sync engine's revision probe. Set only by the e2e harness.
  readonly VITE_PROBE_MS?: string
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}
