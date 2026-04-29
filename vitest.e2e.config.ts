import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/e2e/**/*.e2e.test.ts'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/e2e/**',
        'src/shared/types/**',
        'src/index.ts',
        'src/transport/stdio.ts',
      ],
      thresholds: {
        statements: 70,
        lines: 70,
        functions: 70,
        branches: 70,
      },
    },
  },
});
