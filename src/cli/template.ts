// dunstan template: prints a dunstan-handback fence filled from local git (src/template/). Standard
// output carries the fence and nothing else, so it can be pasted or appended as it is; the notes go
// to standard error. When git cannot answer, nothing is printed on standard output.
//
// Tests, one of three ways. --tests-ci reads the counts at HEAD from the CI record `dunstan check`
// reads (src/template/tests-ci.ts): the one read this command makes online, with GITHUB_TOKEN. When
// no single count settles it prints the block without tests, says why, and exits 2: the block is
// valid and printed, so this is not an error (3), and it is not the block that was asked for, so a
// script that pipes it into a report cannot take it for one with its tests (0). --tests-local and
// --tests-junit read a local JUnit file and nothing online. With --gitlab-project and --mr
// (DRAFT GitLab profile 0.1), --tests-ci reads the merge request's head pipeline instead, with
// GITLAB_TOKEN; --repo and the GitLab flags together are refused.
//
// This file reads the flags and refuses a usage error. Everything after that is runTemplate
// (src/template/run.ts), which the MCP tool dunstan_template_handback calls too.

import { parseArgs } from 'node:util';
import { GITLAB_PROJECT } from '../evidence/gitlab.js';
import { GITLAB_HOST } from '../evidence/http.js';
import { GITLAB_ARTIFACT, runTemplate, type TemplateTests } from '../template/run.js';
import { parsePositiveInt, REPOSITORY } from './check.js';
import { type CliIo, EXIT, UsageError } from './output.js';

const RECORD_FLAGS = [
  'tests-workflow',
  'tests-job',
  'tests-artifact',
  'tests-artifact-path',
] as const;

// The flags that name a GitLab merge request, as `dunstan check --gitlab-project` takes them.
const GITLAB_FLAGS = ['gitlab-project', 'mr', 'gitlab-host'] as const;

// --tests-ci on a GitLab merge request (DRAFT GitLab profile 0.1): the subject as `dunstan check`
// checks its flags, the job, and the file in its archive. --tests-workflow is optional (absent: the
// project's CI configuration file); --tests-artifact, if given, must be archive.
function gitlabTests(flag: (name: string) => string | undefined): TemplateTests {
  if (flag('repo') !== undefined) {
    throw new UsageError(
      '--repo does not go with --gitlab-project: name a GitHub repository or a GitLab merge request, not both',
    );
  }
  if (flag('tests-artifact-path') !== undefined) {
    throw new UsageError(
      '--tests-artifact-path does not go with --gitlab-project: --tests-path names the file in the archive',
    );
  }
  const artifact = flag('tests-artifact');
  if (artifact !== undefined && artifact !== GITLAB_ARTIFACT) {
    throw new UsageError(
      `--tests-artifact must be ${GITLAB_ARTIFACT} on GitLab: the job's artifacts archive (spec/claim-format.md, G.3)`,
    );
  }
  const project = flag('gitlab-project');
  if (project === undefined || !GITLAB_PROJECT.test(project)) {
    throw new UsageError(
      "--gitlab-project <namespace/project> is required: the project's full path, group/subgroup/.../project",
    );
  }
  const mr = flag('mr');
  if (mr === undefined) throw new UsageError('--mr <iid> is required');
  const iid = parsePositiveInt(mr, '--mr');
  const host = flag('gitlab-host');
  if (host !== undefined && !GITLAB_HOST.test(host)) {
    throw new UsageError('--gitlab-host is a lowercase host name, such as gitlab.example.com');
  }
  const missing = (['tests-command', 'tests-job'] as const).filter((f) => flag(f) === undefined);
  if (missing.length > 0) {
    throw new UsageError(
      `--tests-ci --gitlab-project needs ${missing.map((f) => `--${f}`).join(', ')}`,
    );
  }
  return {
    from: 'ci',
    gitlabProject: project,
    mergeRequest: iid,
    gitlabHost: host,
    command: flag('tests-command') as string,
    job: flag('tests-job') as string,
    path: flag('tests-path'),
    workflow: flag('tests-workflow'),
  };
}

