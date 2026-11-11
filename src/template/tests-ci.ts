// dunstan template --tests-ci: the counts a `junit` record holds at HEAD, read from CI with the reader
// `dunstan check` uses (src/evidence/github.ts, readTestRecord: spec section 7.5, the named job's
// latest attempt included), so the counts the block declares are the counts the gate will read.
//
// Never invent a count. Where no single count settles (no token, HEAD not pushed, CI not finished,
// no candidate run, runs that disagree, an artifact or listing that cannot be read), no tests are
// declared and the note says why and what to do. Read-only toward GitHub.
//
// On a GitLab merge request (DRAFT GitLab profile 0.1, G.3), testsFromGitLabCi reads the same way
// with the GitLab reader `dunstan check --gitlab-project` uses (src/evidence/gitlab.ts,
// readGitLabTestRecord): the merge request's head pipeline at HEAD, the named job's artifacts
// archive and the file in it. Read-only toward GitLab, with GITLAB_TOKEN only.

import { producerReason } from '../check/checks.js';
import type { JunitRecord, TestRun } from '../check/types.js';
import {
  PullRequestUnreadable,
  readTestRecord,
  type TestRecordObserved,
} from '../evidence/github.js';
import {
  HEAD_PIPELINE_ELSEWHERE,
  type MergeRequestRead,
  readGitLabCiConfigPath,
  readGitLabTestRecord,
  readMergeRequest,
} from '../evidence/gitlab.js';
import type { GitHubClient, GitLabClient } from '../evidence/http.js';
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

// ---------------------------------------------------------------- GitLab (DRAFT profile 0.1)

export interface GitLabCiTestsInput {
  project: string;
  mergeRequest: number;
  headCommit: string;
  // The record without its workflow when the caller named none: the project's CI configuration
  // file is then read, as the profile's testRecords row reads it, and named.
  record: Omit<JunitRecord, 'workflow'> & { workflow?: string | undefined };
  command: string;
  pushed: boolean;
  caller: Caller;
}

