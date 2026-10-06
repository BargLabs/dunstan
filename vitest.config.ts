import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'hosted/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.worktrees/**', '**/coverage/**'],
  },
});
