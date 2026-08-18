import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // `pnpm build` compiles the specs into dist/ alongside everything else. Without this they
    // are collected twice, and the compiled copy fails outright.
    exclude: ['node_modules/**', 'dist/**']
  }
});
