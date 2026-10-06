// Shared by the retrieval, reader-claim and eval tests: the synthetic corpus in
// test/retrieval-corpus/, a full evidence snapshot built from one of its cases, and a test double
// for the embedding seam.

import { readFileSync } from 'node:fs';
import type { Evidence } from '../check/types.js';
import type { CorpusCase } from '../eval/retrieval.js';
import { tokenize } from '../retrieval/bm25.js';
import type { EmbeddingProvider } from '../retrieval/embedding.js';

export const REPO = 'example-org/example-repo';
export const CORPUS_DIR = new URL('../../test/retrieval-corpus/', import.meta.url);

export function corpusCase(name: string): CorpusCase {
  return JSON.parse(readFileSync(new URL(`${name}.json`, CORPUS_DIR), 'utf8')) as CorpusCase;
}

// A corpus case's items as a record's evidence: the pull request read, no sources.
export function caseEvidence(name: string): Evidence {
  const c = corpusCase(name);
  const head = c.evidence.checkRuns?.status === 'ok' ? c.evidence.checkRuns.commit : '0'.repeat(40);
  return {
    pullRequest: {
      status: 'ok',
      number: 7,
      state: 'open',
      merged: false,
      mergedAt: null,
      headSha: head,
      mergeSha: null,
      changedFiles: c.evidence.files?.status === 'ok' ? c.evidence.files.entries.length : 0,
    },
    ...c.evidence,
    sources: [],
  };
}

// A deterministic stand-in for an embedding model: hashed bags of words. It exists to exercise the
// seam; Dunstan ships no provider.
export const testDoubleProvider: EmbeddingProvider = {
  identity: { name: 'test-double-bag-of-words', digest: '0'.repeat(64) },
  async embed(texts) {
    return texts.map((text) => {
      const v = new Array<number>(64).fill(0);
      for (const t of tokenize(text)) {
        let h = 0;
        for (const ch of t) h = (h * 31 + (ch.codePointAt(0) ?? 0)) % 64;
        v[h] = (v[h] ?? 0) + 1;
      }
      return v;
    });
  },
};
