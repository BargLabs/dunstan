// `dunstan-eval anonymise-case`: writes an anonymised case into cases/<name>/ from a record and the
// report it was written from (src/cases/anonymise.ts), and the mapping that undoes it to a file of
// the caller's, which must be outside cases/. A development tool, never a check.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { type CliIo, UsageError } from '../cli/output.js';
import { type DunstanRecord, serializeRecord } from '../record/build.js';
import { verifyRecord } from '../record/verify.js';
import { AnonymiseError, anonymiseCase } from './anonymise.js';

export const CASE_NAME = /^[a-z0-9][a-z0-9-]*$/;

// What cases/<name>/case.json says of an anonymised case, and src/__tests__/cases.test.ts checks.
export interface AnonymisedCase {
  anonymised: true;
  // The checker that wrote the original record.
  checker: string;
  paths: 'kept' | 'mapped';
  sourceDigests: 'zeroed';
}

export async function anonymiseCaseCommand(
  args: string[],
  io: Pick<CliIo, 'out' | 'err'>,
): Promise<number> {
  const { values } = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    options: {
      record: { type: 'string' },
      report: { type: 'string' },
      case: { type: 'string' },
      cases: { type: 'string', default: 'cases' },
      'mapping-out': { type: 'string' },
      map: { type: 'string', multiple: true },
      'map-paths': { type: 'boolean', default: false },
      // The salt of an earlier mapping (its SALT_KEY member), to anonymise a re-run of the same
      // original to the same names.
      salt: { type: 'string' },
    },
  });
  const { record: recordFile, report: reportFile, case: name } = values;
  const mappingOut = values['mapping-out'];
  if (recordFile === undefined || reportFile === undefined || name === undefined) {
    throw new UsageError('--record <file>, --report <file> and --case <name> are required');
  }
  if (!CASE_NAME.test(name)) {
    throw new UsageError(
      `--case ${name}: lower-case letters, digits and hyphens, and name no party`,
    );
  }
  if (mappingOut === undefined) {
    throw new UsageError('--mapping-out <file> is required: the mapping undoes the anonymisation');
  }
  const cases = resolve(values.cases);
  if (!relative(cases, resolve(mappingOut)).startsWith('..')) {
    throw new UsageError(
      `--mapping-out ${mappingOut} is under ${values.cases}/: keep it out of the case`,
    );
  }
  const extra = (values.map ?? []).map((m): [string, string] => {
    const at = m.indexOf('=');
    if (at <= 0) throw new UsageError(`--map ${m}: give it as <original>=<replacement>`);
    return [m.slice(0, at), m.slice(at + 1)];
  });
  const dir = join(cases, name);
  if (existsSync(dir)) {
    throw new UsageError(
      `${dir} exists: remove it to rewrite the case (with --salt to keep its names)`,
    );
  }

  const record = JSON.parse(readFileSync(recordFile, 'utf8')) as DunstanRecord;
  const problems = verifyRecord(record).problems;
  if (problems.length > 0) {
    throw new UsageError(
      `${recordFile} does not recompute (${problems[0]?.member}): anonymise a record that does`,
    );
  }
  let result: ReturnType<typeof anonymiseCase>;
  try {
    result = anonymiseCase({
      record,
      report: readFileSync(reportFile),
      caseName: name,
      mapPaths: values['map-paths'] === true,
      extra,
      ...(values.salt === undefined ? {} : { salt: values.salt }),
    });
  } catch (e) {
    if (e instanceof AnonymiseError) {
      io.err(`dunstan-eval: ${e.message}\n`);
      return 3;
    }
    throw e;
  }
  const meta: AnonymisedCase = {
    anonymised: true,
    checker: `${record.predicate.checker.name} ${record.predicate.checker.version}`,
    paths: values['map-paths'] === true ? 'mapped' : 'kept',
    sourceDigests: 'zeroed',
  };
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'report.md'), result.report);
  writeFileSync(join(dir, 'record.json'), serializeRecord(result.record));
  writeFileSync(join(dir, 'case.json'), `${JSON.stringify(meta, null, 2)}\n`);
  writeFileSync(mappingOut, `${JSON.stringify(result.mapping, null, 2)}\n`);
  io.out(
    `wrote ${relative(process.cwd(), dir)}/ (verdict ${result.record.predicate.verdict}, ${result.record.predicate.claims.length} claims); mapping: ${mappingOut}\n` +
      'Read report.md before you commit it: names in prose that the record does not hold are not found.\n',
  );
  return 0;
}
