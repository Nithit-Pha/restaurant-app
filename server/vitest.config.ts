import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/modules/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.routes.ts'],
    },
  },
});

// package.json scripts:
//   "test": "vitest run",
//   "test:watch": "vitest",
//   "test:cov": "vitest run --coverage"
// devDependencies: vitest, @vitest/coverage-v8
