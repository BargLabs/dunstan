// `dunstan init`: sets a repository up for Dunstan. It plans, and with `write` makes, three kinds of
// change, each only where nothing of Dunstan is there yet:
//
// - creates .github/workflows/dunstan.yml, the Action pinned to a commit (docs/action.md, step 1);
// - adds the instruction block (docs/agents.md) to AGENTS.md, created if absent, and to CLAUDE.md and
//   .github/copilot-instructions.md where they exist;
// - adds a Handback section to the pull request template, created if absent.
//
// On GitLab (GitLab profile 0.1) the gate is Dunstan's GitLab CI/CD component, which .gitlab-ci.yml
// is told to include, and the template is the merge request template.
//
// It never edits a workflow or a CI configuration file. For each job that runs a test runner docs/ci-test-records.md has a
// recipe for, it prints the steps that write and upload the JUnit record. Nothing it does reads the
// network but the Action's pin, which the caller resolves (src/cli/init.ts), and nothing it writes is
// a claim, a block or a record.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  componentInclude,
  FAN_IN_JOB,
  FAN_IN_LINES,
  fill,
  GITLAB_ARTIFACTS,
  GITLAB_FAN_IN_LINES,
  GITLAB_LEG_AFTER,
  GITLAB_MR_TEMPLATE_PATH,
  IF_NOT_CANCELLED,
  instructionSection,
  junitFiles,
  LEG_UPLOAD_STEP,
  MR_TEMPLATE_SECTION,
  mergeStep,
  PR_TEMPLATE_SECTION,
  recipeAfter,
  recipeSteps,
  uploadStep,
  workflowYaml,
} from './content.js';
import {
  detectRunners,
  GITLAB_CI,
  gitlabRunsDunstan,
  gitlabTestJobs,
  type Runner,
  runsDunstan,
  testJobs,
  type WorkflowJob,
} from './detect.js';

export type FileChange =
  | { path: string; action: 'create' | 'append'; content: string }
  | { path: string; action: 'skip'; reason: string }
  | { path: string; action: 'print'; reason: string; content: string };

export interface InitPlan {
  forge: Forge;
  files: FileChange[];
  // What to change in CI, printed: init never edits a workflow.
  ci: string[];
  // Lines printed after everything else.
  notes: string[];
}

export type Forge = 'github' | 'gitlab';

export interface InitOptions {
  // Which forge to set up; by default GitLab when the checkout has .gitlab-ci.yml and no GitHub
  // workflows, else GitHub. The caller also decides from the remote (src/cli/init.ts).
  forge?: Forge;
  // A GitLab project's full path and host, for the --tests-ci line, from the remote.
  gitlabProject?: string;
  gitlabHost?: string;
}

export interface Pin {
  // What follows `BargLabs/dunstan@` in the workflow.
  ref: string;
  // Why the pin is a tag and not a commit, when it is.
  unresolved?: string;
}

export const WORKFLOW_PATH = '.github/workflows/dunstan.yml';
export const AGENT_FILES = ['AGENTS.md', 'CLAUDE.md', '.github/copilot-instructions.md'] as const;
export const PR_TEMPLATE_PATH = '.github/pull_request_template.md';
// Where GitHub looks for a pull request template, besides PR_TEMPLATE_PATH.
const PR_TEMPLATE_PLACES = [
  PR_TEMPLATE_PATH,
  '.github/PULL_REQUEST_TEMPLATE.md',
  'pull_request_template.md',
  'PULL_REQUEST_TEMPLATE.md',
  'docs/pull_request_template.md',
  'docs/PULL_REQUEST_TEMPLATE.md',
  '.github/PULL_REQUEST_TEMPLATE',
];

const DUNSTAN_TEXT = /dunstan-handback|dunstan template/;

function readText(dir: string, path: string): string | undefined {
  try {
    return readFileSync(join(dir, path), 'utf8');
  } catch {
    return undefined;
  }
}

