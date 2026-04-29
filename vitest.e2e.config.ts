import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/e2e/**/*.e2e.test.ts'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 30_000,
  },
});
