// What `dunstan init` writes and prints, held byte for byte to the docs a user would otherwise copy
// from (src/init/init.test.ts): the instruction block of docs/agents.md, the workflow of
// docs/action.md's "Setup in three steps" and the upload step and recipes of docs/ci-test-records.md.
// The npm package ships no docs, so the text lives here and the docs are tested against it.

// A step's `if:` that runs it even when the job's tests failed, so a failing run still publishes.
// biome-ignore lint/suspicious/noTemplateCurlyInString: a GitHub Actions expression, literal
export const IF_NOT_CANCELLED = '        if: ${{ !cancelled() }}';

// docs/agents.md, "The instruction block": the fenced block, without its fence.
export const INSTRUCTION_BLOCK: readonly string[] = [
  '## Before you report a task done',
  '',
  '1. Commit and push your last change. Then run `dunstan template` and paste the',
  '   `dunstan-handback` block it prints into your report. It fills `headCommit` and `filesChanged`',
  "   from git; do not edit them by hand. If the pull request does not merge into the remote's",
  '   default branch, add `--base <branch>`.',
  '2. Add your test and reference claims to the block:',
  '   - tests: declare test counts from the CI JUnit record, not from a local run. After CI has',
  '     finished on your last push, run `dunstan template --tests-ci --tests-command <cmd>',
  '     --tests-workflow <workflow file> --tests-job <job name>`: it reads the counts the gate will',
  '     read (on GitLab, add `--gitlab-project <full path> --mr <iid>`; `--tests-workflow` is then',
  '     optional). If it declares no tests, its note says why; do not fill the counts in yourself. If only a',
  '     local run exists, declare it with `--tests-local <your JUnit XML file> --tests-command <cmd>`,',
  '     and say in the report that CI publishes no test record. Never state a count in prose that the',
  '     block does not declare;',
  '   - references: each issue the pull request closes (`"relation": "closes"`) or cites',
  '     (`"relation": "cites"`).',
  '3. Run `dunstan suggest --report-file <your report>`. For each claim it lists, either declare it in',
  '   the block, or reword the sentence if it is not a claim about this pull request. Do not delete a',
  '   true claim to empty the list.',
  '4. If you push again, run `dunstan template` again: a block for an old head fails `head_mismatch`.',
  '5. Never edit the block to make a check pass without changing the work. A block that declares less,',
  '   or declares what you hope rather than what you did, is a false report, not a fix.',
];

// docs/ci-test-records.md: the upload step every recipe ends with, indented as a step of a job.
export const UPLOAD_STEP: readonly string[] = [
  '      - name: Upload the test record for Dunstan',
  IF_NOT_CANCELLED,
  '        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1',
  '        with:',
  '          name: dunstan-junit',
  '          path: junit.xml',
  '          if-no-files-found: error',
];

// docs/action.md, "Setup in three steps", step 1: the workflow, with the Action pinned to PIN_PLACEHOLDER.
export const WORKFLOW_LINES: readonly string[] = [
  'name: Dunstan',
  '',
  'on:',
  '  pull_request:',
  '    types: [opened, edited, synchronize, reopened, ready_for_review]',
  '',
  'permissions:',
  '  contents: read',
  '  pull-requests: read',
  '  issues: read',
  '  deployments: read',
  '  checks: write',
  '  actions: read',
  '',
  'jobs:',
  '  handback:',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - uses: BargLabs/dunstan@<full commit SHA>',
  '        with:',
  '          report-source: pr-body',
];

// UPLOAD_STEP for a job whose commands run in `workingDirectory`, where they write `file`. The
// artifact holds that one file under its own name, which the record's `path` names.
export function uploadStep(workingDirectory?: string, file = 'junit.xml'): string[] {
  const path =
    workingDirectory === undefined || workingDirectory === ''
      ? file
      : `${workingDirectory}/${file}`;
  if (path === 'junit.xml') return [...UPLOAD_STEP];
  return UPLOAD_STEP.map((l) =>
    l === '          path: junit.xml' ? `          path: ${path}` : l,
  );
}

// The Action reference in WORKFLOW_LINES that `dunstan init` replaces with the pin it resolves.
export const PIN_PLACEHOLDER = '<full commit SHA>';

// The workflow, with the Action pinned to `pin` (a commit SHA with its tag as a comment, or a tag).
export function workflowYaml(pin: string): string {
  return `${WORKFLOW_LINES.map((l) => l.replace(PIN_PLACEHOLDER, pin)).join('\n')}\n`;
}

// The test runners docs/ci-test-records.md has a recipe for. `steps` are a job's steps that run the
// tests and write junit.xml, indented as steps, ending before UPLOAD_STEP; `{version}` stands for the
// running Dunstan's version. For a job that already runs the tests, `hint` says how to make its own
// command write junit.xml, and `after` are the steps that go after it, before UPLOAD_STEP. `direct`
// matches a workflow `run:` line that invokes the runner itself.
export interface Recipe {
  id: 'pytest' | 'jest' | 'vitest' | 'maven' | 'gradle' | 'go';
  label: string;
  heading: string;
  steps: readonly string[];
  hint: string;
  after: readonly string[];
  note?: string;
  direct: RegExp;
}