const quote = (s: string) => (/^[\w./:-]+$/.test(s) ? s : `"${s.replace(/(["\\$`])/g, '\\$1')}"`);

// Whether a matrix job's record comes through FAN_IN_JOB: a GitHub matrix init cannot name a leg
// of, or any GitLab `parallel:` job.
function fansIn(job: WorkflowJob, gitlab: boolean): boolean {
  return job.matrix && (gitlab || job.leg === undefined);
}

// The `--tests-ci` line for a job that runs the tests, or undefined when the job's name is an
// expression a run resolves (a matrix job's name carries its values).
export function testsCiLine(
  job: WorkflowJob,
  version: string,
  options: InitOptions = {},
): string | undefined {
  const name = fansIn(job, options.forge === 'gitlab')
    ? FAN_IN_JOB
    : job.matrix
      ? job.leg?.name
      : job.name;
  if (name === undefined) return undefined;
  const command = `--tests-command ${quote(job.runLine)}`;
  const file = job.junit?.split('/').at(-1);
  if (options.forge === 'gitlab') {
    const host = options.gitlabHost;
    return [
      `npx -y dunstan@${version} template --tests-ci`,
      `--gitlab-project ${quote(options.gitlabProject ?? '<namespace/project>')} --mr <iid>`,
      ...(host === undefined || host === 'gitlab.com' ? [] : [`--gitlab-host ${quote(host)}`]),
      command,
      `--tests-job ${quote(name)}`,
      ...(job.junit === undefined || job.junit === 'junit.xml'
        ? []
        : [`--tests-path ${quote(job.junit)}`]),
    ].join(' ');
  }
  return [
    `npx -y dunstan@${version} template --tests-ci`,
    command,
    `--tests-workflow ${quote(job.workflow)}`,
    `--tests-job ${quote(name)}`,
    ...(file === undefined || file === 'junit.xml' ? [] : [`--tests-artifact-path ${quote(file)}`]),
  ].join(' ');
}

function agentSection(version: string, jobs: WorkflowJob[], options: InitOptions): string {
  const lines = [instructionSection(version)];
  const only = jobs.length === 1 ? jobs[0] : undefined;
  const ci = only === undefined ? undefined : testsCiLine(only, version, options);
  if (ci !== undefined) {
    lines.push(
      '',
      "In this repository, step 2's tests line is, once CI has finished on your last push:",
      '',
      '```sh',
      ci,
      '```',
    );
    if (options.forge === 'gitlab') lines.push('', "`<iid>` is the merge request's number.");
  }
  return lines.join('\n');
}

// The upload step of a job: in its working-directory, and for a matrix job, from its first leg only.
function jobUpload(job: WorkflowJob, path?: string): string[] {
  if (fansIn(job, false)) {
    const at = path ?? job.workingDirectory;
    const file = (path === undefined ? job.junit : undefined) ?? 'junit.xml';
    return fill(LEG_UPLOAD_STEP, { path: at === undefined || at === '' ? file : `${at}/${file}` });
  }
  const steps = uploadStep(
    path ?? job.workingDirectory,
    path === undefined ? job.junit : undefined,
  );
  if (job.leg === undefined) return steps;
  const legIs = job.leg.values
    .map(
      ({ key, value, number }) =>
        `matrix.${key} == ${number ? value : `'${value.replace(/'/g, "''")}'`}`,
    )
    .join(' && ');
  return steps.map((l) =>
    l === IF_NOT_CANCELLED ? `        if: \${{ !cancelled() && ${legIs} }}` : l,
  );
}

