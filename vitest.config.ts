import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/cli.ts'],
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});
