import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { git, isolateGit, write } from '../__tests__/git-repo.js';
import { parseRemote, resolvePin } from '../cli/init.js';
import { main } from '../cli/main.js';
import { CHECKER_VERSION } from '../record/checker.js';
import {
  componentInclude,
  FAN_IN_LINES,
  fill,
  GITLAB_ARTIFACTS,
  GITLAB_COMPONENT,
  GITLAB_FAN_IN_LINES,
  GITLAB_LEG_AFTER,
  GITLAB_MR_TEMPLATE_PATH,
  INSTRUCTION_BLOCK,
  LEG_UPLOAD_STEP,
  PIN_PLACEHOLDER,
  PR_TEMPLATE_SECTION,
  RECIPES,
  UPLOAD_STEP,
  workflowYaml,
} from './content.js';
import { detectRunners, gitlabTestJobs, junitOutput, testJobs } from './detect.js';
import { applyPlan, type InitPlan, type Pin, planInit, renderPlan, WORKFLOW_PATH } from './init.js';

isolateGit();

const doc = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const VERSION = '9.9.9';
const SHA = 'c'.repeat(40);
const PIN: Pin = { ref: `${SHA} # v${VERSION}` };

function repo(files: Record<string, string> = {}): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'dunstan-init-')));
  for (const [path, text] of Object.entries(files)) write(dir, path, text);
  return dir;
}

const change = (plan: InitPlan, path: string) => plan.files.find((f) => f.path === path);
const content = (plan: InitPlan, path: string) => {
  const f = change(plan, path);
  return f !== undefined && 'content' in f ? f.content : undefined;
};

const VITEST_REPO = {
  'package.json': JSON.stringify({
    scripts: { test: 'vitest run', lint: 'biome check .' },
    devDependencies: { vitest: '^3.0.0' },
  }),
  '.github/workflows/ci.yml': [
    'name: CI',
    'on: [pull_request]',
    'jobs:',
    '  lint:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - run: pnpm lint',
    '  test:',
    '    name: Unit tests',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '      - run: pnpm test # the suite',
    '',
  ].join('\n'),
};

describe('the text init writes is the text the docs give, byte for byte', () => {
  it('the instruction block of docs/agents.md', () => {
    const block = /^```markdown\n([\s\S]*?)^```$/m.exec(doc('docs/agents.md'))?.[1];
    expect(block).toBe(`${INSTRUCTION_BLOCK.join('\n')}\n`);
  });

  it('the workflow of docs/action.md, step 1', () => {
    const setup = doc('docs/action.md').split('## Setup in three steps')[1] ?? '';
    const yaml = /^```yaml\n([\s\S]*?)^```$/m.exec(setup)?.[1];
    expect(yaml).toBe(workflowYaml(PIN_PLACEHOLDER));
  });

  it('the upload step and each recipe of docs/ci-test-records.md', () => {
    const text = doc('docs/ci-test-records.md');
    const pinned = (s: string) => s.replace(/dunstan@\d+\.\d+\.\d+/g, 'dunstan@X');
    expect(text).toContain(`\`\`\`yaml\n${UPLOAD_STEP.join('\n')}\n\`\`\``);
    for (const recipe of RECIPES) {
      const section = text.split(`\n## ${recipe.heading}\n`)[1]?.split('\n## ')[0];
      expect(section, recipe.heading).toBeDefined();
      for (const step of recipe.steps) {
        expect(pinned(section as string), step).toContain(
          pinned(step.replace('{version}', '0.0.0')),
        );
      }
      if (recipe.note !== undefined) expect(section).toContain(recipe.note);
    }
  });

  it("the fan-in recipe of docs/ci-test-records.md's matrix limit", () => {
    const text = doc('docs/ci-test-records.md');
    const indented = (lines: string[]) => lines.map((l) => (l === '' ? '' : `  ${l}`)).join('\n');
    expect(text).toContain(indented(fill(LEG_UPLOAD_STEP, { path: 'junit.xml' })));
    expect(text).toContain(indented(fill(FAN_IN_LINES, { job: 'test', file: 'junit.xml' })));
  });

  it('the pull request template section of docs/init.md', () => {
    expect(doc('docs/init.md')).toContain(
      `\`\`\`markdown\n${PR_TEMPLATE_SECTION.join('\n')}\n\`\`\``,
    );
  });

  it('a workflow init writes has the permissions docs/action.md states', () => {
    const yaml = workflowYaml(PIN.ref);
    expect(yaml).toContain(`- uses: BargLabs/dunstan@${SHA} # v${VERSION}\n`);
    expect(yaml.replace(PIN.ref, PIN_PLACEHOLDER)).toBe(workflowYaml(PIN_PLACEHOLDER));
  });
});

describe('resolvePin', () => {
  const ls = (out: string) => () => out;

  it('pins the commit an annotated tag names, not the tag object', () => {
    const out = `${'a'.repeat(40)}\trefs/tags/v1.2.3\n${'b'.repeat(40)}\trefs/tags/v1.2.3^{}\n`;
    expect(resolvePin('1.2.3', ls(out))).toEqual({ ref: `${'b'.repeat(40)} # v1.2.3` });
  });

  it('pins a lightweight tag to its commit', () => {
    expect(resolvePin('1.2.3', ls(`${'a'.repeat(40)}\trefs/tags/v1.2.3\n`))).toEqual({
      ref: `${'a'.repeat(40)} # v1.2.3`,
    });
  });

  it('asks for the release tag of the version, with its peeled ref', () => {
    let asked: string[] = [];
    resolvePin('1.2.3', (url, refs) => {
      asked = [url, ...refs];
      return '';
    });
    expect(asked).toEqual([
      'https://github.com/BargLabs/dunstan',
      'refs/tags/v1.2.3',
      'refs/tags/v1.2.3^{}',
    ]);
  });

  it("pins the GitLab component's release tag, which has no v", () => {
    let asked: string[] = [];
    const pin = resolvePin(
      '1.2.3',
      (url, refs) => {
        asked = [url, ...refs];
        return `${'d'.repeat(40)}\trefs/tags/1.2.3\n`;
      },
      'gitlab',
    );
    expect(asked).toEqual([
      'https://gitlab.com/barglabs/dunstan.git',
      'refs/tags/1.2.3',
      'refs/tags/1.2.3^{}',
    ]);
    expect(pin).toEqual({ ref: `${'d'.repeat(40)} # 1.2.3` });
  });

  it('falls back to the tag, and says why, when there is no such tag or git fails', () => {
    expect(resolvePin('1.2.3', ls(''))).toEqual({
      ref: 'v1.2.3',
      unresolved: 'https://github.com/BargLabs/dunstan has no tag v1.2.3',
    });
    const failed = resolvePin('1.2.3', () => {
      throw new Error('fatal: unable to access\nmore');
    });
    expect(failed).toEqual({
      ref: 'v1.2.3',
      unresolved: 'git ls-remote failed (fatal: unable to access)',
    });
  });
});