function ciSteps(job: WorkflowJob, version: string): string[] {
  const where = `${job.workflow}, job \`${job.name ?? job.jobId}\``;
  if (job.uploadsRecord) {
    return [`${where} already uploads dunstan-junit: nothing to add.`];
  }
  const recipe = job.recipe;
  let out: string[];
  if (job.via === 'workspace') {
    const packages = job.packages ?? [];
    const recipes = [...new Map(packages.map((p) => [p.recipe.id, p.recipe])).values()];
    out = [
      `${where} runs the tests in each workspace package through:`,
      '',
      `    ${job.runLine}`,
      '',
      ...packages.map((p) => `- ${p.dir} runs \`${p.runs}\``),
      '',
      'To publish the test record, make each package write its JUnit report in its own directory',
      `(${recipes.map((r) => `${r.label}: ${r.hint}`).join('; ')}), then add after that step:`,
      '',
      ...mergeStep(packages.map((p) => junitFiles(p.recipe, p.dir)).join(' '), version),
      ...jobUpload(job, ''),
    ];
    for (const r of recipes) if (r.note !== undefined) out.push('', r.note);
  } else {
    const how =
      job.junit !== undefined
        ? `keep it: it already writes ${job.junit}`
        : {
            direct: recipe.hint,
            tool: `make the command it runs write junit.xml: it runs \`${job.runs}\`, so ${recipe.hint}`,
            unread: `make that command write junit.xml (init could not read what it runs; for ${recipe.label}: ${recipe.hint})`,
          }[job.via as 'direct' | 'tool' | 'unread'];
    out = [
      `${where} runs ${job.via === 'direct' ? 'them with' : 'the tests through'}:`,
      '',
      `    ${job.runLine}`,
      '',
      `To publish the test record, ${how}, then add after that step:`,
      '',
      ...(job.junit === undefined ? recipeAfter(recipe, version) : []),
      ...jobUpload(job),
    ];
    if (job.workingDirectory !== undefined) {
      out.push(
        '',
        `The job runs in ${job.workingDirectory}, so ${job.junit ?? 'junit.xml'} is written there: run the steps`,
        `above there too, and the upload names ${job.workingDirectory}/${job.junit ?? 'junit.xml'}.`,
      );
    }
    if (recipe.note !== undefined) out.push('', recipe.note);
  }
  if (job.leg !== undefined) {
    out.push(
      '',
      `This job has a matrix: the upload runs on one leg, \`${job.leg.name ?? 'its first'}\`, so the run holds one`,
      'dunstan-junit artifact. Two artifacts of one name in one run make the record unreadable.',
    );
  } else if (job.matrix) {
    const file =
      (job.via === 'workspace' ? undefined : job.junit)?.split('/').at(-1) ?? 'junit.xml';
    out.push(
      '',
      'This job has a matrix whose legs init cannot name (an include, an expression or a mapping), so',
      `its first leg uploads its report as dunstan-junit-leg, and a job of its own, \`${FAN_IN_JOB}\`, whose`,
      'name a tests record can give, uploads it as dunstan-junit. Add this job to the workflow:',
      '',
      ...fill(FAN_IN_LINES, { job: job.jobId, file }),
    );
  }
  return out;
}

function recipeWithoutJob({ recipe, dirs }: Runner, version: string): string[] {
  const where = dirs.map((d) => (d === '' ? 'the root' : d)).join(', ');
  return [
    `No workflow job runs ${recipe.label}'s tests (found in ${where}). A job that runs them and`,
    'uploads the record ends with:',
    '',
    ...recipeSteps(recipe, version),
    ...uploadStep(),
  ];
}

// ------------------------------------------------------------------ GitLab

const artifacts = (path: string) => GITLAB_ARTIFACTS.map((l) => l.replaceAll('{path}', path));
const scriptOf = (step: string) => step.replace(/^\s*(?:- )?run:\s*/, '');

function gitlabAfter(files: string, version: string): string[] {
  return [
    '  after_script:',
    `    - npx -y dunstan@${version} junit-merge ${files} --out junit.xml`,
  ];
}

