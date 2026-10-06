// The Worker validates with Ajv's standalone code (src/spec/schema-validators.ts, replaced by
// hosted/build/build.ts) because Workers refuse `new Function`. This checks the standalone validators
// give exactly the answers and errors of the validators the CLI compiles at run time, on every block
// and record example and on every fixture record.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCases, runCase } from '../../src/acceptance/fixtures.js';
import { compileValidators, type SchemaValidators, type Validator } from '../../src/spec/schema.js';
import { standaloneValidatorCode } from '../build/build.js';
import { ROOT } from './support.js';

let standalone: SchemaValidators;
const runtime = compileValidators();

function examples(dir: string): [string, unknown][] {
  const path = join(ROOT, dir);
  return readdirSync(path)
    .filter((f) => f.endsWith('.json'))
    .flatMap((f): [string, unknown][] => {
      try {
        return [[`${dir}/${f}`, JSON.parse(readFileSync(join(path, f), 'utf8'))]];
      } catch {
        return []; // not JSON at all: never reaches schema validation
      }
    });
}

function outcome(validate: Validator, value: unknown) {
  const ok = validate(structuredClone(value));
  return { ok, errors: (validate.errors ?? []).map((e) => `${e.instancePath} ${e.keyword}`) };
}

beforeAll(async () => {
  const result = await build({
    stdin: { contents: await standaloneValidatorCode(), resolveDir: ROOT, loader: 'js' },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
  });
  const text = result.outputFiles?.[0]?.text ?? '';
  const module = await import(
    `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`
  );
  standalone = module.PRECOMPILED as SchemaValidators;
});

describe('the standalone validators', () => {
  const blocks = [
    ...examples('spec/examples/blocks/valid'),
    ...examples('spec/examples/blocks/invalid'),
  ];
  const records = [
    ...examples('spec/examples/records'),
    ...[...loadCases('controls'), ...loadCases('planted')].map((c): [string, unknown] => [
      `fixture ${c.set}/${c.name}`,
      runCase(c),
    ]),
  ];

  it('have examples of both outcomes to compare', () => {
    expect(blocks.some(([, v]) => outcome(runtime.block, v).ok)).toBe(true);
    expect(blocks.some(([, v]) => !outcome(runtime.block, v).ok)).toBe(true);
  });

  it('answer every block example as the run-time compiled validator does', () => {
    for (const [name, value] of blocks) {
      expect(outcome(standalone.block, value), name).toEqual(outcome(runtime.block, value));
    }
  });

  it('answer every record example and fixture record as the run-time compiled validator does', () => {
    for (const [name, value] of records) {
      expect(outcome(standalone.record, value), name).toEqual(outcome(runtime.record, value));
      // And a broken copy of each: a member removed, a timestamp malformed.
      const broken = structuredClone(value) as { predicate: Record<string, unknown> };
      delete broken.predicate.verdict;
      expect(outcome(standalone.record, broken), name).toEqual(outcome(runtime.record, broken));
    }
  });
});