describe('detection', () => {
  it('names each runner from the files at the root', () => {
    const ids = (files: Record<string, string>) =>
      detectRunners(repo(files)).map((r) => r.recipe.id);
    expect(ids({ 'pyproject.toml': '[tool.pytest.ini_options]\n' })).toEqual(['pytest']);
    expect(ids({ 'conftest.py': '' })).toEqual(['pytest']);
    expect(ids({ 'package.json': '{"devDependencies":{"jest":"29"}}' })).toEqual(['jest']);
    expect(ids({ 'package.json': '{"dependencies":{"vitest":"3"}}' })).toEqual(['vitest']);
    expect(ids({ 'pom.xml': '<project/>' })).toEqual(['maven']);
    expect(ids({ 'build.gradle.kts': '' })).toEqual(['gradle']);
    expect(ids({ 'go.mod': 'module x\n' })).toEqual(['go']);
    expect(ids({ 'package.json': 'not json' })).toEqual([]);
    expect(ids({ 'README.md': '# x\n' })).toEqual([]);
  });

  it("finds the job that runs the runner's tests, by its name, and its run line", () => {
    const dir = repo(VITEST_REPO);
    expect(testJobs(dir, detectRunners(dir))).toEqual([
      expect.objectContaining({
        workflow: '.github/workflows/ci.yml',
        jobId: 'test',
        name: 'Unit tests',
        matrix: false,
        runLine: 'pnpm test',
        uploadsRecord: false,
      }),
    ]);
  });

  it('names a job by its id without a name, and by nothing when its name is an expression', () => {
    const dir = repo({
      'go.mod': 'module x\n',
      '.github/workflows/t.yaml': [
        'jobs:',
        '    unit:',
        '        steps:',
        '            - run: go test ./...',
        '    matrixed:',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: a GitHub Actions expression, literal
        "        name: 'go ${{ matrix.go }}'",
        '        strategy:',
        '            matrix:',
        '                go: [1.22, 1.23]',
        '        steps:',
        '            - name: Test',
        '              run: go test -race ./...',
        '',
      ].join('\n'),
    });
    const jobs = testJobs(dir, detectRunners(dir));
    expect(jobs.map((j) => [j.jobId, j.name, j.matrix])).toEqual([
      ['unit', 'unit', false],
      ['matrixed', undefined, true],
    ]);
  });

  const jobsIn = (runner: Record<string, string>, steps: string[]) => {
    const dir = repo({
      ...runner,
      '.github/workflows/ci.yml': ['jobs:', '  t:', '    steps:', ...steps, ''].join('\n'),
    });
    return testJobs(dir, detectRunners(dir)).map((j) => [j.recipe.id, j.runLine, j.via]);
  };

  it('reads each line of a block scalar run, and skips a line that installs the runner', () => {
    expect(
      jobsIn({ 'conftest.py': '' }, [
        '      - run: pip install pytest pytest-cov',
        '      - run: |',
        '          export X=1',
        '          python -m pytest -q',
        '      - run: echo done',
      ]),
    ).toEqual([['pytest', 'python -m pytest -q', 'direct']]);
  });

  it('matches a tool it cannot read to the first runner found, when its line names a test', () => {
    const go = { 'go.mod': 'module x\n' };
    expect(jobsIn({ 'conftest.py': '' }, ['      - run: uv run tox run -e py312'])).toEqual([
      ['pytest', 'uv run tox run -e py312', 'unread'],
    ]);
    expect(jobsIn(go, ['      - run: PATH=$HOME/go/bin make richtest'])).toEqual([
      ['go', 'PATH=$HOME/go/bin make richtest', 'unread'],
    ]);
    expect(jobsIn(go, ['      - run: make lint'])).toEqual([]);
    expect(jobsIn(go, ['      - run: make add-latest-icons'])).toEqual([]);
    expect(jobsIn(go, ['      - run: make test-race'])).toEqual([
      ['go', 'make test-race', 'unread'],
    ]);
    expect(jobsIn(go, ['      - run: just unit_tests'])).toEqual([
      ['go', 'just unit_tests', 'unread'],
    ]);
    expect(jobsIn(go, ['      - run: nox -s tests'])).toEqual([['go', 'nox -s tests', 'unread']]);
    expect(jobsIn({ 'README.md': '' }, ['      - run: make test'])).toEqual([]);
  });

  it('reads what a package script runs, following one script into another', () => {
    const pkg = (scripts: Record<string, string>) => ({
      'package.json': JSON.stringify({ scripts, devDependencies: { jest: '29' } }),
    });
    expect(
      jobsIn(pkg({ test: 'npm run unit', unit: 'jest --silent' }), ['      - run: npm test']),
    ).toEqual([['jest', 'npm test', 'tool']]);
    expect(jobsIn(pkg({ 'test:ci': 'vitest run' }), ['      - run: pnpm test:ci'])).toEqual([
      ['vitest', 'pnpm test:ci', 'tool'],
    ]);
    expect(jobsIn(pkg({ lint: 'eslint .' }), ['      - run: pnpm lint'])).toEqual([]);
    expect(jobsIn(pkg({ test: 'turbo run test' }), ['      - run: pnpm test'])).toEqual([
      ['jest', 'pnpm test', 'unread'],
    ]);
  });

  it("reads a Makefile target's recipe, and a make it calls", () => {
    const files = {
      'go.mod': 'module x\n',
      Makefile: [
        '.PHONY: test richtest lint',
        'lint:',
        '\tgolangci-lint run',
        '',
        'richtest: install_deps',
        '\t$(info running tests)',
        '\trichgo test -v ./...',
        'ci:',
        '\t$(MAKE) richtest',
        '',
      ].join('\n'),
    };
    expect(jobsIn(files, ['      - run: PATH=$HOME/go/bin make richtest'])).toEqual([
      ['go', 'PATH=$HOME/go/bin make richtest', 'tool'],
    ]);
    expect(jobsIn(files, ['      - run: make ci'])).toEqual([['go', 'make ci', 'tool']]);
    expect(jobsIn(files, ['      - run: make lint'])).toEqual([]);
  });

  it("reads a tox environment's commands from tox.ini or pyproject.toml, else the base's", () => {
    const pyproject = {
      'pyproject.toml': [
        '[tool.tox]',
        'env_list = ["py3.12", "typing"]',
        '',
        '[tool.tox.env_run_base]',
        'description = "pytest"',
        'commands = [',
        '    ["pytest", "-v", "--basetemp={env_tmp_dir}", { replace = "posargs", extend = true }],',
        ']',
        '',
        '[tool.tox.env.typing]',
        'commands = [',
        '    ["mypy"],',
        '    ["pyright"],',
        ']',
        '',
      ].join('\n'),
    };
    expect(jobsIn(pyproject, ['      - run: uv run tox run -e typing'])).toEqual([]);
    expect(jobsIn(pyproject, ['      - run: tox -e py3.12'])).toEqual([
      ['pytest', 'tox -e py3.12', 'tool'],
    ]);
    const dir = repo({
      ...pyproject,
      '.github/workflows/ci.yml': 'jobs:\n  t:\n    steps:\n      - run: tox -e py3.12\n',
    });
    expect(testJobs(dir, detectRunners(dir))[0]?.runs).toBe('pytest -v --basetemp={env_tmp_dir}');
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a GitHub Actions expression, literal
    expect(jobsIn(pyproject, ['      - run: tox -e ${{ matrix.env }}'])).toEqual([
      // biome-ignore lint/suspicious/noTemplateCurlyInString: a GitHub Actions expression, literal
      ['pytest', 'tox -e ${{ matrix.env }}', 'tool'],
    ]);
    const ini = {
      'tox.ini':
        '[tox]\nenvlist = py\n\n[testenv]\ndeps = pytest\ncommands =\n    pytest {posargs}\n\n[testenv:lint]\ncommands = ruff check .\n',
    };
    expect(jobsIn(ini, ['      - run: tox'])).toEqual([['pytest', 'tox', 'tool']]);
    expect(jobsIn(ini, ['      - run: tox -e lint'])).toEqual([]);
  });

  it('reads a just recipe, a Taskfile task and a nox session', () => {
    const go = { 'go.mod': 'module x\n' };
    const justfile =
      'set shell := ["bash", "-c"]\n\nlint:\n    golangci-lint run\n\ntest *args:\n    @go test {{args}} ./...\n';
    expect(jobsIn({ ...go, justfile }, ['      - run: just test -v'])).toEqual([
      ['go', 'just test -v', 'tool'],
    ]);
    expect(jobsIn({ ...go, justfile }, ['      - run: just lint'])).toEqual([]);
    const taskfile =
      "version: '3'\ntasks:\n  test:\n    cmds:\n      - go test ./...\n  lint:\n    cmds:\n      - cmd: golangci-lint run\n";
    expect(jobsIn({ ...go, 'Taskfile.yml': taskfile }, ['      - run: task test'])).toEqual([
      ['go', 'task test', 'tool'],
    ]);
    expect(jobsIn({ ...go, 'Taskfile.yml': taskfile }, ['      - run: task lint'])).toEqual([]);
    const noxfile = [
      'import nox',
      '',
      '@nox.session(python=["3.11", "3.12"])',
      'def tests(session):',
      '    session.install(".[test]")',
      '    session.run("pytest", "--cov", *session.posargs)',
      '',
      '@nox.session(name="type-check")',
      'def typing(session):',
      '    session.run("mypy", "src")',
      '',
    ].join('\n');
    const py = { 'conftest.py': '', 'noxfile.py': noxfile };
    expect(jobsIn(py, ['      - run: nox -s tests'])).toEqual([['pytest', 'nox -s tests', 'tool']]);
    expect(jobsIn(py, ['      - run: nox --session type-check'])).toEqual([]);
    expect(jobsIn(py, ['      - run: nox'])).toEqual([['pytest', 'nox', 'tool']]);
  });

  it('reads the script a workspace runner runs in each package, and merges their reports', () => {
    const workspace = {
      'package.json': JSON.stringify({
        scripts: { test: 'turbo run test' },
        devDependencies: { turbo: '2' },
      }),
      'packages/a/package.json': JSON.stringify({
        scripts: { test: 'vitest run' },
        devDependencies: { vitest: '3' },
      }),
      'packages/b/package.json': JSON.stringify({
        scripts: { test: 'jest' },
        devDependencies: { jest: '29' },
      }),
      'packages/c/package.json': JSON.stringify({ scripts: { build: 'tsc' } }),
      'packages/d/package.json': JSON.stringify({
        scripts: { lint: 'eslint .', test: 'echo none' },
      }),
    };
    for (const line of [
      'pnpm test',
      'npx turbo run test --filter=...[origin/main]',
      'pnpm -r test',
      'pnpm --filter ./packages/** run test',
      'npx nx run-many -t test',
      'npx lerna run test',
      'npm test --workspaces',
      'yarn workspaces foreach -A run test',
    ]) {
      const dir = repo({
        ...workspace,
        '.github/workflows/ci.yml': `jobs:\n  t:\n    steps:\n      - run: ${line}\n`,
      });
      const [job] = testJobs(dir, detectRunners(dir));
      expect([job?.via, job?.packages?.map((p) => [p.dir, p.recipe.id, p.runs])], line).toEqual([
        'workspace',
        [
          ['packages/a', 'vitest', 'vitest run'],
          ['packages/b', 'jest', 'jest'],
        ],
      ]);
    }
    const dir = repo({
      ...workspace,
      '.github/workflows/ci.yml': 'jobs:\n  t:\n    steps:\n      - run: pnpm -r lint\n',
    });
    expect(testJobs(dir, detectRunners(dir))).toEqual([]);
    const plan = planInit(
      repo({
        ...workspace,
        '.github/workflows/ci.yml': 'jobs:\n  t:\n    steps:\n      - run: pnpm test\n',
      }),
      VERSION,
      PIN,
    );
    const ci = plan.ci.join('\n');
    expect(ci).toContain('- packages/a runs `vitest run`\n- packages/b runs `jest`');
    expect(ci).toContain(
      `        run: npx -y dunstan@${VERSION} junit-merge packages/a/junit.xml packages/b/junit.xml --out junit.xml\n${UPLOAD_STEP.join('\n')}`,
    );
    expect(ci).toContain('Add `jest-junit` as a development dependency.');
  });

  it('reads a shell script a run line runs', () => {
    const files = {
      'go.mod': 'module x\n',
      'scripts/test.sh':
        '#!/usr/bin/env bash\nset -euo pipefail\n# run the suite\ngo test \\\n  -race ./...\n',
      'scripts/lint.sh': '#!/bin/sh\ngolangci-lint run\n',
      'ci/run-tests': '#!/bin/sh\nexec go test ./...\n',
    };
    expect(jobsIn(files, ['      - run: ./scripts/test.sh'])).toEqual([
      ['go', './scripts/test.sh', 'tool'],
    ]);
    expect(jobsIn(files, ['      - run: bash scripts/test.sh -v'])).toEqual([
      ['go', 'bash scripts/test.sh -v', 'tool'],
    ]);
    expect(jobsIn(files, ['      - run: ./ci/run-tests'])).toEqual([
      ['go', './ci/run-tests', 'tool'],
    ]);
    expect(jobsIn(files, ['      - run: sh scripts/lint.sh'])).toEqual([]);
  });

  it('finds runners below the root, and reads a job in its working-directory', () => {
    const files = {
      'packages/web/package.json': JSON.stringify({
        scripts: { test: 'vitest run' },
        devDependencies: { vitest: '3' },
      }),
      'services/api/go.mod': 'module api\n',
      'node_modules/x/package.json': JSON.stringify({ devDependencies: { jest: '29' } }),
      'packages/web/fixtures/package.json': JSON.stringify({ devDependencies: { jest: '29' } }),
    };
    expect(detectRunners(repo(files)).map((r) => [r.recipe.id, r.dirs])).toEqual([
      ['vitest', ['packages/web']],
      ['go', ['services/api']],
    ]);
    const dir = repo({
      ...files,
      '.github/workflows/ci.yml': [
        'jobs:',
        '  web:',
        '    defaults:',
        '      run:',
        '        working-directory: ./packages/web',
        '    steps:',
        '      - run: pnpm test',
        '',
      ].join('\n'),
    });
    expect(testJobs(dir, detectRunners(dir))).toEqual([
      expect.objectContaining({
        recipe: expect.objectContaining({ id: 'vitest' }),
        via: 'tool',
        workingDirectory: 'packages/web',
      }),
    ]);
    const ci = planInit(dir, VERSION, PIN).ci.join('\n');
    expect(ci).toContain('          path: packages/web/junit.xml');
    expect(ci).toContain('The job runs in packages/web, so junit.xml is written there');
    expect(ci).toContain("No workflow job runs Go's tests (found in services/api).");
  });
});

