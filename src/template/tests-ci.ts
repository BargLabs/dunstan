// dunstan template --tests-ci: the counts a `junit` record holds at HEAD, read from CI with the reader
// `dunstan check` uses (src/evidence/github.ts, readTestRecord: spec section 7.5, the named job's
// latest attempt included), so the counts the block declares are the counts the gate will read.
//
// Never invent a count. Where no single count settles (no token, HEAD not pushed, CI not finished,
// no candidate run, runs that disagree, an artifact or listing that cannot be read), no tests are
// declared and the note says why and what to do. Read-only toward GitHub.

import type { JunitRecord, TestRun } from '../check/types.js';
import { readTestRecord, type TestRecordObserved } from '../evidence/github.js';
import type { GitHubClient } from '../evidence/http.js';
import { remedyForReason } from '../remedy/remedies.js';
import { type Caller, phrase } from './wording.js';

export interface CiTestsInput {
  repository: string;
  headCommit: string;
  record: JunitRecord;
  command: string;
  // Whether a remote-tracking branch holds HEAD (src/template/template.ts, isPushed).
  pushed: boolean;
  // Who reads the notes: their instructions name flags or tool inputs (./wording.ts).
  caller: Caller;
}

export type CiTests =
  | { status: 'settled'; run: TestRun; notes: string[] }
  | { status: 'unsettled'; reason: string; notes: string[] };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function unsettled(reason: string, why: string, remedy: string | undefined): CiTests {
  const notes = [`tests are not declared: ${why} (${reason}).`];
  if (remedy !== undefined) notes.push(`remedy: ${remedy}`);
  return { status: 'unsettled', reason, notes };
}

export async function testsFromCi(client: GitHubClient, input: CiTestsInput): Promise<CiTests> {
  const { repository, headCommit: head, record, caller } = input;
  const againCi = phrase(caller, 'againCi');
  if (!client.hasToken) {
    return unsettled(
      'no_token',
      'GITHUB_TOKEN is not set, and GitHub answers an artifact download only with a token, even on a public repository',
      `set GITHUB_TOKEN to a token that can read the repository, with actions: read, and ${againCi}.`,
    );
  }
  if (!input.pushed) {
    return unsettled(
      'not_pushed',
      `HEAD ${head} is not on any remote-tracking branch, so no CI run can have tested it`,
      `push it, wait for CI to finish, and ${againCi} (run git fetch first if it was pushed from elsewhere).`,
    );
  }

  const observed: TestRecordObserved = { runsNotCompleted: 0 };
  const evidence = await readTestRecord(client, repository, record, head, observed);
  const named = `the artifact ${record.artifact} holding ${record.path} from job ${record.job}`;
  const pending =
    observed.runsNotCompleted > 0
      ? `CI has not finished: ${plural(observed.runsNotCompleted, 'run', 'runs')} of ${record.workflow} at ${head} ${observed.runsNotCompleted === 1 ? 'is' : 'are'} not completed`
      : undefined;
  const again = `${againCi} once CI has finished on this commit.`;

  if (evidence.status !== 'ok') {
    const reason =
      evidence.status === 'unreadable'
        ? `source_unreadable:${evidence.source}`
        : `evidence_field_unpopulated:${evidence.field}`;
    if (pending !== undefined) return unsettled(reason, pending, again);
    const why =
      reason === 'source_unreadable:artifact'
        ? `a run of ${record.workflow} at ${head} uploaded ${record.artifact}, and it could not be read`
        : `the workflow runs of ${record.workflow} at ${head} could not be read`;
    return unsettled(
      reason,
      why,
      remedyForReason(reason, { hasToken: true, caller }) ?? `${againCi}.`,
    );
  }
  if (evidence.runs.length === 0) {
    if (pending !== undefined) {
      return unsettled(
        'record_not_found',
        `${pending}, and no completed run uploaded ${named}`,
        again,
      );
    }
    return unsettled(
      'record_not_found',
      `no run of ${record.workflow} at ${head} uploaded ${named}`,
      remedyForReason('record_not_found', { hasToken: true, caller }),
    );
  }
  const executed = new Set(evidence.runs.map((r) => r.executed));
  const failed = new Set(evidence.runs.map((r) => r.failed));
  if (executed.size > 1 || failed.size > 1) {
    const counts = evidence.runs
      .map((r) => `run ${r.runId}: ${r.executed} executed, ${r.failed} failed`)
      .join('; ');
    return unsettled(
      'record_ambiguous',
      `the runs of ${record.workflow} at ${head} that uploaded ${record.artifact} disagree (${counts}), and the gate never picks one`,
      'make the runs agree (re-run the one that differs), or name a job only one of them runs.',
    );
  }

  const run = evidence.runs[0] as (typeof evidence.runs)[number];
  const runs = evidence.runs.map((r) => r.runId).join(', ');
  const notes = [
    `tests: ${run.executed} executed and ${run.failed} failed in ${record.path} in the artifact ${record.artifact} of job ${record.job} in ${record.workflow} at ${head}, read from CI as the gate reads it (${evidence.runs.length === 1 ? 'run' : 'runs'} ${runs}).`,
  ];
  if (pending !== undefined) {
    notes.push(
      `${pending}; a run that finishes later with other counts makes the gate's read ambiguous. ${phrase(caller, 'againCiSentence')} once CI has finished.`,
    );
  }
  return {
    status: 'settled',
    run: { command: input.command, count: run.executed, failures: run.failed, record },
    notes,
  };
}
