// dunstan-eval retrieval: recall at k = 5, per arm, on a corpus of claims whose matching record items
// are known. The corpus is a directory of case files read from wherever it lives; the private one is
// run outside this repository, and test/retrieval-corpus/ holds a small synthetic one.
// A recall here measures retrieval only. It is not a verdict and goes into no record.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { type CliIo, UsageError } from '../cli/output.js';
import { CHECKER_NAME, CHECKER_VERSION } from '../record/checker.js';
import {
  ARM_AB,
  ARM_B,
  type EmbeddingProvider,
  fuse,
  retrieveByEmbedding,
} from '../retrieval/embedding.js';
import { type ItemSnapshot, recordItems } from '../retrieval/items.js';
import { READER_CLAIM_KINDS } from '../retrieval/reader-claims.js';
import { ARM_A, ARM_A_FILL, BM25_FLOOR, FILL_TO_K, retrieve } from '../retrieval/retrieve.js';
import type { Candidate, ItemType, RecordItem } from '../retrieval/types.js';
import { sha256Canonical } from '../spec/jcs.js';
import { type JsonValue, parseStrictJson } from '../spec/json.js';

export const RECALL_K = 5;

export interface CorpusClaim {
  id: string;
  text: string;
  kind?: string;
  declaredValue?: JsonValue;
  // The record items the claim is about. A claim is a hit when any of them is in the top k.
  expected: { type: ItemType; id: string }[];
}

export interface CorpusCase {
  repository: string;
  evidence: ItemSnapshot;
  claims: CorpusClaim[];
}

export interface ArmResult {
  claims: number;
  hits: number;
  recallAtK: number;
  // Claims for which the arm proposed no candidate at all, and their share of claims.
  empty: number;
  emptyRate: number;
  // case/claim of every claim none of whose expected items was in the top k.
  missed: string[];
}

// What a uniformly random ranking of each claim's pool would score: the pool is every item of the
// claim's allowed types (every item when its kind is unknown), as every arm ranks. Computed exactly
// per claim (chanceHitAtK), summed in corpus order, not sampled.
export interface ChanceResult {
  expectedHits: number;
  recallAtK: number;
}

export interface EvalResult {
  eval: 'retrieval';
  checker: { name: string; version: string };
  k: number;
  floor: number;
  corpus: { cases: number; claims: number; sha256: string };
  provider: { name: string; digest: string } | null;
  chance: ChanceResult;
  arms: Record<string, ArmResult>;
}

export interface EvalOptions {
  // Also run Arm A filled to k (ARM_A_FILL): retrieve with fill 'to-k' and limit k.
  fillToK?: boolean;
}

// The binomial coefficient C(n, r), exactly.
function choose(n: number, r: number): bigint {
  if (r < 0 || r > n) return 0n;
  let c = 1n;
  for (let i = 0; i < r; i++) c = (c * BigInt(n - i)) / BigInt(i + 1);
  return c;
}

// The probability that a uniformly random ordering of `pool` items puts at least one of `gold` of
// them in its first k: 1 − C(pool − gold, m) / C(pool, m), with m = min(k, pool), the
// hypergeometric chance of a hit. With one gold item it is m / pool. The two coefficients are exact
// integers, so the result is their quotient rounded once.
export function chanceHitAtK(pool: number, gold: number, k: number): number {
  if (pool <= 0 || gold <= 0) return 0;
  const m = Math.min(k, pool);
  const all = choose(pool, m);
  return Number(all - choose(pool - Math.min(gold, pool), m)) / Number(all);
}

export function loadCorpus(dir: string): Map<string, CorpusCase> {
  const files = readdirSync(dir)
    .filter((n) => n.endsWith('.json'))
    .sort();
  if (files.length === 0) throw new UsageError(`no .json case files in ${dir}`);
  const cases = new Map<string, CorpusCase>();
  for (const file of files) {
    const value = parseStrictJson(readFileSync(join(dir, file), 'utf8')) as unknown as CorpusCase;
    if (typeof value.repository !== 'string' || !Array.isArray(value.claims)) {
      throw new UsageError(`${file}: a case needs repository and claims`);
    }
    cases.set(file.replace(/\.json$/, ''), value);
  }
  return cases;
}

function typesFor(kind: string | undefined): ItemType[] | undefined {
  const type = kind === undefined ? undefined : READER_CLAIM_KINDS.get(kind);
  return type === undefined ? undefined : [type];
}

function hit(top: readonly Candidate[], expected: CorpusClaim['expected']): boolean {
  return expected.some((e) => top.some((c) => c.type === e.type && c.id === e.id));
}

