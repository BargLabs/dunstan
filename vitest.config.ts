import { availableParallelism } from 'node:os';
import { defineConfig } from 'vitest/config';

// Vitest's default is one worker per core but one. On an 18-core machine that is 17 workers, each
// able to hold gigabytes, which exhausted memory and panicked the host on 2026-11-17. Six is the
// ceiling; `--maxWorkers` on the command line still overrides it.
const maxWorkers = Math.min(6, Math.max(1, availableParallelism() - 1));

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'hosted/**/*.test.ts', 'experiments/**/*.test.mjs'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.worktrees/**', '**/coverage/**'],
    maxWorkers,
  },
});