function gitlabCiSteps(job: WorkflowJob, version: string): string[] {
  const where = `${job.workflow}, job \`${job.jobId}\``;
  if (job.uploadsRecord)
    return [`${where} already keeps a JUnit file in its artifacts: nothing to add.`];
  const recipe = job.recipe;
  const out: string[] = [];
  let merge: string | undefined;
  if (job.via === 'workspace') {
    const packages = job.packages ?? [];
    const recipes = [...new Map(packages.map((p) => [p.recipe.id, p.recipe])).values()];
    out.push(
      `${where} runs the tests in each workspace package through:`,
      '',
      `    ${job.runLine}`,
      '',
      ...packages.map((p) => `- ${p.dir} runs \`${p.runs}\``),
      '',
      'To publish the test record, make each package write its JUnit report in its own directory',
      `(${recipes.map((r) => `${r.label}: ${r.hint}`).join('; ')}), then add to the job:`,
    );
    merge = packages.map((p) => junitFiles(p.recipe, p.dir)).join(' ');
    for (const r of recipes) if (r.note !== undefined) out.push('', r.note);
  } else {
    const how =
      job.junit !== undefined
        ? `keep it: it already writes ${job.junit}`
        : {
            direct: recipe.hint,
            tool: `make the command it runs write junit.xml: it runs \`${job.runs}\`, so ${recipe.hint}`,
            unread: `make that command write junit.xml (init could not read what it runs; for ${recipe.label}: ${recipe.hint})`,
          }[job.via as 'direct' | 'tool' | 'unread'];
    out.push(
      `${where} runs ${job.via === 'direct' ? 'them with' : 'the tests through'}:`,
      '',
      `    ${job.runLine}`,
      '',
      `To publish the test record, ${how}, then add to the job:`,
    );
    if (recipe.after.length > 0 && job.junit === undefined) merge = junitFiles(recipe, '');
    if (recipe.note !== undefined) out.push('', recipe.note);
  }
  const path = (job.via === 'workspace' ? undefined : job.junit) ?? 'junit.xml';
  const after = merge === undefined ? [] : gitlabAfter(merge, version);
  const leg = job.matrix ? fill(GITLAB_LEG_AFTER, { path }) : [];
  out.push('', ...(after.length > 0 ? [...after, ...leg.slice(1)] : leg), ...artifacts(path));
  if (merge !== undefined) out.push('', "The merge runs npx: the job's image needs Node.");
  if (job.matrix) {
    out.push(
      '',
      'This job runs in parallel, and each of its jobs is named by its values: its first job keeps the',
      `report, and a job of its own, \`${FAN_IN_JOB}\`, whose name a tests record can give, collects it.`,
      `Add this job to ${job.workflow}:`,
      '',
      ...fill(GITLAB_FAN_IN_LINES, { job: job.jobId, stage: job.stage ?? 'test', path }),
    );
  }
  return out;
}

function gitlabRecipe({ recipe, dirs }: Runner, version: string): string[] {
  const where = dirs.map((d) => (d === '' ? 'the root' : d)).join(', ');
  const [first] = recipeSteps(recipe, version);
  return [
    `No job in ${GITLAB_CI} runs ${recipe.label}'s tests (found in ${where}). A job that runs them and`,
    'keeps the record:',
    '',
    'test:',
    ...(recipe.id === 'jest' ? ['  variables:', '    JEST_JUNIT_OUTPUT_NAME: junit.xml'] : []),
    '  script:',
    `    - ${scriptOf(first ?? '')}`,
    ...(recipe.after.length > 0 ? gitlabAfter(junitFiles(recipe, ''), version) : []),
    ...artifacts('junit.xml'),
  ];
}

// The forge to set up when the caller names none: GitLab when the checkout has .gitlab-ci.yml and
// no GitHub workflows.
export function forgeOf(dir: string, options: InitOptions): Forge {
  if (options.forge !== undefined) return options.forge;
  const gitlab = existsSync(join(dir, GITLAB_CI));
  return gitlab && !existsSync(join(dir, '.github/workflows')) ? 'gitlab' : 'github';
}

