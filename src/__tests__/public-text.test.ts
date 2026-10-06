// CLAUDE.md is public: it states the IP rule and the build and test gate, and nothing about how a
// particular machine or workflow runs.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const claude = readFileSync(new URL('../../CLAUDE.md', import.meta.url), 'utf8');

describe('CLAUDE.md', () => {
  it('states the IP rule', () => {
    expect(claude).toContain(
      '## IP boundary\n\nThis repository is public. It holds no private evaluation data, no labels from private review and no counterparty names; examples use `example-org/example-repo`.\n',
    );
  });

  it('states the build and test gate', () => {
    expect(claude).toContain('`scripts/preflight_fast.sh`');
    expect(claude).toContain('then `pnpm test`');
    expect(claude).toContain('`pnpm build`');
  });

  it('holds no working practice of a particular machine', () => {
    expect(claude).not.toMatch(/\.worktrees|gpg|dev Mac|shared checkout|BargLabs\//);
  });
});