const MERGE_STEP = ['      - name: Merge the test reports', IF_NOT_CANCELLED];
const VITEST_FLAGS = '--reporter=default --reporter=junit --outputFile.junit=junit.xml';
const JEST_FLAGS = '--ci --reporters=default --reporters=jest-junit';
const GOTESTSUM = 'go run gotest.tools/gotestsum@v1.12.0 --junitfile junit.xml -- ./...';
const SUREFIRE_MERGE =
  '        run: npx -y dunstan@{version} junit-merge target/surefire-reports/TEST-*.xml --out junit.xml';
const GRADLE_MERGE =
  '        run: npx -y dunstan@{version} junit-merge build/test-results/test/*.xml --out junit.xml';

export const RECIPES: readonly Recipe[] = [
  {
    id: 'pytest',
    label: 'pytest',
    heading: 'pytest',
    steps: ['      - run: pytest --junitxml=junit.xml'],
    hint: 'add `--junitxml=junit.xml` to the pytest command',
    after: [],
    direct: /\bpytest\b/,
  },
  {
    id: 'jest',
    label: 'Jest',
    heading: 'Jest (jest-junit)',
    steps: [
      `      - run: npx jest ${JEST_FLAGS}`,
      '        env:',
      '          JEST_JUNIT_OUTPUT_NAME: junit.xml',
    ],
    hint: `add \`${JEST_FLAGS}\` to the jest command, with JEST_JUNIT_OUTPUT_NAME=junit.xml in its environment`,
    after: [],
    note: 'Add `jest-junit` as a development dependency.',
    direct: /\bjest\b/,
  },
  {
    id: 'vitest',
    label: 'Vitest',
    heading: 'Vitest',
    steps: [`      - run: npx vitest run ${VITEST_FLAGS}`],
    hint: `add \`${VITEST_FLAGS}\` to the vitest command`,
    after: [],
    direct: /\bvitest\b/,
  },
  {
    id: 'maven',
    label: 'Maven Surefire',
    heading: 'Maven Surefire',
    steps: ['      - run: mvn -B test', ...MERGE_STEP, SUREFIRE_MERGE],
    hint: 'keep the command: Surefire writes one report per test class, merged after it',
    after: [...MERGE_STEP, SUREFIRE_MERGE],
    direct: /\bmvnw?\b/,
  },
  {
    id: 'gradle',
    label: 'Gradle',
    heading: 'Gradle',
    steps: ['      - run: ./gradlew test', ...MERGE_STEP, GRADLE_MERGE],
    hint: 'keep the command: Gradle writes one report per test class, merged after it',
    after: [...MERGE_STEP, GRADLE_MERGE],
    direct: /\bgradlew?\b/,
  },
  {
    id: 'go',
    label: 'Go',
    heading: 'Go (gotestsum)',
    steps: [`      - run: ${GOTESTSUM}`],
    hint: `run the tests through gotestsum, which writes junit.xml: \`${GOTESTSUM}\``,
    after: [],
    direct: /\b(go|richgo) test\b|\bgotestsum\b/,
  },
];

// A `run:` line that runs the tests through a tool of the project's own, not the runner itself. A
// make, just or task target counts when `test` or `tests` is one of its name's parts (split at -, _
// and :) or ends it: `test-race`, `unit_tests`, `richtest`, but not `add-latest-icons`.
export const TEST_WRAPPER =
  /\b(tox|nox)\b|\b(make|just|task)\s+(?:-\S+\s+)*(?:(?:[\w:-]*[-_:])?tests?(?=[-_:\s]|$)|[\w:-]*tests?(?=\s|$))|\b(npm|pnpm|yarn|bun|turbo|nx|lerna)\b.*\btest/;

const versioned = (lines: readonly string[], version: string) =>
  lines.map((l) => l.replace('{version}', version));

export function recipeSteps(recipe: Recipe, version: string): string[] {
  return versioned(recipe.steps, version);
}

// The step that joins several JUnit files, `inputs` as the shell is to expand them, into junit.xml.
export function mergeStep(inputs: string, version: string): string[] {
  return [
    ...MERGE_STEP,
    `        run: npx -y dunstan@${version} junit-merge ${inputs} --out junit.xml`,
  ];
}

// Where a runner run in `dir` leaves its JUnit files, once its recipe is followed.
export function junitFiles(recipe: Recipe, dir: string): string {
  const at = (p: string) => (dir === '' ? p : `${dir}/${p}`);
  if (recipe.id === 'maven') return at('target/surefire-reports/TEST-*.xml');
  if (recipe.id === 'gradle') return at('build/test-results/test/*.xml');
  return at('junit.xml');
}

export function recipeAfter(recipe: Recipe, version: string): string[] {
  return versioned(recipe.after, version);
}

