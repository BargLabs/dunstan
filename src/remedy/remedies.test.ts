// The remedy lines: presentation only. Every reason code in spec section 16 has a line, or says the
// record decides; the survey's own reasons have one too; and the lookup falls back from a reason
// with a variable part to its prefix. A tests row that is unverifiable for a reason a repository or
// an agent can act on gets one line in the claims table saying what to do; no other row does, and no
// record changes.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { asMcp, NAMES_A_FLAG } from '../__tests__/wording.js';
import type { Claim } from '../check/types.js';
import {
  NO_REMEDY,
  REMEDIES,
  remedyFor,
  remedyForReason,
  remedyTable,
  TESTS_REMEDY_REASONS,
} from './remedies.js';

const spec = readFileSync(new URL('../../spec/claim-format.md', import.meta.url), 'utf8');

// The reason and verdict columns of section 16's table, with `<...>` placeholders as `*`.
function sectionSixteen(): { reason: string; verdict: string }[] {
  const start = spec.indexOf('## 16. Reason codes');
  const end = spec.indexOf('\n## ', start + 1);
  return spec
    .slice(start, end)
    .split('\n')
    .map((line) => /^\| `([^`]+)` \| ([a-z]+) \|/.exec(line))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ reason: (m[1] as string).replace(/<[a-z]+>/, '*'), verdict: m[2] as string }));
}

const CONTEXTS = [
  { hasToken: true, caller: 'cli' },
  { hasToken: false, caller: 'cli' },
  { hasToken: true, caller: 'mcp' },
  { hasToken: false, caller: 'mcp' },
] as const;

const FLAG = NAMES_A_FLAG;

// The three lines that name the template, as the command line prints them: exactly the 0.1.16 text.
const CLI_LINES: Record<string, string> = {
  block_missing:
    'The report has no dunstan-handback block: declare the claims in one (dunstan template writes it).',
  record_not_found:
    "no run of the named workflow at the head uploaded that artifact from that job. Publish the JUnit record from CI (docs/ci-test-records.md), then check that the record's workflow, job, artifact and path are the ones the run used: dunstan template --tests-ci fills them.",
  local_run_not_in_record:
    'these counts are from a local run. Publish the JUnit record from CI (docs/ci-test-records.md), and run dunstan template --tests-ci after CI has finished on your last push.',
};

const row = (field: string, verdict: Claim['verdict'], reason?: string): Claim => ({
  id: `count:${field}`,
  check: 'count',
  field,
  declared: 1,
  observed: null,
  verdict,
  ...(reason === undefined ? {} : { reason }),
});

describe('the remedies', () => {
  it('read section 16 whole', () => {
    const reasons = sectionSixteen().map((r) => r.reason);
    expect(reasons.length).toBeGreaterThanOrEqual(29);
    expect(reasons[0]).toBe('block_missing');
    expect(reasons).toContain('local_run_not_in_record');
    expect(reasons.at(-1)).toBe('source_unreadable:*');
  });

  it.each(sectionSixteen())('have a line for $reason ($verdict)', ({ reason, verdict }) => {
    for (const context of CONTEXTS) {
      const line = remedyForReason(reason, context);
      expect(line, reason).toBeDefined();
      expect((line as string).length).toBeGreaterThan(0);
      // A claim the record decided has nothing to fix in the record; one it could not settle does.
      if (verdict === 'fail') expect(line).toBe(NO_REMEDY);
      if (verdict === 'unverifiable') expect(line).not.toBe(NO_REMEDY);
    }
  });

  it.each(['pull_request_unreadable', 'pull_request_moved', 'rate_limited', 'report_unavailable'])(
    'have a line for the survey reason %s',
    (reason) => {
      expect(remedyForReason(reason, { hasToken: false, caller: 'cli' })).toMatch(/\S/);
    },
  );

  it('fall back from a reason with a variable part to its prefix', () => {
    const context = { hasToken: true, caller: 'cli' } as const;
    expect(remedyForReason('source_unreadable:check_runs', context)).toBe(
      REMEDIES['source_unreadable:*']?.(context),
    );
    expect(remedyForReason('evidence_field_unpopulated:merged_at', context)).toBe(
      REMEDIES['evidence_field_unpopulated:*']?.(context),
    );
    expect(remedyForReason('source_unreadable:artifact', context)).not.toBe(
      REMEDIES['source_unreadable:*']?.(context),
    );
    expect(remedyForReason('no_such_reason', context)).toBeUndefined();
    expect(remedyForReason('no_such_kind:x', context)).toBeUndefined();
  });

  it('word only the artifact line apart with and without a token', () => {
    const tokened = remedyTable({ hasToken: true, caller: 'cli' });
    const anonymous = remedyTable({ hasToken: false, caller: 'cli' });
    const differ = Object.keys(tokened).filter((r) => tokened[r] !== anonymous[r]);
    expect(differ).toEqual(['source_unreadable:artifact']);
    expect(anonymous['source_unreadable:artifact']).toMatch(/GITHUB_TOKEN/);
    expect(tokened['source_unreadable:artifact']).toMatch(/expired/);
  });

  it('word only the three lines that name the template apart for an MCP caller', () => {
    for (const hasToken of [true, false]) {
      const cli = remedyTable({ hasToken, caller: 'cli' });
      const mcp = remedyTable({ hasToken, caller: 'mcp' });
      const differ = Object.keys(cli).filter((r) => cli[r] !== mcp[r]);
      expect(differ.sort()).toEqual(Object.keys(CLI_LINES).sort());
    }
  });

  it.each(Object.keys(CLI_LINES))(
    '%s: the command line text unchanged, and the tool and its inputs for an MCP caller',
    (reason) => {
      for (const hasToken of [true, false]) {
        const cli = remedyForReason(reason, { hasToken, caller: 'cli' });
        const mcp = remedyForReason(reason, { hasToken, caller: 'mcp' }) as string;
        expect(cli).toBe(CLI_LINES[reason]);
        expect(cli).toMatch(/dunstan template /);
        expect(mcp).toMatch(/dunstan_template_handback/);
        expect(mcp).not.toMatch(FLAG);
        // The two differ only by the table's pair.
        expect(asMcp(cli as string)).toBe(mcp);
      }
    },
  );

  it('never name a flag or the command to an MCP caller, for any reason', () => {
    for (const hasToken of [true, false]) {
      for (const [reason, line] of Object.entries(remedyTable({ hasToken, caller: 'mcp' }))) {
        expect(line, reason).not.toMatch(FLAG);
      }
    }
  });

  it('give the lines the survey leads with', () => {
    const context = { hasToken: true, caller: 'cli' } as const;
    expect(remedyForReason('record_not_found', context)).toMatch(
      /^no run of the named workflow at the head uploaded that artifact from that job/,
    );
    expect(remedyForReason('no_comparable_record_field', context)).toMatch(
      /^this record's kind has nothing Dunstan can compare/,
    );
    expect(remedyForReason('record_ambiguous', context)).toBe(
      'Several runs at the head disagree on the count.',
    );
    expect(remedyForReason('checks_incomplete', context)).toMatch(
      /^CI had not finished when the record was read/,
    );
  });
});

describe('remedyFor', () => {
  it('names a remedy for exactly the four reasons the card lists, and the producer rule (0.1.10)', () => {
    expect([...TESTS_REMEDY_REASONS].sort()).toEqual([
      'local_run_not_in_record',
      'no_comparable_record_field',
      'record_not_found',
      'record_producer_changed_by_pr',
      'source_unreadable:artifact',
    ]);
  });

  it('tells a pull request that changed its record workflow to land that change on its own', () => {
    for (const hasToken of [true, false]) {
      for (const caller of ['cli', 'mcp'] as const) {
        expect(
          remedyFor(row('/tests/0/count', 'unverifiable', 'record_producer_changed_by_pr'), {
            hasToken,
            caller,
          }),
        ).toBe(
          'This pull request changes the workflow that produced the test record, so the record is its own evidence. Land the workflow change separately, then declare the counts.',
        );
      }
    }
  });

  it.each([...TESTS_REMEDY_REASONS])(
    '%s: a line for a count and a failures row, either token state',
    (reason) => {
      for (const field of ['/tests/0/count', '/tests/3/failures']) {
        for (const hasToken of [true, false]) {
          const line = remedyFor(row(field, 'unverifiable', reason), { hasToken, caller: 'cli' });
          expect(line).toBeTypeOf('string');
          expect(line).not.toMatch(/\n/);
          expect((line as string).length).toBeLessThan(400);
          // The claims table prints the line the survey carries for the same reason.
          expect(line).toBe(remedyForReason(reason, { hasToken, caller: 'cli' }));
        }
      }
    },
  );

  it('words the artifact remedy apart with and without a token', () => {
    const r = row('/tests/0/count', 'unverifiable', 'source_unreadable:artifact');
    const anonymous = remedyFor(r, { hasToken: false, caller: 'cli' });
    const tokened = remedyFor(r, { hasToken: true, caller: 'cli' });
    expect(anonymous).toMatch(/GITHUB_TOKEN/);
    expect(anonymous).toMatch(/actions: read/);
    expect(tokened).not.toMatch(/GITHUB_TOKEN is not set/);
    expect(tokened).toMatch(/expired/);
  });

  it('points a missing record and a local run at the CI recipe', () => {
    for (const reason of [
      'record_not_found',
      'local_run_not_in_record',
      'no_comparable_record_field',
    ]) {
      expect(
        remedyFor(row('/tests/0/count', 'unverifiable', reason), { hasToken: true, caller: 'cli' }),
      ).toMatch(/docs\/ci-test-records\.md/);
    }
    expect(
      remedyFor(row('/tests/0/count', 'unverifiable', 'local_run_not_in_record'), {
        hasToken: true,
        caller: 'cli',
      }),
    ).toMatch(/dunstan template --tests-ci/);
  });

  it('gives nothing for a pass, a fail, another reason, or a row that is not a tests row', () => {
    expect(
      remedyFor(row('/tests/0/count', 'pass'), { hasToken: true, caller: 'cli' }),
    ).toBeUndefined();
    expect(
      remedyFor(row('/tests/0/count', 'fail', 'count_mismatch'), { hasToken: true, caller: 'cli' }),
    ).toBeUndefined();
    expect(
      remedyFor(row('/tests/0/count', 'unverifiable', 'record_ambiguous'), {
        hasToken: true,
        caller: 'cli',
      }),
    ).toBeUndefined();
    expect(
      remedyFor(row('/tests/0/count', 'unverifiable', 'source_unreadable:workflow_runs'), {
        hasToken: true,
        caller: 'cli',
      }),
    ).toBeUndefined();
    expect(
      remedyFor(row('/checks/total', 'unverifiable', 'source_unreadable:artifact'), {
        hasToken: false,
        caller: 'cli',
      }),
    ).toBeUndefined();
    expect(
      remedyFor(row('/checks/allSucceeded', 'unverifiable', 'record_not_found'), {
        hasToken: true,
        caller: 'cli',
      }),
    ).toBeUndefined();
  });
});
