import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'hosted/**/*.test.ts', 'experiments/**/*.test.mjs'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.worktrees/**', '**/coverage/**'],
  },
});
