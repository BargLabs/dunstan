import { describe, expect, it } from 'vitest';
import { corpusCase, REPO, testDoubleProvider } from '../__tests__/retrieval-fixtures.js';
import { Bm25Index, tokenize } from './bm25.js';
import { fuse, retrieveByEmbedding } from './embedding.js';
import { identifierMatches } from './identifiers.js';
import { recordItems } from './items.js';
import { BM25_FLOOR, FILL_TO_K, retrieve } from './retrieve.js';
import type { RecordItem } from './types.js';

const storage = () => recordItems(corpusCase('storage-retry').evidence);

const item = (type: RecordItem['type'], id: string, ...fields: [string, string][]): RecordItem => ({
  type,
  id,
  fields,
});

describe('tokenize', () => {
  it('splits paths and camelCase, lowercases, drops stopwords and folds plurals', () => {
    expect(tokenize('Renamed src/storage/blobStore.ts and the Tests')).toEqual([
      'renamed',
      'src',
      'storage',
      'blob',
      'store',
      'ts',
      'test',
    ]);
  });
});

describe('record items', () => {
  it('lists commits, timeline events, check runs, files and tests, in that order', () => {
    expect(storage().map((i) => i.type)).toEqual([
      'commit',
      'commit',
      'commit',
      'timeline_event',
      'timeline_event',
      'timeline_event',
      'timeline_event',
      'check_run',
      'check_run',
      'check_run',
      'file',
      'file',
      'file',
      'file',
      'test',
      'test',
      'test',
    ]);
  });

  it('counts only the latest check run per name, less the excluded ones', () => {
    const items = recordItems({
      checkRuns: {
        status: 'ok',
        commit: 'a'.repeat(40),
        excludedIds: [3],
        runs: [
          { id: 1, name: 'lint', status: 'completed', conclusion: 'failure' },
          { id: 2, name: 'lint', status: 'completed', conclusion: 'success' },
          { id: 3, name: 'dunstan', status: 'in_progress', conclusion: null },
        ],
      },
    });
    expect(items.map((i) => i.id)).toEqual(['2']);
  });

  it('skips a section that was not read', () => {
    const items = recordItems(corpusCase('ci-matrix').evidence);
    expect(items.some((i) => i.type === 'test')).toBe(false);
  });
});

describe('identifier matching', () => {
  const sha = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
  const items = [
    item('commit', sha, ['sha', sha], ['headline', 'Add backoff']),
    item('commit', 'deadbee'.padEnd(40, '0'), ['sha', 'deadbee'.padEnd(40, '0')]),
    item('timeline_event', 'e1', ['event', 'cross-referenced'], ['ref', `${REPO}#41`]),
    item('file', 'src/a.ts', ['path', 'src/a.ts']),
    item('file', 'src/a.tsx', ['path', 'src/a.tsx']),
    item('check_run', '7', ['name', 'ci']),
    item('check_run', '8', ['name', 'typecheck']),
    item('test', 'suite.retries twice', ['name', 'retries twice'], ['classname', 'suite']),
  ];
  const named = (text: string, declaredValue?: string) =>
    [
      ...identifierMatches(
        declaredValue === undefined ? { text } : { text, declaredValue },
        items,
        REPO,
      ).entries(),
    ].map(([i, field]) => `${items[i]?.id}:${field}`);

  it('matches a full or abbreviated SHA, but not a hex-spelt word', () => {
    expect(named(`see ${sha}`)).toEqual([`${sha}:sha`]);
    expect(named('see A1B2C3D')).toEqual([`${sha}:sha`]);
    expect(named('the deadbee commit')).toEqual([]);
  });

  it('matches #N in the subject repository and owner/repo#N', () => {
    expect(named('Fixes #41.')).toEqual(['e1:ref']);
    expect(named('Fixes Example-Org/example-repo#41')).toEqual(['e1:ref']);
    expect(named('Fixes #4')).toEqual([]);
    expect(named('Fixes other/repo#41')).toEqual([]);
  });

  it('matches a whole path, before a full stop too, and not inside a longer path', () => {
    expect(named('Changed src/a.ts.')).toEqual(['src/a.ts:path']);
    expect(named('Changed src/a.tsx')).toEqual(['src/a.tsx:path']);
    expect(named('Changed lib/src/a.ts')).toEqual([]);
  });

  it('matches job and test names exactly, but not names shorter than four characters', () => {
    expect(named('the typecheck job passes')).toEqual(['8:name']);
    expect(named('ci passes')).toEqual([]);
    expect(named('Typecheck passes')).toEqual([]);
    expect(named('the test "retries twice" passes')).toEqual(['suite.retries twice:name']);
  });

  it('reads identifiers in the declared value as well as in the text', () => {
    expect(named('a file changed', 'src/a.ts')).toEqual(['src/a.ts:path']);
  });
});

