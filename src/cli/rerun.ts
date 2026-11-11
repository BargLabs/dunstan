// dunstan rerun: online. Re-reads the sources for the same subject and the recorded block (the report
// is not re-read: the recorded block is the claim), writes the new record to a new file, and reports
// evidence_changed with the evidence fields that moved (spec section 12).

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { GitHubClient, GitLabClient } from '../evidence/http.js';
import {
  atOnePullRequest,
  type EvidenceReaders,
  githubReaders,
  gitlabReaders,
} from '../pipeline/check-pull-request.js';
import {
  buildRecord,
  type DunstanRecord,
  rerunCommands,
  serializeRecord,
} from '../record/build.js';
import { checkerIdentity } from '../record/checker.js';
import { isGitlabRecord } from '../record/verify.js';
import { escapePointerToken, type JsonValue, parseStrictJson } from '../spec/json.js';
import { withoutSources } from '../spec/record.js';
import { validateGitlabDraftRecord, validateRecord } from '../spec/schema.js';
import { parseCheckRunIds } from './check.js';
import { type CliIo, exitFor, renderRecord, UsageError } from './output.js';

// JSON Pointers to every leaf at which `a` and `b` differ.
export function diffPointers(a: unknown, b: unknown, pointer = ''): string[] {
  const isObject = (v: unknown) => v !== null && typeof v === 'object';
  if (Array.isArray(a) && Array.isArray(b)) {
    const out: string[] = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      out.push(...diffPointers(a[i], b[i], `${pointer}/${i}`));
    }
    return out;
  }
  if (isObject(a) && isObject(b) && !Array.isArray(a) && !Array.isArray(b)) {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(ao), ...Object.keys(bo)])].sort();
    return keys.flatMap((k) => diffPointers(ao[k], bo[k], `${pointer}/${escapePointerToken(k)}`));
  }
  return JSON.stringify(a) === JSON.stringify(b) ? [] : [pointer === '' ? '/' : pointer];
}

function defaultOut(path: string): string {
  return path.endsWith('.json') ? `${path.slice(0, -5)}.rerun.json` : `${path}.rerun.json`;
}

export async function rerun(args: string[], io: CliIo): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    strict: true,
    allowPositionals: true,
    options: { out: { type: 'string' }, 'exclude-check-run': { type: 'string', multiple: true } },
  });
  if (positionals.length !== 1) throw new UsageError('dunstan rerun <record.json> [--out <path>]');
  const path = positionals[0] as string;
  const out = values.out ?? defaultOut(path);
  if (resolve(out) === resolve(path))
    throw new UsageError('rerun never overwrites the record it re-runs');

  const value = parseStrictJson(readFileSync(path, 'utf8'));
  // A GitLab record (DRAFT GitLab profile 0.1) validates against its own schema; every other
  // record against 0.1's, as before.
  const gitlab = isGitlabRecord(value);
  const errors = gitlab ? validateGitlabDraftRecord(value) : validateRecord(value);
  if (errors.length > 0) {
    throw new UsageError(
      `${path} is not a valid record: ${errors[0]?.pointer} ${errors[0]?.message}`,
    );
  }
  const old = (value as unknown as DunstanRecord).predicate;
  const forge = old.subject.forge;
  if (gitlab && values['exclude-check-run'] !== undefined) {
    throw new UsageError('a GitLab record is re-run without --exclude-check-run');
  }

  const warn = (message: string) => io.err(`dunstan: ${message}\n`);
  const fetchOption = io.fetch === undefined ? {} : { fetch: io.fetch };
  let client: GitHubClient | GitLabClient;
  let readers: EvidenceReaders;
  if (forge === undefined) {
    const github = new GitHubClient({ token: io.env.GITHUB_TOKEN, ...fetchOption, warn });
    client = github;
    readers = githubReaders(github);
  } else {
    const gitlabClient = new GitLabClient({
      host: forge.host,
      token: io.env.GITLAB_TOKEN,
      ...fetchOption,
      warn,
    });
    client = gitlabClient;
    readers = gitlabReaders(gitlabClient);
  }
  // The run the original checker executed in is still its own run; it stays excluded.
  const oldExcluded =
    old.evidence.checkRuns?.status === 'ok' ? old.evidence.checkRuns.excludedIds : [];
  const excluded = [...oldExcluded, ...parseCheckRunIds(values['exclude-check-run'])];
  // Read at one pull request, as `dunstan check` reads: once more if it moved, never across a move.
  const evidence = await atOnePullRequest(
    readers,
    old.subject.repository,
    old.subject.pullRequest,
    undefined,
    (pr) =>
      readers.evidence({
        repository: old.subject.repository,
        pullRequest: pr,
        block: old.block.status === 'found' ? old.block.value : null,
        excludedCheckRunIds: excluded,
      }),
  );
  const record = buildRecord({
    checker: checkerIdentity(io.artifact),
    report: old.report,
    block: old.block,
    repository: old.subject.repository,
    evidence,
    rerun: rerunCommands(basename(out)),
    ...(forge === undefined ? {} : { forge }),
  });

  if (existsSync(out)) io.err(`dunstan: replacing ${out}\n`);
  writeFileSync(out, serializeRecord(record));

  const p = record.predicate;
  if (p.digests.evidence !== old.digests.evidence) {
    const fields = diffPointers(
      withoutSources(old.evidence as unknown as JsonValue),
      withoutSources(evidence as unknown as JsonValue),
    );
    io.out(`evidence_changed: ${fields.length} field(s)\n`);
    for (const field of fields) io.out(`  /evidence${field}\n`);
    io.out(`verdict: ${old.verdict} -> ${p.verdict}\n\n`);
  } else {
    io.out(`evidence unchanged (digest ${p.digests.evidence})\n\n`);
  }
  io.out(renderRecord(record, { hasToken: client.hasToken, caller: 'cli' }));
  io.out(`record: ${out} (the original ${path} is unchanged)\n`);
  return exitFor(p.verdict);
}
