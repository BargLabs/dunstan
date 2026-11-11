// A command line line as an MCP caller reads it, rebuilt from the phrase table alone
// (src/template/wording.ts): every pair's `cli` text replaced by its `mcp` text, longest `cli` text
// first, so a phrase that holds a shorter one (the whole no-tests note holds "run dunstan template
// again") is replaced whole. A test that compares this with what the tool returned holds the two
// wordings to the same sentences: they may differ by the table, and by nothing else.

import { PHRASES } from '../template/wording.js';

const PAIRS = Object.values(PHRASES).sort((a, b) => b.cli.length - a.cli.length);

export function asMcp(cliText: string): string {
  let text = cliText;
  for (const { cli, mcp } of PAIRS) text = text.replaceAll(cli, mcp);
  return text;
}

// What no text an MCP caller reads may hold: a flag, or the command `dunstan template ` (the
// trailing space lets dunstan_template_handback through).
export const NAMES_A_FLAG = /--tests|--base|--repo|dunstan template /;