describe('BM25', () => {
  it('gives a term in every document a lower weight than a rare one', () => {
    const index = new Bm25Index([['retry', 'storage'], ['storage'], ['storage', 'docs']]);
    expect(index.idf('retry')).toBeGreaterThan(index.idf('storage'));
    const [a, b] = index.scores(['retry']);
    expect(a).toBeGreaterThan(0);
    expect(b).toBe(0);
  });
});

describe('retrieve (Arm A)', () => {
  it('ranks identifier matches first, then lexical matches by score', () => {
    const got = retrieve({ text: 'Renamed src/storage/blobs.ts; blob store uploads' }, storage(), {
      repository: REPO,
    });
    expect(got[0]).toEqual({
      type: 'file',
      id: 'src/storage/blob-store.ts',
      score: null,
      matchedField: 'previousPath',
    });
    const scores = got.slice(1).map((c) => c.score as number);
    expect(scores.every((s) => s >= BM25_FLOOR)).toBe(true);
    expect([...scores].sort((x, y) => y - x)).toEqual(scores);
  });

  it('proposes nothing below the floor', () => {
    expect(
      retrieve({ text: 'Improved the onboarding wizard' }, storage(), { repository: REPO }),
    ).toEqual([]);
    // "storage" is in more than a third of the items: alone it does not reach the floor.
    expect(retrieve({ text: 'storage' }, storage(), { repository: REPO })).toEqual([]);
  });

  it('breaks ties by record order, then id', () => {
    const items = [
      item('test', 'b', ['name', 'flaky upload']),
      item('test', 'a', ['name', 'flaky upload']),
      item('file', 'x', ['path', 'one']),
      item('file', 'y', ['path', 'two']),
      item('file', 'z', ['path', 'three']),
    ];
    const got = retrieve({ text: 'the flaky upload' }, items, { repository: REPO });
    expect(got.map((c) => c.id)).toEqual(['b', 'a']);
    expect(got[0]?.score).toBe(got[1]?.score);
  });

  it('keeps only the types asked for, and at most `limit`', () => {
    const got = retrieve({ text: 'retry storage blob upload test' }, storage(), {
      repository: REPO,
      types: ['test'],
      limit: 2,
    });
    expect(got.length).toBeLessThanOrEqual(2);
    expect(got.every((c) => c.type === 'test')).toBe(true);
  });

  it('gives the same candidates on every run', () => {
    const claim = { text: 'Added exponential backoff for blob uploads, see #41' };
    const first = JSON.stringify(retrieve(claim, storage(), { repository: REPO }));
    for (let i = 0; i < 5; i++) {
      expect(JSON.stringify(retrieve(claim, storage(), { repository: REPO }))).toBe(first);
    }
  });

  it('names the field that best explains a lexical match', () => {
    const got = retrieve({ text: 'exponential backoff' }, storage(), { repository: REPO });
    expect(got[0]).toMatchObject({ type: 'commit', matchedField: 'headline' });
  });
});