// The section `dunstan init` adds to a pull request template (docs/init.md).
export const PR_TEMPLATE_SECTION: readonly string[] = [
  '## Handback',
  '',
  '<!--',
  'The `dunstan` check reads a dunstan-handback block from this description and checks each claim',
  "against the pull request's record. Until a block is filled in, it concludes `failure` with",
  '`unverifiable: block_missing`.',
  '',
  'Before you say done, follow "Before you report a task done" in AGENTS.md: run `dunstan template`',
  'and replace this whole comment with the block it prints.',
  '-->',
];

// The heading `dunstan init` puts above INSTRUCTION_BLOCK in an agent instruction file, and the line
// under it that says how to run Dunstan without installing it.
export function instructionSection(version: string): string {
  return [
    ...INSTRUCTION_BLOCK.slice(0, 1),
    '',
    `Run Dunstan without installing it as \`npx -y dunstan@${version} <command>\`, for example`,
    `\`npx -y dunstan@${version} template\`.`,
    ...INSTRUCTION_BLOCK.slice(1),
  ].join('\n');
}

// GitLab (GitLab profile 0.1). The gate is Barg Labs' GitLab CI/CD component, which runs `dunstan
// check` on merge request pipelines, last (.post) and whatever came before, and fails the pipeline
// on a verdict other than pass, as the Action concludes failure. init never edits a CI
// configuration file, so it prints the include for .gitlab-ci.yml. `pin` is the component's
// release commit with its tag as a comment, or the tag.
export const GITLAB_COMPONENT = 'gitlab.com/barglabs/dunstan/dunstan';
export const GITLAB_COMPONENT_REPOSITORY = 'https://gitlab.com/barglabs/dunstan.git';

export function componentInclude(pin: string): string[] {
  return ['include:', `  - component: ${GITLAB_COMPONENT}@${pin}`];
}

// What a GitLab test job adds so its JUnit file is in its artifacts archive, where Dunstan reads it
// (profile G.3), and in GitLab's own test report. `{path}` is the file's path.
export const GITLAB_ARTIFACTS: readonly string[] = [
  '  artifacts:',
  '    when: always',
  '    paths:',
  '      - {path}',
  '    reports:',
  '      junit: {path}',
];

export const GITLAB_MR_TEMPLATE_PATH = '.gitlab/merge_request_templates/Default.md';

// PR_TEMPLATE_SECTION in GitLab's terms.
export const MR_TEMPLATE_SECTION: readonly string[] = PR_TEMPLATE_SECTION.map((l) =>
  l.replace(/pull request/g, 'merge request'),
);

// A matrix job whose legs init cannot name uploads from its first leg (`strategy.job-index` 0) as
// dunstan-junit-leg, and a job of its own, FAN_IN_JOB, uploads that file as dunstan-junit: a job
// whose name is fixed, which a tests record can name (docs/ci-test-records.md, "Limits").
// `{path}` is the leg's file, `{file}` its name, `{job}` the matrix job's id.
export const FAN_IN_JOB = 'dunstan-junit';

export const LEG_UPLOAD_STEP: readonly string[] = [
  '      - name: Upload the test record of one leg for Dunstan',
  // biome-ignore lint/suspicious/noTemplateCurlyInString: a GitHub Actions expression, literal
  '        if: ${{ !cancelled() && strategy.job-index == 0 }}',
  '        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1',
  '        with:',
  '          name: dunstan-junit-leg',
  '          path: {path}',
  '          if-no-files-found: error',
];

export const FAN_IN_LINES: readonly string[] = [
  `  ${FAN_IN_JOB}:`,
  '    needs: {job}',
  // biome-ignore lint/suspicious/noTemplateCurlyInString: a GitHub Actions expression, literal
  '    if: ${{ !cancelled() }}',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - uses: actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2',
  '        with:',
  '          name: dunstan-junit-leg',
  '      - name: Upload the test record for Dunstan',
  '        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1',
  '        with:',
  '          name: dunstan-junit',
  '          path: {file}',
  '          if-no-files-found: error',
];

// The same on GitLab: a `parallel:` job keeps its file only on its first node, and a job of its
// own collects it. `{stage}` is the parallel job's stage.
export const GITLAB_LEG_AFTER: readonly string[] = [
  '  after_script:',
  '    - \'[ "$CI_NODE_INDEX" = 1 ] || rm -f {path}\'',
];

export const GITLAB_FAN_IN_LINES: readonly string[] = [
  `${FAN_IN_JOB}:`,
  '  stage: {stage}',
  '  needs: ["{job}"]',
  '  when: always',
  '  image: alpine:3.20',
  '  script:',
  '    - test -f {path}',
  '  artifacts:',
  '    when: always',
  '    paths:',
  '      - {path}',
];

export function fill(lines: readonly string[], values: Record<string, string>): string[] {
  return lines.map((l) => l.replace(/\{(\w+)\}/g, (all, k: string) => values[k] ?? all));
}
