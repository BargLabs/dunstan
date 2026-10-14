// Every reason a reader claim writes must be one the DRAFT schema's `readerReason` accepts, or the
// record that holds the claim fails its own schema. The reasons are derived from the code, never
// copied from the schema: the collector reads a pull request with each of its reads failing in
// turn, and every reader claim kind is checked against what it wrote. The items sections, which no
// collector writes yet, carry each source their type allows.

import { describe, expect, it } from 'vitest';
import { basePullRequest, fakeGitHub, HEAD, MERGE, REPO } from '../__tests__/fake-github.js';
import type {
  Block,
  Evidence,
  ItemsEvidence,
  ItemsSourceKind,
  ItemsUnread,
} from '../check/types.js';
import { readEvidence, readPullRequest } from '../evidence/github.js';
import { GitHubClient } from '../evidence/http.js';
import type { JsonValue } from '../spec/json.js';
import { DRAFT_RECORD_SCHEMA_FILE, readSchema } from '../spec/schema.js';
import { checkReaderClaim, READER_CLAIM_KINDS } from './reader-claims.js';
import { BM25_FLOOR } from './retrieve.js';
import type { ItemType } from './types.js';

const CLOSES = 'other-org/docs#9';
const CLOSER = 'c105e00000000000000000000000000000000001';

// A block that makes the collector read every section a reader claim reads: the changed files, the
// check runs and the workflow runs that name their suites, and a `closes` the closing references do
// not list, in another repository, closed by a commit, so its repository, its issue, its close
// events and the pull request's commits are all read.
const BLOCK: Block = {
  dunstan: '0.1',
  headCommit: HEAD,
  filesChanged: ['src/a.ts'],
  checks: { allSucceeded: true },
  references: [{ issue: CLOSES, relation: 'closes' }],
};

const SCENARIO = {
  pr: basePullRequest({
    state: 'closed',
    merged: true,
    merged_at: '2026-10-01T14:05:09Z',
    merge_commit_sha: MERGE,
    changed_files: 1,
  }),
  files: [{ filename: 'src/a.ts', status: 'modified' }],
  closing: [],
  repositories: { 'other-org/docs': 200 },
  issues: { [CLOSES]: 200 },
  closeEvents: {
    [CLOSES]: {
      state: 'CLOSED',
      events: [
        { createdAt: '2026-10-01T15:00:00Z', closer: { __typename: 'Commit', oid: CLOSER } },
      ],
    },
  },
  checkRuns: [
    { id: 12, name: 'test', status: 'completed', conclusion: 'success', check_suite: { id: 70 } },
  ],
  workflowRuns: [
    {
      id: 100,
      check_suite_id: 70,
      run_attempt: 1,
      path: '.github/workflows/ci.yml',
      name: 'CI',
      head_sha: HEAD,
    },
  ],
};

// Reads the evidence with the `fail`th read after the pull request's answering 422, which the
// client never retries; with no `fail`, every read answers. Returns the evidence and the reads.
async function collect(fail?: number): Promise<{ evidence: Evidence; reads: number }> {
  const fake = fakeGitHub(SCENARIO);
  let armed = false;
  let reads = 0;
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    if (armed && reads++ === fail) {
      return new Response('{"message":"x"}', {
        status: 422,
        headers: { 'content-type': 'application/json' },
      });
    }
    return fake.fetch(input, init);
  }) as typeof globalThis.fetch;
  const client = new GitHubClient({
    token: 't',
    fetch,
    sleep: async () => {},
    now: () => new Date('2026-10-04T12:00:00Z'),
    warn: () => {},
  });
  const pr = await readPullRequest(client, REPO, 7);
  armed = true;
  const evidence = await readEvidence(client, {
    repository: pr.repository,
    pullRequest: pr,
    block: BLOCK,
  });
  return { evidence, reads };
}

// A declared value of the type each item type's kinds take.
const DECLARED: Record<ItemType, JsonValue> = {
  file: 'src/a.ts',
  check_run: true,
  commit: HEAD,
  timeline_event: CLOSES,
  test: true,
};

// The reason each reader claim kind gives on this evidence, with no candidate: a section it cannot
// read is decided before any candidate is.
function reasons(evidence: Evidence): string[] {
  return [...READER_CLAIM_KINDS].flatMap(([kind, type]) => {
    const check = checkReaderClaim(
      {
        text: 'x',
        kind,
        declaredValue: DECLARED[type],
        candidates: [],
        retrieval: { floor: BM25_FLOOR },
      },
      evidence,
      REPO,
    );
    return check.reason === undefined ? [] : [check.reason];
  });
}

// Each source an items section may carry, by its type: `satisfies` refuses a missing or extra one.
const ITEMS_SOURCES = Object.keys({
  pull_request_commits: true,
  timeline: true,
  artifact: true,
} satisfies Record<ItemsSourceKind, true>) as ItemsSourceKind[];

const ITEMS_OK: ItemsEvidence = {
  commits: { status: 'ok', entries: [] },
  timeline: { status: 'ok', entries: [] },
  tests: { status: 'ok', entries: [] },
};

const READER_REASON = new RegExp(
  (
    (readSchema(DRAFT_RECORD_SCHEMA_FILE).$defs as Record<string, { pattern: string }>)
      .readerReason as { pattern: string }
  ).pattern,
);

describe('the reasons a reader claim writes (DRAFT 0.2.0)', () => {
  it('reads every section a reader claim reads, when every read answers', async () => {
    const { evidence, reads } = await collect();
    expect(reads).toBeGreaterThan(0);
    expect(evidence.files?.status).toBe('ok');
    expect(evidence.closingReferences?.status).toBe('ok');
    expect(evidence.references?.map((r) => r.status)).toEqual(['ok']);
    expect(evidence.closeEvents?.pullRequest.status).toBe('ok');
    expect(evidence.closeEvents?.targets.map((t) => t.status)).toEqual(['ok']);
    const runs = evidence.checkRuns?.status === 'ok' ? evidence.checkRuns.runs : [];
    expect(runs.map((r) => r.workflowPath)).toEqual(['.github/workflows/ci.yml']);
  });

  it("accepts every reason, with each source the collector writes into a section a reader claim reads, in the DRAFT schema's readerReason", async () => {
    const { reads } = await collect();
    const written = new Set<string>();
    for (let fail = 0; fail < reads; fail++) {
      for (const reason of reasons((await collect(fail)).evidence)) written.add(reason);
    }
    const base = (await collect()).evidence;
    for (const source of ITEMS_SOURCES) {
      const unread: ItemsUnread = { status: 'unreadable', source };
      for (const section of ['commits', 'timeline', 'tests'] as const) {
        for (const reason of reasons({ ...base, items: { ...ITEMS_OK, [section]: unread } })) {
          written.add(reason);
        }
      }
    }
    const sources = [...written].filter((r) => r.startsWith('source_unreadable:'));
    // The derivation reaches the check runs' second read, the source 10Y4 found refused.
    expect(sources).toContain('source_unreadable:workflow_runs');
    expect([...written].filter((r) => !READER_REASON.test(r)).sort()).toEqual([]);
  });
});
