// Anonymise a case (cases/README.md, "Anonymised cases"): a record and the report it was written
// from, with the names that identify the pull request replaced, so a case from another
// organisation's public repository can be published without naming it. Replaced: repositories and
// their owners, commit ids (and the prefixes of them a report cites), issue and pull request
// numbers, every source's response digest (zeroed: anyone could hash a candidate's live answers and
// match them), and any further name the caller maps. Kept: file paths unless `mapPaths`, times,
// counts, verdicts and reasons.
//
// The result is rebuilt with the checker's own buildRecord, so it recomputes offline, and it is
// refused unless every claim row keeps its verdict and reason, and unless no original name is left
// anywhere in the record or the report. It is a derived record: its checker is the one that wrote
// the original, it cannot be re-run online, and the mapping, which undoes it, is the caller's to
// keep private.

import { createHash, randomBytes } from 'node:crypto';
import { buildRecord, type DunstanRecord, recordBlock, rerunCommands } from '../record/build.js';
import { extractHandbackBlock } from '../spec/extract.js';
import { sha256Hex } from '../spec/jcs.js';

export interface AnonymiseInput {
  record: DunstanRecord;
  report: Uint8Array;
  // The case's directory name under cases/: the report's locator in the anonymised record.
  caseName: string;
  // Makes the commit id mapping repeatable; random when absent.
  salt?: string;
  // Also map every changed file path, and the workflow paths, to neutral ones.
  mapPaths?: boolean;
  // Further text to replace, exactly, before anything else: a login, a product name in prose.
  extra?: readonly (readonly [string, string])[];
}

export interface AnonymiseResult {
  record: DunstanRecord;
  report: Uint8Array;
  // Each original name or number and what replaced it, and under SALT_KEY the salt, so that the
  // original, re-run by a later checker, anonymises to the same names (a checker verifies only the
  // records its own version wrote, so a case is rewritten each release). It undoes the
  // anonymisation: keep it out of the repository.
  mapping: Record<string, string>;
}

export class AnonymiseError extends Error {
  constructor(
    message: string,
    readonly leaks: readonly string[] = [],
  ) {
    super(message);
    this.name = 'AnonymiseError';
  }
}

// The mapping's member holding the salt: not a name, so no original can collide with it.
export const SALT_KEY = '(salt)';

const SUBJECT_OWNER = 'example-org';
const SUBJECT_REPO = 'example-repo';
const ZERO_DIGEST = '0'.repeat(64);
const SHA = /\b[0-9a-f]{40}\b/g;
const ISSUE_REF = /\b([A-Za-z0-9][A-Za-z0-9-]*)\/([A-Za-z0-9._-]+)#(\d+)\b/g;
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

function walk(value: unknown, f: (s: string) => string): unknown {
  if (typeof value === 'string') return f(value);
  if (Array.isArray(value)) return value.map((v) => walk(v, f));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, f)]));
  }
  return value;
}

