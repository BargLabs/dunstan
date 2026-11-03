// dunstan survey (DRAFT, docs/survey.md): read-only. Lists a repository's recent closed pull
// requests, runs `dunstan check`'s pipeline on each selected one with the named report source,
// writes the survey record and its Markdown summary. It reports which claims the record could not
// settle and why, beside the contradicted share of the claims it did settle. GITHUB_TOKEN is
// optional.

import { writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';
import { survey as runSurvey } from '../pipeline/survey.js';
import { checkerIdentity } from '../record/checker.js';
import {
  DEFAULT_LAST,
  MAX_LAST,
  type SurveyParameters,
  serializeSurvey,
} from '../survey/record.js';
import { renderSurveySummary } from '../survey/summary.js';
import { parsePositiveInt, REPOSITORY } from './check.js';
import { type CliIo, UsageError } from './output.js';

const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})(?:\[bot\])?$/;

function parseLogin(value: string, flag: string): string {
  if (!LOGIN.test(value)) throw new UsageError(`${flag} must be a GitHub login`);
  return value;
}

function parseSince(value: string): string {
  // A day that does not exist (2026-02-30) is read as another day, and a month past 12 as no day.
  const day = new Date(`${value}T00:00:00Z`);
  const valid =
    /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) &&
    !Number.isNaN(day.getTime()) &&
    day.toISOString().slice(0, 10) === value;
  if (!valid) throw new UsageError('--since must be a date, YYYY-MM-DD (UTC)');
  return value;
}

export async function survey(args: string[], io: CliIo): Promise<number> {
  const { values } = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    options: {
      repo: { type: 'string' },
      last: { type: 'string' },
      since: { type: 'string' },
      author: { type: 'string', multiple: true },
      'report-comment-author': { type: 'string' },
      advisory: { type: 'boolean' },
      out: { type: 'string' },
      summary: { type: 'string' },
    },
  });
  if (values.repo === undefined || !REPOSITORY.test(values.repo)) {
    throw new UsageError('--repo <owner/name> is required');
  }
  if (values.out === undefined) throw new UsageError('--out <survey.json> is required');
  const last = values.last === undefined ? DEFAULT_LAST : parsePositiveInt(values.last, '--last');
  if (last > MAX_LAST) throw new UsageError(`--last is at most ${MAX_LAST}`);
  const commentAuthor = values['report-comment-author'];
  const parameters: SurveyParameters = {
    repository: values.repo,
    last,
    since: values.since === undefined ? null : parseSince(values.since),
    authors: (values.author ?? []).map((a) => parseLogin(a, '--author')),
    report:
      commentAuthor === undefined
        ? { kind: 'pr-body' }
        : { kind: 'pr-comment', author: parseLogin(commentAuthor, '--report-comment-author') },
    advisory: values.advisory === true,
  };

  const token = io.env.GITHUB_TOKEN;
  if (token === undefined || token === '') {
    io.err(
      'dunstan: GITHUB_TOKEN is not set; reading anonymously (GitHub serves no artifact to an anonymous reader)\n',
    );
  }
  const record = await runSurvey({
    parameters,
    checker: checkerIdentity(io.artifact),
    out: basename(values.out),
    token,
    ...(io.fetch === undefined ? {} : { fetch: io.fetch }),
    ...(io.now === undefined ? {} : { now: io.now }),
    warn: (message) => io.err(`dunstan: ${message}\n`),
  });
  writeFileSync(values.out, serializeSurvey(record));
  const summary = renderSurveySummary(record);
  // Without --summary the summary alone is standard output, so it can be piped as it is.
  if (values.summary === undefined) {
    io.out(summary);
    io.err(`dunstan: survey record: ${values.out}\n`);
  } else {
    writeFileSync(values.summary, summary);
    io.out(`survey record: ${values.out}\nsummary: ${values.summary}\n`);
  }
  return 0;
}
