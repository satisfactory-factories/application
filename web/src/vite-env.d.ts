/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Stamped in by vite.config.mts from the repo root package.json.
  readonly VITE_APP_VERSION: string
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}