export function anonymiseCase(input: AnonymiseInput): AnonymiseResult {
  const original = input.record;
  const p = original.predicate;
  if (p.subject.forge !== undefined)
    throw new AnonymiseError('a GitLab record is not anonymised in this version');
  if (p.readerClaims !== undefined || p.advisory !== undefined) {
    throw new AnonymiseError(
      'a record with reader claims or advisories is not anonymised: they hold report text',
    );
  }
  const salt = input.salt ?? randomBytes(16).toString('hex');
  const reportText = new TextDecoder('utf-8').decode(input.report);
  const extra = input.extra ?? [];
  const recordText = JSON.stringify(original);
  const allText = `${recordText}\n${reportText}`;
  const mapping: Record<string, string> = {};

  // Repositories and owners: the subject first, then each other repository an issue reference
  // names, in order of first appearance.
  const [subjectOwner, subjectName] = p.subject.repository.split('/') as [string, string];
  const owners = new Map<string, string>([[subjectOwner.toLowerCase(), SUBJECT_OWNER]]);
  const repos = new Map<string, string>([
    [p.subject.repository.toLowerCase(), `${SUBJECT_OWNER}/${SUBJECT_REPO}`],
  ]);
  for (const m of allText.matchAll(ISSUE_REF)) {
    const owner = (m[1] as string).toLowerCase();
    const full = `${owner}/${(m[2] as string).toLowerCase()}`;
    if (!owners.has(owner)) owners.set(owner, `other-org-${owners.size}`);
    if (!repos.has(full)) repos.set(full, `${owners.get(owner)}/repo-${repos.size}`);
  }
  const repoOf = (owner: string, name: string) => repos.get(`${owner}/${name}`.toLowerCase());

  // Issue and pull request numbers, per repository: the pull request is 1 in the subject.
  const numbers = new Map<string, number>([
    [`${p.subject.repository.toLowerCase()}#${p.subject.pullRequest}`, 1],
  ]);
  let next = 2;
  const numberOf = (repo: string, n: string | number): number => {
    const key = `${repo.toLowerCase()}#${n}`;
    let mapped = numbers.get(key);
    if (mapped === undefined) {
      mapped = next++;
      numbers.set(key, mapped);
    }
    return mapped;
  };
  for (const m of allText.matchAll(ISSUE_REF)) numberOf(`${m[1]}/${m[2]}`, m[3] as string);
  for (const ref of p.block.status === 'found' ? (p.block.value.references ?? []) : []) {
    if ('issue' in ref && /^#\d+$/.test(ref.issue))
      numberOf(p.subject.repository, ref.issue.slice(1));
  }

  // Commit ids, full and as the prefixes of at least 7 a report cites.
  const shas = new Map<string, string>();
  for (const m of allText.matchAll(SHA)) {
    const sha = m[0];
    if (!shas.has(sha)) {
      shas.set(sha, createHash('sha1').update(`${salt}:${sha}`).digest('hex'));
    }
  }

  // File paths, when asked: each changed path and workflow path, to a neutral one with its
  // extension.
  const paths = new Map<string, string>();
  if (input.mapPaths === true) {
    const add = (path: string | undefined) => {
      if (path === undefined || paths.has(path)) return;
      const ext = /\.[A-Za-z0-9]+$/.exec(path)?.[0] ?? '';
      const workflow = path.startsWith('.github/workflows/');
      paths.set(
        path,
        workflow
          ? `.github/workflows/workflow-${paths.size + 1}${ext}`
          : `path-${paths.size + 1}${ext}`,
      );
    };
    const files = p.evidence.files;
    if (files?.status === 'ok') {
      for (const e of files.entries) {
        add(e.path);
        add(e.previousPath);
      }
    }
    if (p.block.status === 'found') {
      for (const f of p.block.value.filesChanged) add(f);
      for (const t of p.block.value.tests ?? []) {
        if (t.record.kind === 'junit') add((t.record as { workflow: string }).workflow);
      }
    }
    if (p.evidence.checkRuns?.status === 'ok') {
      for (const r of p.evidence.checkRuns.runs) add(r.workflowPath);
    }
  }

  const subjectRepo = p.subject.repository;
  const anon = (text: string, prose: boolean): string => {
    let s = text;
    for (const [from, to] of extra) s = s.replaceAll(from, to);
    // Requests, with their repository and number: REST paths and GraphQL fields.
    s = s.replace(
      /\/repos\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)\/(pulls|issues)\/(\d+)/g,
      (all, o: string, r: string, kind: string, n: string) => {
        const repo = repoOf(o, r);
        return repo === undefined ? all : `/repos/${repo}/${kind}/${numberOf(`${o}/${r}`, n)}`;
      },
    );
    s = s.replace(
      /repository\(([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)\)\.(\w+)\((\d+)\)/g,
      (all, o: string, r: string, field: string, n: string) => {
        const repo = repoOf(o, r);
        return repo === undefined
          ? all
          : `repository(${repo}).${field}(${numberOf(`${o}/${r}`, n)})`;
      },
    );
    s = s.replace(
      /github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)\/(pull|issues)\/(\d+)/g,
      (all, o: string, r: string, kind: string, n: string) => {
        const repo = repoOf(o, r);
        return repo === undefined ? all : `github.com/${repo}/${kind}/${numberOf(`${o}/${r}`, n)}`;
      },
    );
    s = s.replace(ISSUE_REF, (all, o: string, r: string, n: string) => {
      const repo = repoOf(o, r);
      return repo === undefined ? all : `${repo}#${numberOf(`${o}/${r}`, n)}`;
    });
    // A relative `#N`: an issue of the subject repository.
    s = s.replace(/(^|[^\w/#])#(\d+)\b/g, (all, before: string, n: string) => {
      const mapped = numbers.get(`${subjectRepo.toLowerCase()}#${n}`);
      return mapped === undefined ? all : `${before}#${mapped}`;
    });
    // Repositories, then owners, wherever else they are named.
    for (const [from, to] of repos) s = s.replace(new RegExp(escapeRegex(from), 'gi'), to);
    for (const [from, to] of owners)
      s = s.replace(new RegExp(`\\b${escapeRegex(from)}\\b`, 'gi'), to);
    s = s.replace(new RegExp(`\\b${escapeRegex(subjectName)}\\b`, 'gi'), SUBJECT_REPO);
    // Commit ids, and in prose a prefix of one.
    s = s.replace(SHA, (sha) => shas.get(sha) ?? sha);
    if (prose) {
      s = s.replace(/\b[0-9a-f]{7,39}\b/g, (prefix) => {
        for (const [sha, to] of shas) if (sha.startsWith(prefix)) return to.slice(0, prefix.length);
        return prefix;
      });
      for (const [from, to] of paths) s = s.replaceAll(from, to);
    } else if (paths.has(s)) {
      s = paths.get(s) as string;
    }
    return s;
  };

  const report = new TextEncoder().encode(anon(reportText, true));
  const evidence = walk(p.evidence, (s) => anon(s, false)) as typeof p.evidence;
  evidence.pullRequest = { ...evidence.pullRequest, number: 1 };
  evidence.sources = evidence.sources.map(({ etag: _, ...s }) => ({ ...s, sha256: ZERO_DIGEST }));
  const repository = `${SUBJECT_OWNER}/${SUBJECT_REPO}`;
  const block = recordBlock(extractHandbackBlock(new TextDecoder('utf-8').decode(report)));
  const record = buildRecord({
    checker: p.checker,
    report: {
      sha256: sha256Hex(report),
      source: { kind: 'file', locator: `cases/${input.caseName}/report.md` },
    },
    block,
    repository,
    evidence,
    rerun: rerunCommands('record.json'),
  });

  // Every row keeps its verdict and reason, and the record its verdict.
  const was = p.claims.map((c) => `${c.verdict} ${c.reason ?? ''}`);
  const is = record.predicate.claims.map((c) => `${c.verdict} ${c.reason ?? ''}`);
  if (
    block.status !== p.block.status ||
    record.predicate.verdict !== p.verdict ||
    JSON.stringify(was) !== JSON.stringify(is)
  ) {
    throw new AnonymiseError(
      `the anonymised record does not keep every claim's verdict and reason (was ${p.verdict}: ${was.join('; ')}; is ${record.predicate.verdict}: ${is.join('; ')})`,
    );
  }

  // No original name is left: repositories, owners, the subject's name, commit ids (as any prefix
  // of 7), mapped paths and the caller's names.
  // The record format's own identifiers (predicate types, schema ids) are not the case's names.
  const out = `${JSON.stringify(record)}\n${new TextDecoder('utf-8').decode(report)}`.replaceAll(
    'https://barglabs.ai/dunstan/',
    '',
  );
  const names = [
    ...repos.keys(),
    ...owners.keys(),
    subjectName,
    ...[...shas.keys()].map((sha) => sha.slice(0, 7)),
    ...(input.mapPaths === true ? paths.keys() : []),
    ...extra.map(([from]) => from),
  ];
  const leaks = names.filter((n) => n.length >= 3 && out.toLowerCase().includes(n.toLowerCase()));
  if (leaks.length > 0) {
    throw new AnonymiseError(
      `an original name is still in the anonymised case: ${leaks.join(', ')}; map it with --map`,
      leaks,
    );
  }

  mapping[SALT_KEY] = salt;
  for (const [from, to] of repos) mapping[from] = to;
  for (const [from, to] of owners) mapping[from] = to;
  for (const [from, to] of numbers) mapping[from] = `#${to}`;
  for (const [from, to] of shas) mapping[from] = to;
  for (const [from, to] of paths) mapping[from] = to;
  for (const [from, to] of extra) mapping[from] = to;
  return { record, report, mapping };
}
