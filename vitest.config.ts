import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Test against the core *source*, not a stale dist build — package src
      // (react, openfeature) imports 'switchbox-js', which node resolution
      // would otherwise point at packages/core/dist.
      'switchbox-js': resolve(__dirname, 'packages/core/src/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