describe('planInit', () => {
  it('in an empty repository: creates the workflow, AGENTS.md and the template; finds no runner', () => {
    const plan = planInit(repo(), VERSION, PIN);
    expect(plan.files.map((f) => [f.action, f.path])).toEqual([
      ['create', WORKFLOW_PATH],
      ['create', 'AGENTS.md'],
      ['create', '.github/pull_request_template.md'],
    ]);
    expect(content(plan, WORKFLOW_PATH)).toBe(workflowYaml(PIN.ref));
    const agents = content(plan, 'AGENTS.md') as string;
    expect(agents).toContain(INSTRUCTION_BLOCK.slice(1).join('\n'));
    expect(agents).toContain(`\`npx -y dunstan@${VERSION} template\``);
    expect(agents).not.toContain("step 2's tests line");
    expect(plan.ci.join('\n')).toContain('No test runner found (pytest');
  });

  it('with one test job: the tests line in AGENTS.md, and the steps to upload the record', () => {
    const plan = planInit(repo(VITEST_REPO), VERSION, PIN);
    expect(content(plan, 'AGENTS.md')).toContain(
      `npx -y dunstan@${VERSION} template --tests-ci --tests-command "pnpm test" --tests-workflow .github/workflows/ci.yml --tests-job "Unit tests"`,
    );
    const ci = plan.ci.join('\n');
    expect(ci).toContain(
      '.github/workflows/ci.yml, job `Unit tests` runs the tests through:\n\n    pnpm test\n\n' +
        'To publish the test record, make the command it runs write junit.xml: it runs `vitest run`, ' +
        'so add `--reporter=default --reporter=junit --outputFile.junit=junit.xml` to the vitest ' +
        `command, then add after that step:\n\n${UPLOAD_STEP.join('\n')}`,
    );
    expect(ci).toContain('record_producer_changed_by_pr');
  });

  it("tells a job that runs the runner itself what to add to its own command, and keeps Maven's", () => {
    const vitest = planInit(
      repo({
        ...VITEST_REPO,
        '.github/workflows/ci.yml':
          'jobs:\n  ci:\n    steps:\n      - run: pnpm vitest --coverage\n',
      }),
      VERSION,
      PIN,
    ).ci.join('\n');
    expect(vitest).toContain(
      '.github/workflows/ci.yml, job `ci` runs them with:\n\n    pnpm vitest --coverage\n\nTo publish the test record, add',
    );
    const maven = planInit(
      repo({
        'pom.xml': '<project/>',
        '.github/workflows/ci.yml': 'jobs:\n  build:\n    steps:\n      - run: ./mvnw -B verify\n',
      }),
      VERSION,
      PIN,
    ).ci.join('\n');
    expect(maven).toContain('keep the command: Surefire writes one report per test class');
    expect(maven).toContain(
      `      - name: Merge the test reports\n        if: \${{ !cancelled() }}\n        run: npx -y dunstan@${VERSION} junit-merge target/surefire-reports/TEST-*.xml --out junit.xml\n${UPLOAD_STEP.join('\n')}`,
    );
  });

  it('pins junit-merge to the running version in a Maven recipe', () => {
    const plan = planInit(repo({ 'pom.xml': '<project/>' }), VERSION, PIN);
    const ci = plan.ci.join('\n');
    expect(ci).toContain("No workflow job runs Maven Surefire's tests (found in the root)");
    expect(ci).toContain(
      `npx -y dunstan@${VERSION} junit-merge target/surefire-reports/TEST-*.xml`,
    );
  });

  const matrixPlan = (job: string[]) =>
    planInit(
      repo({
        'go.mod': 'module x\n',
        '.github/workflows/ci.yml': [
          'jobs:',
          ...job,
          '    steps:',
          '      - run: go test ./...',
          '',
        ].join('\n'),
      }),
      VERSION,
      PIN,
    );

  it("with a matrix job: uploads from its first leg, and declares that leg's job name", () => {
    const plan = matrixPlan([
      '  test:',
      '    strategy:',
      '      matrix:',
      '        os: [ubuntu-latest, macos-latest]',
      '        python:',
      "          - '3.12'",
      '          - 3.10',
      '        exclude:',
      '          - os: ubuntu-latest',
      "            python: '3.12'",
    ]);
    expect(content(plan, 'AGENTS.md')).toContain('--tests-job "test (ubuntu-latest, 3.1)"');
    const ci = plan.ci.join('\n');
    expect(ci).toContain(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: a GitHub Actions expression, literal
      "        if: ${{ !cancelled() && matrix.os == 'ubuntu-latest' && matrix.python == 3.1 }}",
    );
    expect(ci).toContain('the upload runs on one leg, `test (ubuntu-latest, 3.1)`');
  });

  it("names a matrix leg by the job's name, with its matrix values put in", () => {
    const plan = matrixPlan([
      '  test:',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: a GitHub Actions expression, literal
      "    name: 'go ${{ matrix.go }} on ${{ matrix.os }}'",
      '    strategy:',
      '      matrix:',
      '        go: [1.22, 1.23]',
      '        os: [ubuntu]',
    ]);
    expect(content(plan, 'AGENTS.md')).toContain('--tests-job "go 1.22 on ubuntu"');
    const named = matrixPlan([
      '  test:',
      '    name: Unit',
      '    strategy:',
      '      matrix:',
      '        os: [a]',
    ]);
    expect(content(named, 'AGENTS.md')).toContain('--tests-job "Unit (a)"');
  });

  it('with a matrix whose legs it cannot name: the first leg uploads, and a fan-in job of its own', () => {
    const plan = matrixPlan([
      '  test:',
      '    strategy:',
      '      matrix:',
      '        os: [a, b]',
      '        include:',
      '          - os: c',
    ]);
    expect(content(plan, 'AGENTS.md')).toContain(
      '--tests-workflow .github/workflows/ci.yml --tests-job dunstan-junit',
    );
    const ci = plan.ci.join('\n');
    expect(ci).toContain(fill(LEG_UPLOAD_STEP, { path: 'junit.xml' }).join('\n'));
    expect(ci).toContain(fill(FAN_IN_LINES, { job: 'test', file: 'junit.xml' }).join('\n'));
    const expression = matrixPlan([
      '  test:',
      '    strategy:',
      '      matrix:',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: a GitHub Actions expression, literal
      '        os: ${{ fromJSON(needs.setup.outputs.os) }}',
    ]);
    expect(content(expression, 'AGENTS.md')).toContain('--tests-job dunstan-junit');
  });

  it('with a job that already uploads the record: nothing to add', () => {
    const dir = repo({
      ...VITEST_REPO,
      '.github/workflows/ci.yml': `${VITEST_REPO['.github/workflows/ci.yml']}      - uses: actions/upload-artifact@v4\n        with:\n          name: dunstan-junit\n`,
    });
    const ci = planInit(dir, VERSION, PIN).ci.join('\n');
    expect(ci).toContain('already uploads dunstan-junit: nothing to add.');
    expect(ci).not.toContain('record_producer_changed_by_pr');
  });

  it('skips what is already there, and appends to agent files that exist without dunstan', () => {
    const plan = planInit(
      repo({
        '.github/workflows/gate.yml':
          'jobs:\n  h:\n    steps:\n      - uses: BargLabs/dunstan@abc\n',
        'AGENTS.md': '# Agents\n\nRun `dunstan template` before done.\n',
        'CLAUDE.md': '# Claude\n',
        '.github/copilot-instructions.md': 'Be brief.',
        '.github/PULL_REQUEST_TEMPLATE/feature.md': '## What\n',
      }),
      VERSION,
      PIN,
    );
    expect(plan.files.map((f) => [f.action, f.path])).toEqual([
      ['skip', WORKFLOW_PATH],
      ['skip', 'AGENTS.md'],
      ['append', 'CLAUDE.md'],
      ['append', '.github/copilot-instructions.md'],
      ['print', '.github/PULL_REQUEST_TEMPLATE'],
    ]);
    expect(change(plan, WORKFLOW_PATH)).toMatchObject({
      reason: '.github/workflows/gate.yml already runs the Action',
    });
  });

  it('says when the pin is a tag', () => {
    const plan = planInit(repo(), VERSION, { ref: 'v9.9.9', unresolved: 'offline' });
    expect(content(plan, WORKFLOW_PATH)).toContain('- uses: BargLabs/dunstan@v9.9.9\n');
    expect(plan.notes.join('\n')).toContain(
      'pins the Action to a tag: offline. Pin a full commit SHA.',
    );
  });
});

