// The checker core: claim rows and the overall verdict as pure functions of (block, evidence). No
// I/O, no clock, no randomness. The subject repository is the one other input: `#N` in a block names
// issue N of the repository the record is about.

import { overallVerdict } from '../spec/record.js';
import { checkCounts, checkHead, checkReferences, checkScope, checkTime } from './checks.js';
import type { Block, Claim, Evidence } from './types.js';

export { countedCheckRuns, qualifyIssue, sameIssue } from './checks.js';
export type * from './types.js';
export { overallVerdict };

// Rows come out in the order spec section 7.1 fixes: head; scope rows in block order, then omission
// rows in code-unit order of path; references in block order; test counts per tests[] item (count,
// then failures), then checks.total, then checks.allSucceeded; mergedAt; deployedAt. The order is a
// function of the block and the evidence only, so two machines write the same claims array.
export function runChecks(block: Block, evidence: Evidence, repository: string): Claim[] {
  return [
    ...checkHead(block, evidence),
    ...checkScope(block, evidence),
    ...checkReferences(block, evidence, repository),
    ...checkCounts(block, evidence),
    ...checkTime(block, evidence),
  ];
}
