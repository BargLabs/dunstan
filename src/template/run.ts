// The one core of `dunstan template`, after its inputs are read: the command line
// (src/cli/template.ts) and the MCP tool dunstan_template_handback (src/mcp/server.ts) each turn
// their inputs into a TemplateRequest and call runTemplate, so the two print the same fence and the
// same notes, in the same order, for the same inputs. The notes' instructions are worded for the
// caller the request names: flags for the command line, tool inputs for the MCP tool, and nothing
// else differs (src/template/wording.ts, src/mcp/template-parity.test.ts).
//
// Git first: HEAD and the repository are read before anything is read online, so a repository git
// cannot answer for is refused (TemplateError) with nothing read and nothing printed. Only
// `from: "ci"` reads the network, read-only, with the token the caller passes.

import { GitHubClient } from '../evidence/http.js';
import {
  headCommit,
  isPushed,
  originRepository,
  renderBlock,
  type TestsSource,
  templateBlock,
} from './template.js';
import { testsFromCi } from './tests-ci.js';
import type { Caller } from './wording.js';

// The artifact and the file in it that docs/ci-test-records.md's recipes upload.
export const DEFAULT_ARTIFACT = 'dunstan-junit';
export const DEFAULT_ARTIFACT_PATH = 'junit.xml';

// --tests-ci: the counts at HEAD, read from the CI record the gate reads.
export interface TemplateTestsFromCi {
  from: 'ci';
  command: string;
  workflow: string;
  job: string;
  // Absent: DEFAULT_ARTIFACT and DEFAULT_ARTIFACT_PATH.
  artifact?: string | undefined;
  artifactPath?: string | undefined;
  // owner/name, checked by the caller. Absent: the repository the origin remote names.
  repository?: string | undefined;
}

// --tests-local: a local JUnit file, declared as a local run.
export interface TemplateTestsFromLocal {
  from: 'local';
  junit: string;
  command: string;
}

// --tests-junit: a local JUnit file, declared against a named CI record. The command line only.
export interface TemplateTestsFromJunit {
  from: 'junit';
  junit: string;
  command: string;
  workflow: string;
  job: string;
  artifact: string;
  artifactPath: string;
}

export type TemplateTests = TemplateTestsFromCi | TemplateTestsFromLocal | TemplateTestsFromJunit;

export interface TemplateRequest {
  // The directory git runs in; a relative JUnit path resolves against it.
  cwd: string;
  // The ref the pull request merges into. Absent: the remote's default branch.
  base?: string | undefined;
  tests?: TemplateTests | undefined;
  // Who reads the notes and errors: the command line's name flags, the MCP tool's name its inputs
  // (src/template/wording.ts). Required, so every caller says which it is.
  caller: Caller;
}

export interface TemplateContext {
  env: Record<string, string | undefined>;
  fetch?: typeof fetch | undefined;
  // A warning from the GitHub reader, as it happens, without the `dunstan: ` prefix.
  warn: (message: string) => void;
}

export interface TemplateRun {
  // The fence, exactly as `dunstan template` prints it on standard output.
  fence: string;
  // The notes, in order, without the `dunstan: ` prefix.
  notes: string[];
  // declared: the block carries the tests asked for. not_declared: a CI read did not settle, and
  // the block carries none. none: no tests were asked for.
  tests: 'declared' | 'not_declared' | 'none';
}

async function testsSource(
  request: TemplateRequest,
  context: TemplateContext,
): Promise<TestsSource | undefined> {
  const { cwd, tests } = request;
  if (tests === undefined) return undefined;
  if (tests.from === 'local') return { kind: 'local', junit: tests.junit, command: tests.command };
  if (tests.from === 'junit') {
    return {
      kind: 'junit',
      junit: tests.junit,
      command: tests.command,
      record: {
        workflow: tests.workflow,
        job: tests.job,
        artifact: tests.artifact,
        path: tests.artifactPath,
      },
    };
  }
  // Git first: a repository git cannot answer for is refused before anything is read.
  const head = headCommit(cwd);
  const repository = tests.repository ?? originRepository(cwd, request.caller);
  const client = new GitHubClient({
    token: context.env.GITHUB_TOKEN,
    ...(context.fetch === undefined ? {} : { fetch: context.fetch }),
    warn: context.warn,
  });
  const read = await testsFromCi(client, {
    repository,
    headCommit: head,
    command: tests.command,
    pushed: isPushed(cwd, head),
    caller: request.caller,
    record: {
      kind: 'junit',
      workflow: tests.workflow,
      job: tests.job,
      artifact: tests.artifact ?? DEFAULT_ARTIFACT,
      path: tests.artifactPath ?? DEFAULT_ARTIFACT_PATH,
    },
  });
  return { kind: 'ci', read };
}

export async function runTemplate(
  request: TemplateRequest,
  context: TemplateContext,
): Promise<TemplateRun> {
  const tests = await testsSource(request, context);
  const t = templateBlock({ cwd: request.cwd, base: request.base, tests, caller: request.caller });
  return {
    fence: renderBlock(t.block),
    notes: t.notes,
    tests:
      tests === undefined
        ? 'none'
        : tests.kind === 'ci' && tests.read.status === 'unsettled'
          ? 'not_declared'
          : 'declared',
  };
}