describe('a JUnit file the job already writes', () => {
  it('is read from the runner flags that write one, never from a variable', () => {
    expect(junitOutput('pytest -q --junitxml=out/report.xml')).toBe('out/report.xml');
    expect(junitOutput('gotestsum --junitfile "./unit.xml" -- ./...')).toBe('unit.xml');
    expect(junitOutput('vitest run --outputFile.junit=./reports/j.xml')).toBe('reports/j.xml');
    expect(junitOutput('pytest --junit-xml $OUT')).toBeUndefined();
    expect(junitOutput('pytest')).toBeUndefined();
  });

  it('on GitHub: uploads that file, and names it as the artifact path', () => {
    const plan = planInit(
      repo({
        'conftest.py': '',
        '.github/workflows/ci.yml':
          'jobs:\n  t:\n    defaults:\n      run:\n        working-directory: py\n    steps:\n      - run: pytest --junitxml=out/report.xml\n',
      }),
      VERSION,
      PIN,
    );
    expect(content(plan, 'AGENTS.md')).toContain('--tests-job t --tests-artifact-path report.xml');
    const ci = plan.ci.join('\n');
    expect(ci).toContain('keep it: it already writes out/report.xml');
    expect(ci).toContain('          path: py/out/report.xml');
  });
});

describe('applyPlan', () => {
  it('writes the plan, appends after a blank line, and a second plan skips everything', () => {
    const dir = repo({ ...VITEST_REPO, 'CLAUDE.md': '# Claude' });
    applyPlan(dir, planInit(dir, VERSION, PIN));
    expect(readFileSync(join(dir, WORKFLOW_PATH), 'utf8')).toBe(workflowYaml(PIN.ref));
    expect(readFileSync(join(dir, 'CLAUDE.md'), 'utf8')).toMatch(
      /^# Claude\n\n## Before you report a task done\n/,
    );
    expect(readFileSync(join(dir, '.github/pull_request_template.md'), 'utf8')).toBe(
      `${PR_TEMPLATE_SECTION.join('\n')}\n`,
    );
    const again = planInit(dir, VERSION, PIN);
    expect(again.files.every((f) => f.action === 'skip')).toBe(true);
  });

  it('never overwrites a file that appeared after the plan', () => {
    const dir = repo();
    const plan = planInit(dir, VERSION, PIN);
    write(dir, 'AGENTS.md', 'mine\n');
    expect(() => applyPlan(dir, plan)).toThrow(/EEXIST/);
    expect(readFileSync(join(dir, 'AGENTS.md'), 'utf8')).toBe('mine\n');
  });

  it('renders a dry run with every file it would write, and a written run without them', () => {
    const plan = planInit(repo(), VERSION, PIN);
    const dry = renderPlan(plan, false);
    expect(dry).toContain('nothing is written until you run dunstan init --write');
    expect(dry).toContain(`--- create ${WORKFLOW_PATH}\n${workflowYaml(PIN.ref).trimEnd()}\n---`);
    const done = renderPlan(plan, true);
    expect(done).toContain(`  created ${WORKFLOW_PATH}`);
    expect(done).not.toContain('--- create');
  });
});

