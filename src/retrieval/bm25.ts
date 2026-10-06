// BM25 (Robertson and Zaragoza, 2009) over the record items' text, implemented here: no model, no
// network, no dependency. The same items and the same claim give the same scores on every machine.

export const BM25_K1 = 1.2;
export const BM25_B = 0.75;

// A small fixed list. Words this common carry no evidence of which item a claim is about.
const STOPWORDS = new Set([
  'a',
  'all',
  'also',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'been',
  'by',
  'did',
  'do',
  'for',
  'from',
  'had',
  'has',
  'have',
  'in',
  'into',
  'is',
  'it',
  'its',
  'now',
  'of',
  'on',
  'or',
  'so',
  'that',
  'the',
  'then',
  'there',
  'these',
  'this',
  'those',
  'to',
  'was',
  'were',
  'which',
  'with',
]);

// A plural and a singular are one term. Nothing else is stemmed.
function stem(token: string): string {
  return token.length > 3 && token.endsWith('s') && !token.endsWith('ss')
    ? token.slice(0, -1)
    : token;
}

// Splits camelCase and every run of characters that are not letters or digits, lowercases, and drops
// one-character tokens and stopwords. "src/storage/blobStore.ts" gives src, storage, blob, store.
export function tokenize(text: string): string[] {
  return text
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem);
}

export class Bm25Index {
  private readonly termFrequencies: Map<string, number>[];
  private readonly lengths: number[];
  private readonly averageLength: number;
  private readonly documentFrequency = new Map<string, number>();

  constructor(documents: readonly (readonly string[])[]) {
    this.termFrequencies = documents.map((tokens) => {
      const tf = new Map<string, number>();
      for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const t of tf.keys())
        this.documentFrequency.set(t, (this.documentFrequency.get(t) ?? 0) + 1);
      return tf;
    });
    this.lengths = documents.map((tokens) => tokens.length);
    const total = this.lengths.reduce((sum, n) => sum + n, 0);
    this.averageLength = documents.length === 0 ? 0 : total / documents.length;
  }

  // The Lucene form, which is never negative: ln(1 + (N - n + 0.5) / (n + 0.5)).
  idf(term: string): number {
    const n = this.documentFrequency.get(term) ?? 0;
    const N = this.termFrequencies.length;
    return Math.log(1 + (N - n + 0.5) / (n + 0.5));
  }

  // One score per document. Each distinct query term counts once, so repeating a word in a claim
  // does not inflate a score.
  scores(query: readonly string[]): number[] {
    const terms = [...new Set(query)];
    return this.termFrequencies.map((tf, i) => {
      const length = this.lengths[i] ?? 0;
      const norm =
        this.averageLength === 0 ? 1 : 1 - BM25_B + (BM25_B * length) / this.averageLength;
      let score = 0;
      for (const term of terms) {
        const f = tf.get(term);
        if (f === undefined) continue;
        score += (this.idf(term) * (f * (BM25_K1 + 1))) / (f + BM25_K1 * norm);
      }
      return score;
    });
  }
}
