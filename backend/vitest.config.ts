import path from 'node:path'

import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.spec.ts', 'src/**/*.spec.ts'],
    globalSetup: ['test/utils/global-setup.ts'],
    // One mongod serves the whole run, and suites that hammer it in parallel see
    // writes go missing. Serial is 18 files in ~55s, which is cheap enough.
    fileParallelism: false,
    // mongodb-memory-server downloads mongod on the first run of a fresh clone.
    hookTimeout: 300_000,
    testTimeout: 30_000,
  },
  resolve: {
    // Source, not dist, so the suite runs without a prior `common` build. The
    // subpath entry has to come first: aliases match in order, by prefix.
    alias: [
      { find: 'common/testing', replacement: path.resolve(__dirname, '../common/src/testing/fixtures.ts') },
      { find: /^common$/, replacement: path.resolve(__dirname, '../common/src/index.ts') },
    ],
  },
  // esbuild cannot emit decorator metadata, which Nest's DI needs.
  plugins: [swc.vite({ module: { type: 'es6' } })],
})
