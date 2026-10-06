import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { CORPUS_DIR, testDoubleProvider } from '../__tests__/retrieval-fixtures.js';
import { BM25_FLOOR } from '../retrieval/retrieve.js';
import { evalMain } from './main.js';
import { type EvalResult, evaluate, loadCorpus, RECALL_K } from './retrieval.js';

const corpus = fileURLToPath(CORPUS_DIR);
const work = mkdtempSync(join(tmpdir(), 'dunstan-eval-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

async function runEval(argv: string[]) {
  const io = { out: '', err: '' };
  const code = await evalMain(argv, {
    out: (t) => {
      io.out += t;
    },
    err: (t) => {
      io.err += t;
    },
  });
  return { code, ...io };
}

describe('dunstan-eval retrieval', () => {
  it('writes recall at k = 5 for Arm A on the synthetic corpus', async () => {
    const out = join(work, 'a.json');
    const { code, out: stdout } = await runEval(['retrieval', '--corpus', corpus, '--out', out]);
    expect(code).toBe(0);
    const result = JSON.parse(readFileSync(out, 'utf8')) as EvalResult;
    expect(result).toMatchObject({
      eval: 'retrieval',
      k: RECALL_K,
      floor: BM25_FLOOR,
      provider: null,
    });
    expect(result.corpus).toMatchObject({ cases: 2, claims: 14 });
    expect(Object.keys(result.arms)).toEqual(['A']);
    const a = result.arms.A;
    expect(a?.claims).toBe(14);
    expect(a?.recallAtK).toBe((a?.hits ?? 0) / 14);
    expect(a?.missed.length).toBe(14 - (a?.hits ?? 0));
    expect(stdout).toContain('arm A: recall@5');
  });

  it('is deterministic: the same corpus gives the same result', async () => {
    const cases = loadCorpus(corpus);
    expect(JSON.stringify(await evaluate(cases))).toBe(JSON.stringify(await evaluate(cases)));
  });

  it('adds Arm B and A+B through a provider module passed at run time', async () => {
    const module = join(work, 'provider.mjs');
    // A plain-JavaScript test double with the test double's identity; any module will do.
    writeFileSync(
      module,
      `export default {
  identity: ${JSON.stringify(testDoubleProvider.identity)},
  async embed(texts) {
    return texts.map((text) => {
      const v = new Array(8).fill(0);
      for (const ch of text.toLowerCase()) v[ch.charCodeAt(0) % 8] += 1;
      return v;
    });
  },
};
`,
    );
    const out = join(work, 'ab.json');
    const { code } = await runEval([
      'retrieval',
      '--corpus',
      corpus,
      '--out',
      out,
      '--provider',
      module,
    ]);
    expect(code).toBe(0);
    const result = JSON.parse(readFileSync(out, 'utf8')) as EvalResult;
    expect(Object.keys(result.arms)).toEqual(['A', 'B', 'A+B']);
    expect(result.provider).toEqual(testDoubleProvider.identity);
  });

  it('refuses a call without --corpus or --out', async () => {
    const { code, err } = await runEval(['retrieval', '--corpus', corpus]);
    expect(code).toBe(3);
    expect(err).toContain('--out');
  });
});