// A template file's change: created at `path` when there is none at `places`, appended to when it
// exists without dunstan, printed for a directory of templates.
function templateChange(dir: string, path: string, places: string[], section: string): FileChange {
  const template = places.find((p) => existsSync(join(dir, p)));
  if (template === undefined) return { path, action: 'create', content: section };
  if (statSync(join(dir, template)).isDirectory()) {
    return {
      path: template,
      action: 'print',
      reason: 'a directory of templates: add this section to the ones agents use',
      content: section,
    };
  }
  if (DUNSTAN_TEXT.test(readText(dir, template) ?? '')) {
    return { path: template, action: 'skip', reason: 'it already mentions dunstan' };
  }
  return { path: template, action: 'append', content: section };
}

const separated = (ci: string[], lines: string[]) =>
  ci.push(...(ci.length > 0 ? [''] : []), ...lines);

export function planInit(
  dir: string,
  version: string,
  pin: Pin,
  given: InitOptions = {},
): InitPlan {
  const options = { ...given, forge: forgeOf(dir, given) };
  const gitlab = options.forge === 'gitlab';
  const files: FileChange[] = [];

  if (!gitlab) {
    const running = runsDunstan(dir);
    if (running !== undefined) {
      files.push({
        path: WORKFLOW_PATH,
        action: 'skip',
        reason: `${running} already runs the Action`,
      });
    } else if (existsSync(join(dir, WORKFLOW_PATH))) {
      files.push({ path: WORKFLOW_PATH, action: 'skip', reason: 'the file exists' });
    } else {
      files.push({ path: WORKFLOW_PATH, action: 'create', content: workflowYaml(pin.ref) });
    }
  }

  const runners = detectRunners(dir);
  const jobs = gitlab ? gitlabTestJobs(dir, runners) : testJobs(dir, runners);
  const section = agentSection(version, jobs, options);
  for (const path of AGENT_FILES) {
    const text = readText(dir, path);
    if (text === undefined) {
      if (path === 'AGENTS.md') files.push({ path, action: 'create', content: `${section}\n` });
    } else if (DUNSTAN_TEXT.test(text)) {
      files.push({ path, action: 'skip', reason: 'it already mentions dunstan' });
    } else {
      files.push({ path, action: 'append', content: `${section}\n` });
    }
  }

  files.push(
    gitlab
      ? templateChange(
          dir,
          GITLAB_MR_TEMPLATE_PATH,
          [GITLAB_MR_TEMPLATE_PATH],
          `${MR_TEMPLATE_SECTION.join('\n')}\n`,
        )
      : templateChange(
          dir,
          PR_TEMPLATE_PATH,
          PR_TEMPLATE_PLACES,
          `${PR_TEMPLATE_SECTION.join('\n')}\n`,
        ),
  );

  const ci: string[] = [];
  if (gitlab && !gitlabRunsDunstan(dir)) {
    const text = readText(dir, GITLAB_CI);
    const include = componentInclude(pin.ref);
    separated(ci, [
      text === undefined
        ? `Create ${GITLAB_CI} with your build and test jobs and these lines. GitLab runs no pipeline`
        : `Add to ${GITLAB_CI}${/^include:/m.test(text) ? ', under its include:,' : ''} these lines: Dunstan's GitLab CI/CD`,
      text === undefined
        ? "whose only job is in .post, as the gate is: Dunstan's GitLab CI/CD component."
        : 'component, the gate.',
      '',
      ...(text !== undefined && /^include:/m.test(text) ? include.slice(1) : include),
      '',
      'Its inputs: `unverifiable: warn` passes the job with a warning on an unverifiable verdict, and',
      '`report: <path>` reads the report from a file instead of the description.',
    ]);
  }
  if (runners.length === 0 && jobs.length === 0) {
    separated(ci, [
      'No test runner found (pytest, Jest, Vitest, Maven, Gradle, Go). Until CI keeps a JUnit',
      'record, every tests claim is unverifiable; the recipes are in docs/ci-test-records.md.',
    ]);
  }
  for (const job of jobs)
    separated(ci, gitlab ? gitlabCiSteps(job, version) : ciSteps(job, version));
  const run = new Set(jobs.flatMap((j) => j.packages?.map((p) => p.recipe.id) ?? [j.recipe.id]));
  for (const runner of runners.filter((r) => !run.has(r.recipe.id))) {
    separated(ci, gitlab ? gitlabRecipe(runner, version) : recipeWithoutJob(runner, version));
  }
  if (jobs.some((j) => !j.uploadsRecord)) {
    ci.push(
      '',
      gitlab
        ? `Land the ${GITLAB_CI} change in a merge request of its own: a merge request that changes`
        : 'Land the workflow change in a pull request of its own: a pull request that changes the',
      gitlab
        ? 'the CI configuration file that writes the record is its own evidence, and its tests rows are'
        : 'workflow that writes the record is its own evidence, and its tests rows are unverifiable',
      gitlab ? 'unverifiable (record_producer_changed_by_pr).' : '(record_producer_changed_by_pr).',
    );
  }

  const notes = gitlab
    ? [
        'Then add the CI/CD variable GITLAB_TOKEN: a project access token with the read_api scope,',
        'masked and not protected (a merge request pipeline of an unprotected branch cannot read a',
        'protected variable). A public project is read without it, except a tests claim.',
        '',
        'And in Settings, Merge requests, turn on "Pipelines must succeed", so a merge request whose',
        'check fails or is unverifiable cannot merge. Until a merge request carries a block, the job',
        'fails with unverifiable: block_missing.',
      ]
    : [
        'Then require the check `dunstan`, with GitHub Actions as its source, on the branches agents',
        'merge into (Settings, Branches, or a ruleset). Until a pull request carries a block, the check',
        'concludes failure with unverifiable: block_missing.',
      ];
  if (pin.unresolved !== undefined) {
    const what = gitlab ? 'The include pins the component' : 'The workflow pins the Action';
    notes.push('', `${what} to a tag: ${pin.unresolved}. Pin a full commit SHA.`);
  }
  return { forge: options.forge, files, ci, notes };
}

