// What each overall verdict shows, and what it does not (spec section 8.2, informative). One line
// each, printed beside the verdict by the CLI's table, the MCP tool's table and the Action's summary.
// The record holds none of it: a record states a verdict and no prose about it (spec section 2).

import type { Verdict } from '../check/types.js';

export const VERDICT_LIMITS: Readonly<Record<Verdict, string>> = {
  pass: 'A pass shows that the record agrees with every claim the block declares. It does not show that the change is correct, that the tests are the right ones, or anything the block does not declare.',
  fail: 'A fail shows that the record contradicts the block in at least one row. It does not show that the change itself is wrong.',
  unverifiable:
    'An unverifiable verdict shows that the record cannot settle the block. It is not evidence that a claim is false, nor that it is true.',
};
