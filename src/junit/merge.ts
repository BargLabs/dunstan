// dunstan junit-merge: one JUnit file from several, for a test runner that writes one per test class
// (Maven Surefire's TEST-*.xml, Gradle's build/test-results/test/*.xml), so that a `junit` record
// (spec section 4) can name the one file its counts are read from.
//
// The inputs are read in code-unit order of path, so any order on the command line gives the same
// bytes. Each must be well-formed JUnit as src/evidence/junit.ts reads one (a DOCTYPE is refused).
// The output's root is <testsuites>, holding each input's <testsuites> children, or its <testsuite>
// root, copied as substrings of the input, never re-serialised. The merged file is read back with
// the same reader, and it is refused unless its counts are the sum of the inputs'. No second parser.

import { compareCodeUnits } from '../check/rows.js';
import { type JunitCounts, JunitError, scanJunit } from '../evidence/junit.js';

export class JunitMergeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JunitMergeError';
  }
}

export interface JunitInput {
  // The path as given; it orders the inputs and names one in a refusal.
  path: string;
  xml: string;
}

export interface MergedJunit {
  xml: string;
  counts: JunitCounts;
}

const HEADER = '<?xml version="1.0" encoding="UTF-8"?>';

export function mergeJunit(
  inputs: readonly JunitInput[],
  // Reads the merged file's counts; a test stands in a reader that miscounts.
  count: (xml: string) => JunitCounts = (xml) => scanJunit(xml),
): MergedJunit {
  if (inputs.length === 0) throw new JunitMergeError('no input: name one or more JUnit files');
  const sorted = [...inputs].sort((a, b) => compareCodeUnits(a.path, b.path));
  sorted.forEach((input, i) => {
    if (i > 0 && sorted[i - 1]?.path === input.path) {
      throw new JunitMergeError(`${input.path} is given twice`);
    }
  });

  const sum: JunitCounts = { executed: 0, failed: 0 };
  const parts = sorted.map((input) => {
    let scan: ReturnType<typeof scanJunit>;
    try {
      scan = scanJunit(input.xml);
    } catch (e) {
      if (e instanceof JunitError) throw new JunitMergeError(`${input.path}: ${e.message}`);
      throw e;
    }
    sum.executed += scan.executed;
    sum.failed += scan.failed;
    const { root } = scan;
    return root.name === 'testsuites'
      ? input.xml.slice(root.contentStart, root.contentEnd)
      : input.xml.slice(root.start, root.end);
  });

  const xml = [HEADER, '<testsuites>', ...parts, '</testsuites>', ''].join('\n');
  let merged: JunitCounts;
  try {
    merged = count(xml);
  } catch (e) {
    if (e instanceof JunitError) throw new JunitMergeError(`the merged file: ${e.message}`);
    throw e;
  }
  if (merged.executed !== sum.executed || merged.failed !== sum.failed) {
    throw new JunitMergeError(
      `the merged file counts ${merged.executed} executed and ${merged.failed} failed; the inputs sum to ${sum.executed} and ${sum.failed}`,
    );
  }
  return { xml, counts: sum };
}