export function applyPlan(dir: string, plan: InitPlan): void {
  for (const f of plan.files) {
    const full = join(dir, f.path);
    if (f.action === 'create') {
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, f.content, { flag: 'wx' });
    } else if (f.action === 'append') {
      const text = readFileSync(full, 'utf8');
      const gap = text === '' ? '' : text.endsWith('\n') ? '\n' : '\n\n';
      writeFileSync(full, `${text}${gap}${f.content}`);
    }
  }
}

const VERB = { create: 'create', append: 'append to', skip: 'skip', print: 'add by hand to' };
const DONE = { create: 'created', append: 'appended to', skip: 'skipped', print: 'add by hand to' };

export function renderPlan(plan: InitPlan, written: boolean): string {
  const out: string[] = [];
  out.push(written ? 'Files:' : 'Files (nothing is written until you run dunstan init --write):');
  for (const f of plan.files) {
    const verb = (written ? DONE : VERB)[f.action];
    out.push(
      `  ${verb} ${f.path}${f.action === 'skip' || f.action === 'print' ? `: ${f.reason}` : ''}`,
    );
  }
  for (const f of plan.files) {
    if (f.action === 'skip' || (written && f.action !== 'print')) continue;
    out.push('', `--- ${VERB[f.action]} ${f.path}`, f.content.replace(/\n$/, ''), '---');
  }
  const never = plan.forge === 'gitlab' ? 'a CI configuration file' : 'a workflow';
  out.push('', `CI (init never edits ${never}):`, '', ...plan.ci);
  out.push('', ...plan.notes);
  return `${out.join('\n')}\n`;
}