describe('dunstan init', () => {
  async function run(argv: string[], cwd: string) {
    let out = '';
    let err = '';
    const code = await main(argv, {
      out: (t) => {
        out += t;
      },
      err: (t) => {
        err += t;
      },
      env: {},
      artifact: import.meta.url,
      readStdin: () => new Uint8Array(),
      cwd,
      lsRemote: (_url, refs) => refs.map((r) => `${SHA}\t${r}`).join('\n'),
    });
    return { code, out, err };
  }

  function gitRepo(): string {
    const dir = repo(VITEST_REPO);
    git(dir, 'init', '-q', '-b', 'main');
    mkdirSync(join(dir, 'sub'));
    return dir;
  }

  it('prints the plan at the repository root and writes nothing', async () => {
    const dir = gitRepo();
    const r = await run(['init'], join(dir, 'sub'));
    expect(r.code).toBe(0);
    expect(r.out).toContain(`dunstan init: ${dir}\n`);
    expect(r.out).toContain(`- uses: BargLabs/dunstan@${SHA} # v${CHECKER_VERSION}`);
    expect(existsSync(join(dir, WORKFLOW_PATH))).toBe(false);
    expect(existsSync(join(dir, 'AGENTS.md'))).toBe(false);
  });

  it('writes the plan with --write', async () => {
    const dir = gitRepo();
    const r = await run(['init', '--write'], dir);
    expect(r.code).toBe(0);
    expect(readFileSync(join(dir, WORKFLOW_PATH), 'utf8')).toContain(`dunstan@${SHA}`);
    expect(readFileSync(join(dir, 'AGENTS.md'), 'utf8')).toContain('--tests-job "Unit tests"');
  });

  it('sets up GitLab when origin is on a GitLab host, with its project path', async () => {
    const dir = repo({ 'conftest.py': '', '.gitlab-ci.yml': 'unit:\n  script:\n    - pytest\n' });
    git(dir, 'init', '-q', '-b', 'main');
    git(dir, 'remote', 'add', 'origin', 'git@gitlab.example.com:group/proj.git');
    const r = await run(['init'], dir);
    expect(r.code).toBe(0);
    expect(r.out).toContain(`  - component: ${GITLAB_COMPONENT}@${SHA} # ${CHECKER_VERSION}`);
    expect(r.out).toContain(
      '--gitlab-project group/proj --mr <iid> --gitlab-host gitlab.example.com',
    );
    expect((await run(['init', '--forge', 'github'], dir)).out).toContain(
      'create .github/workflows/dunstan.yml',
    );
    expect((await run(['init', '--forge', 'bitbucket'], dir)).code).toBe(3);
  });

  it('exits 3 outside a git repository, and on an unknown flag', async () => {
    const outside = await run(['init'], repo());
    expect(outside.code).toBe(3);
    expect(outside.err).toContain('is not in a git repository');
    expect((await run(['init', '--force'], gitRepo())).code).toBe(3);
  });
});