describe('retrieve, filled to k', () => {
  const K = 5;
  const filled = (text: string, types?: RecordItem['type'][], limit = K, items = storage()) =>
    retrieve({ text }, items, {
      repository: REPO,
      ...(types === undefined ? {} : { types }),
      limit,
      fill: FILL_TO_K,
    });

  it('fills to k below the floor where the floor leaves fewer', () => {
    const text = 'Improved the onboarding wizard';
    expect(retrieve({ text }, storage(), { repository: REPO, limit: K })).toEqual([]);
    const got = filled(text);
    expect(got).toHaveLength(K);
    expect(got.every((c) => c.score !== null && c.score < BM25_FLOOR)).toBe(true);
  });

  it('keeps the unfilled list as its head, then the rest by score, then record order, then id', () => {
    const text = 'Added exponential backoff for blob uploads, see #41';
    const plain = retrieve({ text }, storage(), { repository: REPO });
    expect(plain.length).toBeGreaterThan(0);
    expect(plain.length).toBeLessThan(10);
    const got = filled(text, undefined, 10);
    expect(got).toHaveLength(10);
    expect(got.slice(0, plain.length)).toEqual(plain);
    const tail = got.slice(plain.length);
    const scores = tail.map((c) => c.score as number);
    expect(scores.every((x) => x < BM25_FLOOR)).toBe(true);
    expect([...scores].sort((x, y) => y - x)).toEqual(scores);
    // Items that share no term with the claim (score 0) follow in record order.
    const order = new Map(storage().map((i, n) => [`${i.type}:${i.id}`, n]));
    const zeros = tail
      .filter((c) => c.score === 0)
      .map((c) => order.get(`${c.type}:${c.id}`) ?? -1);
    expect(zeros.length).toBeGreaterThan(1);
    expect([...zeros].sort((x, y) => x - y)).toEqual(zeros);
  });

  it('breaks ties below the floor by record order', () => {
    const items = [
      item('file', 'c', ['path', 'gamma']),
      item('file', 'a', ['path', 'alpha']),
      item('file', 'b', ['path', 'beta']),
    ];
    expect(filled('nothing in common', undefined, 2, items).map((c) => c.id)).toEqual(['c', 'a']);
  });

  it('never exceeds the pool of the allowed types', () => {
    expect(filled('anything at all', ['check_run'])).toHaveLength(3);
    expect(filled('anything at all', ['check_run']).every((c) => c.type === 'check_run')).toBe(
      true,
    );
    expect(filled('anything at all', undefined, 100)).toHaveLength(storage().length);
    expect(filled('anything at all', ['file'], 0)).toEqual([]);
  });

  it('is the unfilled list cut at k when k candidates reach the floor', () => {
    const text = 'retry storage blob upload backoff exponential test';
    const plain = retrieve({ text }, storage(), { repository: REPO });
    expect(plain.length).toBeGreaterThanOrEqual(3);
    expect(filled(text, undefined, 3)).toEqual(plain.slice(0, 3));
  });

  it('gives the same candidates on every run', () => {
    const first = JSON.stringify(filled('the onboarding wizard and #41'));
    for (let i = 0; i < 5; i++)
      expect(JSON.stringify(filled('the onboarding wizard and #41'))).toBe(first);
  });

  it('needs a limit, and leaves the default unchanged', () => {
    expect(() => retrieve({ text: 'x' }, storage(), { repository: REPO, fill: FILL_TO_K })).toThrow(
      /needs a limit/,
    );
    for (const text of ['Improved the onboarding wizard', 'exponential backoff', 'storage']) {
      const plain = retrieve({ text }, storage(), { repository: REPO });
      expect(plain.every((c) => c.score === null || c.score >= BM25_FLOOR)).toBe(true);
      expect(retrieve({ text }, storage(), { repository: REPO, limit: K })).toEqual(
        plain.slice(0, K),
      );
    }
  });
});

describe('the embedding seam (Arm B)', () => {
  it('ranks items by a provider and fuses with Arm A, identifier matches first', async () => {
    const items = storage();
    const claim = { text: 'Fixes #41 and the backoff for blob uploads' };
    const b = await retrieveByEmbedding(claim, items, testDoubleProvider);
    expect(b).toHaveLength(items.length);
    const a = retrieve(claim, items, { repository: REPO });
    const ab = fuse(a, b);
    expect(ab[0]).toEqual(a[0]);
    expect(ab[0]?.score).toBeNull();
    expect(new Set(ab.map((c) => `${c.type}:${c.id}`)).size).toBe(ab.length);
  });
});