// The counts the check reads for a GitLab `junit` record (DRAFT GitLab profile 0.1, G.3): the merge
// request read, its head pipeline at HEAD, and the named job's archive, with the check's reader
// (src/evidence/gitlab.ts, readGitLabTestRecord). Whatever the check would leave unsettled
// (unverifiable, or head_mismatch) declares no tests, with the check's reason and the remedy the
// claims table prints for it on a GitLab record. GITLAB_TOKEN only, sent only to the GitLab host.
export async function testsFromGitLabCi(
  client: GitLabClient,
  input: GitLabCiTestsInput,
): Promise<CiTests> {
  const { project, mergeRequest: iid, headCommit: head, caller } = input;
  const againCi = phrase(caller, 'againCi');
  const mr = `merge request ${project}!${iid}`;
  if (!client.hasToken) {
    return unsettled(
      'no_token',
      'GITLAB_TOKEN is not set, and an anonymous read of a GitLab project leaves out its CI configuration file (ci_config_path), so no record can be matched to the file that ran, even on a public project',
      `set GITLAB_TOKEN to a token that can read the project (read_api), and ${againCi}.`,
    );
  }
  if (!input.pushed) {
    return unsettled(
      'not_pushed',
      `HEAD ${head} is not on any remote-tracking branch, so no pipeline can have tested it`,
      `push it, wait for the merge request's pipeline to finish, and ${againCi} (run git fetch first if it was pushed from elsewhere).`,
    );
  }

  let read: MergeRequestRead;
  try {
    read = await readMergeRequest(client, project, iid, { record: false });
  } catch (e) {
    if (!(e instanceof PullRequestUnreadable)) throw e;
    return unsettled(
      'source_unreadable:pull_request',
      `${mr} could not be read`,
      `check the project and the merge request, and that GITLAB_TOKEN can read them, then ${againCi}.`,
    );
  }
  if (read.evidence.headSha !== head) {
    return unsettled(
      'head_mismatch',
      `the head of ${mr} is ${read.evidence.headSha}, not HEAD ${head}, so the check would fail the block's headCommit`,
      `push HEAD to the merge request's source branch (or name the merge request it is the head of), wait for its pipeline to finish, and ${againCi}.`,
    );
  }

  let config: Promise<string | null> | undefined;
  const ciConfig = () => {
    config ??= readGitLabCiConfigPath(client, project);
    return config;
  };
  let workflow = input.record.workflow;
  if (workflow === undefined) {
    const named = await ciConfig();
    if (named === null) {
      return unsettled(
        'source_unreadable:repository',
        `the project ${project} could not be read, or its answer does not say which CI configuration file its pipelines run (ci_config_path)`,
        `name the file the pipeline ran, or check that GITLAB_TOKEN can read the project, and ${againCi}.`,
      );
    }
    workflow = named;
  }
  const record: JunitRecord = { ...input.record, kind: 'junit', workflow };
  const gitlab = { hasToken: true, caller, forge: 'gitlab' as const };
  // The check reads the merge request's files for the record's workflow first (section 7.5).
  const producer = producerReason(record, {
    pullRequest: read.evidence,
    files: read.files,
    sources: [],
  });
  if (producer !== undefined) {
    const why =
      producer === 'record_producer_changed_by_pr'
        ? `${mr} changes ${record.workflow}, the CI configuration file that produced the record`
        : `the diffs of ${mr} are not listed whole, so they cannot show ${record.workflow} unchanged`;
    return unsettled(producer, why, remedyForReason(producer, gitlab));
  }
  const evidence = await readGitLabTestRecord(client, project, read, head, record, ciConfig);
  const pipeline = read.headPipeline;

  if (evidence.status === 'unpopulated') {
    const reason = `evidence_field_unpopulated:${evidence.field}`;
    const why =
      evidence.field === HEAD_PIPELINE_ELSEWHERE && pipeline !== null
        ? `the head pipeline of ${mr}, pipeline ${pipeline.id}, is for commit ${pipeline.sha}, not HEAD ${head}`
        : `${mr} has no head pipeline`;
    return unsettled(
      reason,
      why,
      `wait for the merge request's pipeline at HEAD to start and finish, and ${againCi}.`,
    );
  }
  const where = `job ${record.job} of the head pipeline of ${mr}${pipeline === null ? '' : `, pipeline ${pipeline.id}`}, at ${head}`;
  if (evidence.status === 'unreadable') {
    const reason = `source_unreadable:${evidence.source}`;
    const why =
      evidence.source === 'artifact'
        ? `the artifacts archive of ${where} could not be read for ${record.path}`
        : evidence.source === 'repository'
          ? `the project ${project} could not be read, or its answer does not say which CI configuration file its pipelines run (ci_config_path)`
          : `the jobs of the head pipeline of ${mr} could not be read`;
    return unsettled(reason, why, remedyForReason(reason, gitlab) ?? `${againCi}.`);
  }
  if (evidence.runs.length === 0) {
    return unsettled(
      'record_not_found',
      `no ${where} has ${record.path} in its artifacts archive, for ${record.workflow} (a job still running has none yet)`,
      remedyForReason('record_not_found', gitlab),
    );
  }
  const executed = new Set(evidence.runs.map((r) => r.executed));
  const failed = new Set(evidence.runs.map((r) => r.failed));
  if (executed.size > 1 || failed.size > 1) {
    const counts = evidence.runs
      .map((r) => `job ${r.runId}: ${r.executed} executed, ${r.failed} failed`)
      .join('; ');
    return unsettled(
      'record_ambiguous',
      `the jobs named ${record.job} in the head pipeline of ${mr} disagree (${counts}), and the gate never picks one`,
      'make the jobs agree, or name a job only one of them is.',
    );
  }
  const run = evidence.runs[0] as (typeof evidence.runs)[number];
  const jobs = evidence.runs.map((r) => r.runId).join(', ');
  return {
    status: 'settled',
    run: { command: input.command, count: run.executed, failures: run.failed, record },
    notes: [
      `tests: ${run.executed} executed and ${run.failed} failed in ${record.path} in the artifacts archive of job ${record.job} in ${record.workflow}, the head pipeline of ${mr} at ${head}, read from CI as the gate reads it (${evidence.runs.length === 1 ? 'job' : 'jobs'} ${jobs}).`,
    ],
  };
}
