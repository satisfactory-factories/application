import path from 'node:path'

import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.spec.ts', 'src/**/*.spec.ts'],
    globalSetup: ['test/utils/global-setup.ts'],
    // mongodb-memory-server downloads mongod on the first run of a fresh clone.
    hookTimeout: 300_000,
    testTimeout: 30_000,
  },
  resolve: {
    // Source, not dist, so the suite runs without a prior `common` build.
    alias: { common: path.resolve(__dirname, '../common/src/index.ts') },
  },
  // esbuild cannot emit decorator metadata, which Nest's DI needs.
  plugins: [swc.vite({ module: { type: 'es6' } })],
})