describe('GitLab (profile 0.1)', () => {
  const GITLAB_CI_YML = [
    'stages: [build, test]',
    'variables:',
    '  NODE_ENV: test',
    'include:',
    '  - local: ci/other.yml',
    '.base:',
    '  image: python:3.12',
    'lint:',
    '  stage: test',
    '  script: ruff check .',
    'unit tests:',
    '  extends: .base',
    '  stage: test',
    '  before_script:',
    '    - pip install pytest',
    '  script:',
    '    - |',
    '      export X=1',
    '      python -m pytest -q',
    'matrix:',
    '  parallel:',
    '    matrix:',
    '      - PY: ["3.11", "3.12"]',
    '  script:',
    '    - pytest',
    '',
  ].join('\n');

  it('picks GitLab for a checkout with .gitlab-ci.yml and no GitHub workflows, unless told', () => {
    expect(planInit(repo({ '.gitlab-ci.yml': 'x:\n  script: [a]\n' }), VERSION, PIN).forge).toBe(
      'gitlab',
    );
    const both = { '.gitlab-ci.yml': '', '.github/workflows/ci.yml': 'jobs:\n' };
    expect(planInit(repo(both), VERSION, PIN).forge).toBe('github');
    expect(planInit(repo(both), VERSION, PIN, { forge: 'gitlab' }).forge).toBe('gitlab');
  });

  it("reads .gitlab-ci.yml's jobs: script items and block scalars, never keywords or hidden jobs", () => {
    const dir = repo({ 'conftest.py': '', '.gitlab-ci.yml': GITLAB_CI_YML });
    expect(
      gitlabTestJobs(dir, detectRunners(dir)).map((j) => [
        j.jobId,
        j.name,
        j.runLine,
        j.via,
        j.matrix,
      ]),
    ).toEqual([
      ['unit tests', 'unit tests', 'python -m pytest -q', 'direct', false],
      ['matrix', undefined, 'pytest', 'direct', true],
    ]);
  });

  it('plans the component include, the agent instructions, the merge request template and the CI changes', () => {
    const dir = repo({
      'conftest.py': '',
      '.gitlab-ci.yml': GITLAB_CI_YML.replace(/^matrix:[\s\S]*$/m, ''),
    });
    const plan = planInit(dir, VERSION, PIN, {
      gitlabProject: 'group/sub/proj',
      gitlabHost: 'gitlab.example.com',
    });
    expect(plan.files.map((f) => [f.action, f.path])).toEqual([
      ['create', 'AGENTS.md'],
      ['create', GITLAB_MR_TEMPLATE_PATH],
    ]);
    expect(content(plan, 'AGENTS.md')).toContain(
      `npx -y dunstan@${VERSION} template --tests-ci --gitlab-project group/sub/proj --mr <iid> --gitlab-host gitlab.example.com --tests-command "python -m pytest -q" --tests-job "unit tests"`,
    );
    expect(content(plan, GITLAB_MR_TEMPLATE_PATH)).toContain("against the merge request's record");
    const ci = plan.ci.join('\n');
    expect(ci).toContain(
      `Add to .gitlab-ci.yml, under its include:, these lines: Dunstan's GitLab CI/CD\ncomponent, the gate.\n\n  - component: ${GITLAB_COMPONENT}@${PIN.ref}`,
    );
    expect(ci).toContain('.gitlab-ci.yml, job `unit tests` runs them with:');
    expect(ci).toContain(
      `${GITLAB_ARTIFACTS.map((l) => l.replaceAll('{path}', 'junit.xml')).join('\n')}`,
    );
    expect(ci).toContain('merge request of its own');
    expect(plan.notes.join('\n')).toContain('GITLAB_TOKEN');
    expect(renderPlan(plan, false)).toContain('CI (init never edits a CI configuration file):');
  });

  it('merges Maven reports in after_script, and gives a whole job for a runner no job runs', () => {
    const plan = planInit(
      repo({
        'pom.xml': '<project/>',
        'web/package.json': JSON.stringify({ devDependencies: { jest: '29' } }),
        '.gitlab-ci.yml': 'build:\n  script:\n    - mvn -B verify\n',
      }),
      VERSION,
      PIN,
    );
    const ci = plan.ci.join('\n');
    expect(ci).toContain(
      `  after_script:\n    - npx -y dunstan@${VERSION} junit-merge target/surefire-reports/TEST-*.xml --out junit.xml`,
    );
    expect(ci).toContain("The merge runs npx: the job's image needs Node.");
    expect(ci).toContain(
      "No job in .gitlab-ci.yml runs Jest's tests (found in web). A job that runs them and\nkeeps the record:\n\ntest:\n  variables:\n    JEST_JUNIT_OUTPUT_NAME: junit.xml\n  script:\n    - npx jest --ci --reporters=default --reporters=jest-junit",
    );
  });

  it('says nothing of the gate when the component is included, and to create .gitlab-ci.yml when absent', () => {
    const running = planInit(
      repo({
        '.gitlab-ci.yml': `include:\n  - component: ${GITLAB_COMPONENT}@0.1.21\nt:\n  script: [go test ./...]\n`,
      }),
      VERSION,
      PIN,
    );
    expect(running.ci.join('\n')).not.toContain('component, the gate');
    const none = planInit(repo(), VERSION, PIN, { forge: 'gitlab' });
    expect(none.ci.join('\n')).toContain(
      'Create .gitlab-ci.yml with your build and test jobs and these lines. GitLab runs no pipeline',
    );
  });

  it("reads included files, a job named with a colon, a Makefile's variables and prerequisites", () => {
    const dir = repo({
      'go.mod': 'module x\n',
      Makefile: [
        'ifdef HASGOTESTSUM',
        '    GOTEST=bin/gotestsum',
        'endif',
        'test: TEST_FORMAT ?= short',
        'test: bin/gotestsum ## Run tests',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: a Makefile variable, literal
        '\t$(GOTEST) --junitfile ./coverage-unit.xml --format ${TEST_FORMAT} -- ./...',
        '',
        'test-race: GOARGS += -race',
        'test-race: test',
        '',
        'bin/gotestsum:',
        '\tgo build -o bin/gotestsum gotest.tools/gotestsum',
        '',
      ].join('\n'),
      '.gitlab-ci.yml': [
        'include:',
        '  - template: Jobs/SAST.gitlab-ci.yml',
        '  - local: .gitlab/ci/tests.gitlab-ci.yml',
        '  - project: other/group',
        '    file: x.yml',
        'stages: [test]',
        '',
      ].join('\n'),
      '.gitlab/ci/tests.gitlab-ci.yml': [
        'tests:unit:',
        '  script:',
        '    - make test-race',
        '  artifacts:',
        '    when: always',
        '    paths:',
        '      - coverage-unit.txt',
        '    reports:',
        '      junit: coverage-unit.xml',
        '',
      ].join('\n'),
    });
    const [job] = gitlabTestJobs(dir, detectRunners(dir));
    expect(job).toMatchObject({
      workflow: '.gitlab/ci/tests.gitlab-ci.yml',
      jobId: 'tests:unit',
      via: 'tool',
      runs: 'bin/gotestsum --junitfile ./coverage-unit.xml --format short -- ./...',
      junit: 'coverage-unit.xml',
      uploadsRecord: false,
    });
    const plan = planInit(dir, VERSION, PIN, { gitlabProject: 'g/p' });
    expect(content(plan, 'AGENTS.md')).toContain(
      '--tests-command "make test-race" --tests-job tests:unit --tests-path coverage-unit.xml',
    );
    const ci = plan.ci.join('\n');
    expect(ci).toContain(
      'To publish the test record, keep it: it already writes coverage-unit.xml, then add to the job:',
    );
    expect(ci).toContain(
      '    paths:\n      - coverage-unit.xml\n    reports:\n      junit: coverage-unit.xml',
    );
    expect(ci).not.toContain('after_script');
  });

  it('knows a job that already keeps the file it writes', () => {
    const dir = repo({
      'conftest.py': '',
      '.gitlab-ci.yml':
        'unit:\n  script:\n    - pytest --junitxml=report.xml\n  artifacts:\n    paths: [report.xml]\n',
    });
    expect(planInit(dir, VERSION, PIN).ci.join('\n')).toContain(
      'already keeps a JUnit file in its artifacts: nothing to add.',
    );
  });

  it('collects the report of a parallel job through a fan-in job of its own', () => {
    const plan = planInit(
      repo({
        'conftest.py': '',
        '.gitlab-ci.yml': [
          'unit:',
          '  stage: verify',
          '  parallel:',
          '    matrix:',
          '      - PY: ["3.11", "3.12"]',
          '  script:',
          '    - pytest --junitxml=report.xml',
          '',
        ].join('\n'),
      }),
      VERSION,
      PIN,
      { gitlabProject: 'g/p' },
    );
    expect(content(plan, 'AGENTS.md')).toContain(
      '--tests-job dunstan-junit --tests-path report.xml',
    );
    const ci = plan.ci.join('\n');
    expect(ci).toContain(
      `${fill(GITLAB_LEG_AFTER, { path: 'report.xml' }).join('\n')}\n  artifacts:`,
    );
    expect(ci).toContain(
      fill(GITLAB_FAN_IN_LINES, { job: 'unit', stage: 'verify', path: 'report.xml' }).join('\n'),
    );
  });

  it('reads the host and project path of an origin remote', () => {
    expect(parseRemote('git@gitlab.com:group/sub/proj.git')).toEqual({
      host: 'gitlab.com',
      path: 'group/sub/proj',
    });
    expect(parseRemote('https://gitlab.example.com/group/proj')).toEqual({
      host: 'gitlab.example.com',
      path: 'group/proj',
    });
    expect(parseRemote('ssh://git@gitlab.example.com:2222/group/proj.git/')).toEqual({
      host: 'gitlab.example.com',
      path: 'group/proj',
    });
    expect(parseRemote('https://github.com/example-org/example-repo.git')).toEqual({
      host: 'github.com',
      path: 'example-org/example-repo',
    });
    expect(parseRemote('/local/path')).toBeUndefined();
  });

  it('the include of docs/init.md is the one init prints', () => {
    expect(doc('docs/init.md')).toContain(
      `\`\`\`yaml\n${componentInclude('<commit> # <version>').join('\n')}\n\`\`\``,
    );
  });
});
