import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/helpers/setup.ts'],
    testTimeout: 180_000,
    hookTimeout: 300_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
