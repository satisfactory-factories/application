import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
    // mongodb-memory-server downloads a mongod binary on first run
    testTimeout: 30000,
    hookTimeout: 120000,
  },
});