export async function template(args: string[], io: CliIo): Promise<number> {
  const { values } = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    options: {
      base: { type: 'string' },
      'tests-ci': { type: 'boolean' },
      'tests-local': { type: 'string' },
      'tests-junit': { type: 'string' },
      'tests-command': { type: 'string' },
      repo: { type: 'string' },
      'gitlab-project': { type: 'string' },
      mr: { type: 'string' },
      'gitlab-host': { type: 'string' },
      'tests-path': { type: 'string' },
      ...Object.fromEntries(RECORD_FLAGS.map((f) => [f, { type: 'string' as const }])),
    },
  });
  const v = values as Record<string, string | boolean | undefined>;
  const flag = (name: string) => v[name] as string | undefined;
  const ci = v['tests-ci'] === true;
  const modes = [ci, flag('tests-local') !== undefined, flag('tests-junit') !== undefined];
  if (modes.filter(Boolean).length > 1) {
    throw new UsageError('give one of --tests-ci, --tests-local or --tests-junit');
  }
  if (flag('repo') !== undefined && !ci) throw new UsageError('--repo goes with --tests-ci');
  const gitlab = GITLAB_FLAGS.filter((f) => flag(f) !== undefined);
  if (gitlab.length > 0 && !ci) throw new UsageError(`--${gitlab[0]} goes with --tests-ci`);
  if (flag('tests-path') !== undefined && gitlab.length === 0) {
    throw new UsageError(
      '--tests-path goes with --gitlab-project (on GitHub, --tests-artifact-path names the file)',
    );
  }
  const given = (['tests-command', ...RECORD_FLAGS] as const).filter((f) => flag(f) !== undefined);

  let tests: TemplateTests | undefined;
  if (ci && gitlab.length > 0) {
    tests = gitlabTests(flag);
  } else if (ci) {
    const missing = (['tests-command', 'tests-workflow', 'tests-job'] as const).filter(
      (f) => flag(f) === undefined,
    );
    if (missing.length > 0) {
      throw new UsageError(`--tests-ci needs ${missing.map((f) => `--${f}`).join(', ')}`);
    }
    const repo = flag('repo');
    if (repo !== undefined && !REPOSITORY.test(repo)) {
      throw new UsageError('--repo must be <owner/name>');
    }
    tests = {
      from: 'ci',
      command: flag('tests-command') as string,
      workflow: flag('tests-workflow') as string,
      job: flag('tests-job') as string,
      artifact: flag('tests-artifact'),
      artifactPath: flag('tests-artifact-path'),
      repository: repo,
    };
  } else if (flag('tests-local') !== undefined) {
    if (flag('tests-command') === undefined) {
      throw new UsageError('--tests-local needs --tests-command <cmd>');
    }
    const extra = RECORD_FLAGS.find((f) => flag(f) !== undefined);
    if (extra !== undefined) throw new UsageError(`--${extra} does not go with --tests-local`);
    tests = {
      from: 'local',
      junit: flag('tests-local') as string,
      command: flag('tests-command') as string,
    };
  } else if (flag('tests-junit') !== undefined) {
    const missing = (['tests-command', ...RECORD_FLAGS] as const).filter(
      (f) => flag(f) === undefined,
    );
    if (missing.length > 0) {
      throw new UsageError(
        `--tests-junit needs the CI record its counts are checked against: ${missing.map((f) => `--${f}`).join(', ')}`,
      );
    }
    tests = {
      from: 'junit',
      junit: flag('tests-junit') as string,
      command: flag('tests-command') as string,
      workflow: flag('tests-workflow') as string,
      job: flag('tests-job') as string,
      artifact: flag('tests-artifact') as string,
      artifactPath: flag('tests-artifact-path') as string,
    };
  } else if (given.length > 0) {
    throw new UsageError(`--${given[0]} goes with --tests-ci, --tests-local or --tests-junit`);
  }

  const run = await runTemplate(
    { cwd: io.cwd ?? process.cwd(), base: flag('base'), tests, caller: 'cli' },
    { env: io.env, fetch: io.fetch, warn: (message) => io.err(`dunstan: ${message}\n`) },
  );
  io.out(run.fence);
  for (const note of run.notes) io.err(`dunstan: ${note}\n`);
  return run.tests === 'not_declared' ? EXIT.unverifiable : 0;
}