export async function evaluate(
  cases: ReadonlyMap<string, CorpusCase>,
  provider?: EmbeddingProvider,
  options: EvalOptions = {},
): Promise<EvalResult> {
  const arms = [
    ARM_A,
    ...(options.fillToK === true ? [ARM_A_FILL] : []),
    ...(provider === undefined ? [] : [ARM_B, ARM_AB]),
  ];
  const results: Record<string, ArmResult> = {};
  for (const arm of arms) {
    results[arm] = { claims: 0, hits: 0, recallAtK: 0, empty: 0, emptyRate: 0, missed: [] };
  }
  let claimCount = 0;
  let expectedHits = 0;

  for (const [name, c] of cases) {
    const items: RecordItem[] = recordItems(c.evidence);
    for (const claim of c.claims) {
      claimCount++;
      const types = typesFor(claim.kind);
      const query =
        claim.declaredValue === undefined
          ? { text: claim.text }
          : { text: claim.text, declaredValue: claim.declaredValue };
      const a = retrieve(
        query,
        items,
        types === undefined ? { repository: c.repository } : { repository: c.repository, types },
      );
      const ranked: Record<string, Candidate[]> = { [ARM_A]: a };
      if (options.fillToK === true) {
        ranked[ARM_A_FILL] = retrieve(query, items, {
          repository: c.repository,
          ...(types === undefined ? {} : { types }),
          limit: RECALL_K,
          fill: FILL_TO_K,
        });
      }
      const pool = items.filter((i) => types === undefined || types.includes(i.type));
      const gold = new Set(claim.expected.map((e) => `${e.type}\u0000${e.id}`));
      const goldInPool = pool.filter((i) => gold.has(`${i.type}\u0000${i.id}`)).length;
      expectedHits += chanceHitAtK(pool.length, goldInPool, RECALL_K);
      if (provider !== undefined) {
        const b = await retrieveByEmbedding(query, items, provider, types);
        ranked[ARM_B] = b;
        ranked[ARM_AB] = fuse(a, b);
      }
      for (const arm of arms) {
        const r = results[arm] as ArmResult;
        r.claims++;
        if ((ranked[arm] ?? []).length === 0) r.empty++;
        if (hit((ranked[arm] ?? []).slice(0, RECALL_K), claim.expected)) r.hits++;
        else r.missed.push(`${name}/${claim.id}`);
      }
    }
  }
  for (const r of Object.values(results)) {
    r.recallAtK = r.claims === 0 ? 0 : r.hits / r.claims;
    r.emptyRate = r.claims === 0 ? 0 : r.empty / r.claims;
  }

  return {
    eval: 'retrieval',
    checker: { name: CHECKER_NAME, version: CHECKER_VERSION },
    k: RECALL_K,
    floor: BM25_FLOOR,
    corpus: {
      cases: cases.size,
      claims: claimCount,
      sha256: sha256Canonical(Object.fromEntries(cases) as unknown as JsonValue),
    },
    provider: provider === undefined ? null : provider.identity,
    chance: { expectedHits, recallAtK: claimCount === 0 ? 0 : expectedHits / claimCount },
    arms: results,
  };
}

// A provider module's default export, or its `provider` export, is an EmbeddingProvider.
async function loadProvider(path: string): Promise<EmbeddingProvider> {
  const mod = (await import(pathToFileURL(resolve(path)).href)) as {
    default?: EmbeddingProvider;
    provider?: EmbeddingProvider;
  };
  const provider = mod.default ?? mod.provider;
  if (provider === undefined || typeof provider.embed !== 'function' || !provider.identity) {
    throw new UsageError(`${path} exports no EmbeddingProvider (default or provider)`);
  }
  return provider;
}

export async function retrievalEval(
  args: string[],
  io: Pick<CliIo, 'out' | 'err'>,
): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    options: {
      corpus: { type: 'string' },
      out: { type: 'string' },
      provider: { type: 'string' },
      'fill-to-k': { type: 'boolean' },
    },
  });
  if (positionals.length > 0 || values.corpus === undefined || values.out === undefined) {
    throw new UsageError(
      'dunstan-eval retrieval --corpus <dir> --out <file> [--fill-to-k] [--provider <module>]',
    );
  }
  const provider = values.provider === undefined ? undefined : await loadProvider(values.provider);
  const result = await evaluate(loadCorpus(values.corpus), provider, {
    fillToK: values['fill-to-k'] === true,
  });
  writeFileSync(values.out, `${JSON.stringify(result, null, 2)}\n`);
  for (const [arm, r] of Object.entries(result.arms)) {
    io.out(
      `arm ${arm}: recall@${result.k} ${r.hits}/${r.claims} (${r.recallAtK.toFixed(3)}), ` +
        `no candidate ${r.empty}/${r.claims}\n`,
    );
  }
  io.out(`chance: recall@${result.k} ${result.chance.recallAtK.toFixed(3)}\n`);
  io.out(`wrote ${values.out}\n`);
  return 0;
}
